#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
MyLaps UDP Tools - Centro unificado de herramientas para escaneo, registro y análisis UDP
---------------------------------------------------------------------------------------
Punto de entrada        # Vincular evento de selección
        self.tools_list.bind('<<ListboxSelect>>', self._on_tool_selected)nico para todas las funcionalidades MyLaps:
- Escáner de red para detectar transmisores UDP
- Logger de datos raw para guardar información por sesiones
- Herramientas de ingeniería inversa y monitoreo
- Utilidades de análisis y consulta
"""

import os
import sys
import time
import argparse
import threading
import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext, font
import subprocess
from typing import Dict, Any, List, Optional, Callable

# Asegurar que todos los módulos son importables
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

# Verificar dependencias y mostrar advertencias
DEPENDENCIES = {
    "scapy": False,
    "nmap": False,
    "pillow": False,
    "pyinstaller": False
}

try:
    import importlib.util
    if importlib.util.find_spec("scapy"):
        DEPENDENCIES["scapy"] = True
except ImportError:
    pass

try:
    if importlib.util.find_spec("nmap"):
        DEPENDENCIES["nmap"] = True
except ImportError:
    pass

try:
    if importlib.util.find_spec("PIL"):
        DEPENDENCIES["pillow"] = True
except ImportError:
    pass

try:
    if importlib.util.find_spec("PyInstaller"):
        DEPENDENCIES["pyinstaller"] = True
except ImportError:
    pass

# Importaciones específicas para las funcionalidades existentes
try:
    from mylaps import config
    from mylaps import utils
    from mylaps.advanced_udp_scanner import run_scanner_cli
    from mylaps.udp_scanner_gui import main as run_scanner_gui
    from mylaps.udp_data_logger import UdpDataLogger, create_udp_logger
    MYLAPS_AVAILABLE = True
except ImportError:
    MYLAPS_AVAILABLE = False
    print("AVISO: Módulos MyLaps core no disponibles")

class RedirectText:
    """Clase para redirigir la salida de texto a un widget de Tkinter"""
    
    def __init__(self, text_widget):
        """
        Inicializa el redireccionador de texto
        
        Args:
            text_widget: Widget de texto donde mostrar la salida
        """
        self.text_widget = text_widget
        self.buffer = ""
        
    def write(self, string):
        """
        Escribe texto al widget
        
        Args:
            string: Texto a escribir
        """
        self.buffer += string
        # Si detectamos un salto de línea, enviamos el texto al widget
        if '\n' in self.buffer:
            self.text_widget.config(state=tk.NORMAL)
            lines = self.buffer.split('\n')
            for i, line in enumerate(lines[:-1]):
                if line.strip():  # Solo agregar líneas no vacías
                    self.text_widget.insert(tk.END, line + '\n')
            self.buffer = lines[-1]
            # Mantener el scroll en la parte inferior
            self.text_widget.see(tk.END)
            self.text_widget.config(state=tk.DISABLED)
        
    def flush(self):
        """Fuerza la escritura del buffer"""
        if self.buffer:
            self.text_widget.config(state=tk.NORMAL)
            self.text_widget.insert(tk.END, self.buffer)
            self.buffer = ""
            self.text_widget.see(tk.END)
            self.text_widget.config(state=tk.DISABLED)

class MyLapsToolsApp:
    """Aplicación principal que integra todas las herramientas"""
    
    def __init__(self, root):
        """
        Inicializa la aplicación principal
        
        Args:
            root: Ventana raíz de Tkinter
        """
        self.root = root
        self.root.title("MyLaps UDP Tools")
        self.root.geometry("1000x700")
        self.root.minsize(900, 650)
        
        # TEMA EXTRA-CLARO para máxima visibilidad
        self.bg_color = "#ffffff"      # Blanco puro para máximo contraste
        self.fg_color = "#000000"      # Negro
        self.accent_color = "#0066cc"  # Azul
        self.heading_color = "#003366" # Azul oscuro para títulos
        self.button_bg = "#e0e0e0"     # Gris más claro para fondos
        self.button_active = "#d1d1d1" # Gris para botones activos
        self.highlight_color = "#4a8af4"  # Azul brillante para resaltados
        
        # Colores para estados
        self.success_color = "#00aa00" # Verde brillante
        self.error_color = "#ff0000"   # Rojo brillante
        self.warning_color = "#ff6600" # Naranja
        
        # Fuentes personalizadas - Usar fuentes genéricas para máxima compatibilidad
        default_font = font.nametofont("TkDefaultFont")
        default_size = default_font.cget("size") + 2  # Aumentar el tamaño
        
        self.title_font = ("Arial", default_size + 8, "bold")
        self.heading_font = ("Arial", default_size + 4, "bold") 
        self.content_font = ("Arial", default_size + 2)
        self.button_font = ("Arial", default_size + 2, "bold")
        self.normal_font = ("Arial", default_size + 2)
        self.mono_font = ("Courier", default_size + 2)
        
        # Configurar el color de fondo de la ventana principal
        self.root.configure(background=self.bg_color)
        
        # Variables de aplicación
        self.current_process = None
        self.process_thread = None
        self.is_running = False
        self.tools_data = {}
        
        # Crear estructura de la interfaz
        self._create_widgets()
        
        # Centrar la ventana
        self._center_window()
        
        # Configurar cierre de la ventana
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)
        
        # Mostrar un mensaje inicial para confirmar que la interfaz está funcionando
        self.output_text.config(state=tk.NORMAL)
        self.output_text.insert(tk.END, "MyLaps UDP Tools v1.0\n")
        self.output_text.insert(tk.END, "================================\n\n")
        self.output_text.insert(tk.END, "Selecciona una herramienta del panel izquierdo y haz clic en 'Ejecutar herramienta'\n\n")
        self.output_text.config(state=tk.DISABLED)
        
        # Actualizar después de la inicialización para garantizar que todo se muestre
        self.root.update()
    
    def _create_widgets(self):
        """Crea todos los widgets de la interfaz"""
        # Panel principal
        main_frame = tk.Frame(self.root, padx=20, pady=20, bg=self.bg_color)
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        # Banner superior con borde inferior y colores ultra-contrastantes
        banner_frame = tk.Frame(
            main_frame, 
            bg="#0066cc",  # Fondo azul para el banner
            bd=2, 
            relief=tk.RAISED,
            padx=15,
            pady=15
        )
        banner_frame.pack(fill=tk.X, pady=(0, 20), padx=5)
        
        # Título grande con máximo contraste
        title_label = tk.Label(
            banner_frame, 
            text="MyLaps UDP Tools", 
            font=("Arial", 24, "bold"),
            fg="#FFFFFF",  # Texto blanco para máximo contraste
            bg="#0066cc"   # Fondo azul
        )
        title_label.pack(side=tk.LEFT)
        
        # Versión visible
        version_label = tk.Label(
            banner_frame, 
            text="v1.0", 
            font=("Arial", 18),
            fg="#FFFFFF",  # Texto blanco
            bg="#0066cc"   # Fondo azul
        )
        version_label.pack(side=tk.LEFT, padx=(10, 0), pady=(10, 0))
        
        # Marco dividido con paneles bien definidos
        content_frame = tk.Frame(main_frame, bg=self.bg_color)
        content_frame.pack(fill=tk.BOTH, expand=True)
        
        # Panel izquierdo (herramientas)
        left_frame = tk.Frame(
            content_frame, 
            bg=self.bg_color, 
            width=350,
            bd=1,
            relief=tk.GROOVE
        )
        left_frame.pack(side=tk.LEFT, fill=tk.BOTH, expand=False, padx=(5, 10), pady=5)
        left_frame.pack_propagate(False)  # Mantener el ancho solicitado
        
        # Panel derecho (salida)
        right_frame = tk.Frame(
            content_frame, 
            bg=self.bg_color, 
            bd=1,
            relief=tk.GROOVE
        )
        right_frame.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True, padx=(10, 5), pady=5)
        
        # Título de sección: Herramientas
        tools_header = tk.Label(
            left_frame,
            text="HERRAMIENTAS DISPONIBLES",
            font=self.heading_font,
            fg=self.heading_color,
            bg=self.bg_color,
            anchor=tk.W,
            padx=10,
            pady=10
        )
        tools_header.pack(fill=tk.X)
        
        # Contenedor para la lista de herramientas
        tools_container = tk.Frame(
            left_frame,
            bg=self.bg_color,
            padx=10,
            pady=5
        )
        tools_container.pack(fill=tk.BOTH, expand=True)
        
        # Lista de herramientas como botones individuales en lugar de listbox
        # Creamos un canvas con scrollbar para los botones
        tools_canvas = tk.Canvas(
            tools_container,
            bg=self.bg_color,
            bd=0,
            highlightthickness=0
        )
        tools_scroll = tk.Scrollbar(tools_container, orient="vertical", command=tools_canvas.yview)
        tools_scroll.pack(side=tk.RIGHT, fill=tk.Y)
        
        tools_canvas.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        tools_canvas.configure(yscrollcommand=tools_scroll.set)
        
        # Frame para contener los botones dentro del canvas
        self.tools_frame = tk.Frame(tools_canvas, bg=self.bg_color)
        tools_canvas.create_window((0, 0), window=self.tools_frame, anchor="nw", tags="self.tools_frame")
        
        # Configurar el scroll del canvas
        def _on_frame_configure(event):
            tools_canvas.configure(scrollregion=tools_canvas.bbox("all"))
            
        self.tools_frame.bind("<Configure>", _on_frame_configure)
        
        # Cargar herramientas en la lista
        self._populate_tools_list()
        
        # Nota: El evento de selección se vincula dentro de populate_tools_list
        
        # Espacio para descripción de la herramienta con colores contrastantes
        # Descripción de la herramienta - título
        desc_header = tk.Label(
            left_frame,
            text="DESCRIPCIÓN",
            font=self.heading_font,
            fg=self.heading_color,
            bg=self.bg_color,
            anchor=tk.W,
            padx=10,
            pady=5
        )
        desc_header.pack(fill=tk.X)
        
        # Marco para la descripción
        desc_frame = tk.Frame(
            left_frame,
            bg=self.bg_color,
            padx=10,
            pady=5
        )
        desc_frame.pack(fill=tk.BOTH, expand=False)
        
        # Texto de descripción con colores de máximo contraste
        self.desc_text = tk.Text(
            desc_frame, 
            wrap=tk.WORD, 
            height=5, 
            width=30, 
            font=self.normal_font, 
            bg="#000000",  # Fondo negro para máximo contraste
            fg="#ffffff",  # Texto blanco 
            insertbackground="#ffffff",
            padx=10,
            pady=10,
            borderwidth=1,
            relief=tk.SUNKEN
        )
        self.desc_text.pack(fill=tk.BOTH, expand=True)
        self.desc_text.config(state=tk.DISABLED)
        
        # Estado de dependencias - título
        deps_header = tk.Label(
            left_frame,
            text="DEPENDENCIAS",
            font=self.heading_font,
            fg=self.heading_color,
            bg=self.bg_color,
            anchor=tk.W,
            padx=10,
            pady=5
        )
        deps_header.pack(fill=tk.X)
        
        # Marco para las dependencias
        deps_frame = tk.Frame(
            left_frame,
            bg=self.bg_color,
            padx=10,
            pady=5
        )
        deps_frame.pack(fill=tk.X)
        
        # Mostrar estado de cada dependencia con iconos claros
        for dep, installed in DEPENDENCIES.items():
            status = "INSTALADO ✓" if installed else "NO INSTALADO ✗"
            color = self.success_color if installed else self.error_color
            
            dep_frame = tk.Frame(deps_frame, bg=self.bg_color)
            dep_frame.pack(fill=tk.X, pady=2)
            
            dep_name = tk.Label(
                dep_frame, 
                text=dep, 
                width=12,
                fg=self.fg_color,
                bg=self.bg_color,
                font=self.normal_font,
                anchor=tk.W
            )
            dep_name.pack(side=tk.LEFT, padx=(0, 10))
            
            dep_status = tk.Label(
                dep_frame, 
                text=status, 
                fg=color,
                bg=self.bg_color,
                font=self.normal_font,
                anchor=tk.W
            )
            dep_status.pack(side=tk.LEFT)
        
        # Sección de botones de acción
        buttons_frame = tk.Frame(left_frame, bg=self.bg_color, pady=15)
        buttons_frame.pack(fill=tk.X, pady=15, padx=10, side=tk.BOTTOM)
        
        # Botones grandes, con más espacio y colores ultra-contrastantes
        self.run_btn = tk.Button(
            buttons_frame, 
            text="EJECUTAR HERRAMIENTA", 
            command=self._run_selected_tool,
            state=tk.NORMAL,
            bg="#0066cc",  # Azul brillante
            fg="#FFFFFF",  # Blanco puro
            activebackground="#0055aa",
            activeforeground="#FFFFFF",
            relief=tk.RAISED,
            padx=20,
            pady=10,
            font=self.button_font,
            borderwidth=3,
            cursor="hand2",  # Cursor de mano al pasar sobre el botón
            height=2  # Botón más alto
        )
        self.run_btn.pack(side=tk.TOP, fill=tk.X, expand=True, pady=(0, 10))
        
        self.stop_btn = tk.Button(
            buttons_frame, 
            text="DETENER", 
            command=self._stop_current_process,
            state=tk.DISABLED,
            bg="#cc3333",  # Rojo brillante
            fg="#FFFFFF",  # Blanco puro
            activebackground="#aa2222",
            activeforeground="#FFFFFF",
            relief=tk.RAISED,
            padx=20,
            pady=10,
            font=self.button_font,
            borderwidth=3,
            cursor="hand2",
            height=2  # Botón más alto
        )
        self.stop_btn.pack(side=tk.TOP, fill=tk.X, expand=True)
        
        # Título de panel de salida
        output_header = tk.Label(
            right_frame,
            text="SALIDA",
            font=self.heading_font,
            fg=self.heading_color,
            bg=self.bg_color,
            anchor=tk.W,
            padx=15,
            pady=10
        )
        output_header.pack(fill=tk.X)
        
        # Marco para el área de texto
        output_frame = tk.Frame(
            right_frame,
            bg=self.bg_color,
            padx=15,
            pady=10
        )
        output_frame.pack(fill=tk.BOTH, expand=True)
        
        # Área de texto con scroll para salida - colores de máximo contraste posible
        self.output_text = scrolledtext.ScrolledText(
            output_frame, 
            wrap=tk.WORD, 
            font=("Courier New", 14),  # Fuente monoespaciada grande
            bg="#000000",  # Negro absoluto
            fg="#00ff00",  # Verde brillante para máximo contraste
            insertbackground="#ffffff",
            padx=15,
            pady=15,
            borderwidth=2,
            relief=tk.SUNKEN
        )
        self.output_text.pack(fill=tk.BOTH, expand=True)
        self.output_text.config(state=tk.DISABLED)
        
        # Redirigir stdout al widget de texto
        self.stdout_redirect = RedirectText(self.output_text)
        sys.stdout = self.stdout_redirect
        
        # Título de panel de opciones
        options_header = tk.Label(
            right_frame,
            text="OPCIONES",
            font=self.heading_font,
            fg=self.heading_color,
            bg=self.bg_color,
            anchor=tk.W,
            padx=15,
            pady=10
        )
        options_header.pack(fill=tk.X)
        
        # Marco para opciones
        options_frame = tk.Frame(
            right_frame,
            bg=self.bg_color,
            padx=15,
            pady=10,
            bd=2,
            relief=tk.GROOVE
        )
        options_frame.pack(fill=tk.X, padx=15, pady=(0, 15))
        
        # Variables para opciones comunes
        self.port_var = tk.StringVar(value="5403")
        self.cidr_var = tk.StringVar(value="24")
        self.duration_var = tk.StringVar(value="20")
        
        # Grid para opciones - etiquetas y campos muy grandes para máxima visibilidad
        options_inner_frame = tk.Frame(options_frame, bg=self.bg_color, padx=15, pady=15)
        options_inner_frame.pack(fill=tk.X)
        
        # Etiquetas con fuentes grandes
        tk.Label(
            options_inner_frame, 
            text="PUERTO UDP:", 
            bg=self.bg_color, 
            fg=self.fg_color,
            font=self.button_font
        ).grid(row=0, column=0, sticky=tk.W, padx=10, pady=10)
        
        # Entradas con bordes muy visibles y colores contrastantes
        tk.Entry(
            options_inner_frame, 
            textvariable=self.port_var, 
            width=8, 
            bg="#ffffff",  # Fondo blanco
            fg="#000000",  # Texto negro
            insertbackground="#000000",
            font=self.button_font,
            borderwidth=2,
            relief=tk.SUNKEN
        ).grid(row=0, column=1, sticky=tk.W, padx=10, pady=10)
        
        tk.Label(
            options_inner_frame, 
            text="CIDR:", 
            bg=self.bg_color, 
            fg=self.fg_color,
            font=self.button_font
        ).grid(row=0, column=2, sticky=tk.W, padx=10, pady=10)
        
        tk.Entry(
            options_inner_frame, 
            textvariable=self.cidr_var, 
            width=4, 
            bg="#ffffff", 
            fg="#000000",
            insertbackground="#000000",
            font=self.button_font,
            borderwidth=2,
            relief=tk.SUNKEN
        ).grid(row=0, column=3, sticky=tk.W, padx=10, pady=10)
        
        tk.Label(
            options_inner_frame, 
            text="DURACIÓN (s):", 
            bg=self.bg_color, 
            fg=self.fg_color,
            font=self.button_font
        ).grid(row=0, column=4, sticky=tk.W, padx=10, pady=10)
        
        tk.Entry(
            options_inner_frame, 
            textvariable=self.duration_var, 
            width=6, 
            bg="#ffffff", 
            fg="#000000",
            insertbackground="#000000",
            font=self.button_font,
            borderwidth=2,
            relief=tk.SUNKEN
        ).grid(row=0, column=5, sticky=tk.W, padx=10, pady=10)
        
        # Barra de estado extra grande y super visible
        self.status_var = tk.StringVar(value="LISTO - SELECCIONE UNA HERRAMIENTA")
        status_bar = tk.Label(
            main_frame, 
            textvariable=self.status_var, 
            relief=tk.SUNKEN, 
            anchor=tk.W,
            bg="#000000",  # Fondo negro
            fg="#ffcc00",  # Amarillo/dorado para el estado
            padx=15,
            pady=10,
            font=("Arial", 14, "bold"),  # Fuente grande y negrita
            borderwidth=2,
            height=2  # Altura extra
        )
        status_bar.pack(side=tk.BOTTOM, fill=tk.X, pady=(15, 0))
    
    def _center_window(self):
        """Centra la ventana en la pantalla"""
        self.root.update_idletasks()
        width = self.root.winfo_width()
        height = self.root.winfo_height()
        x = (self.root.winfo_screenwidth() // 2) - (width // 2)
        y = (self.root.winfo_screenheight() // 2) - (height // 2)
        self.root.geometry(f"{width}x{height}+{x}+{y}")
    
    def _populate_tools_list(self):
        """Carga las herramientas disponibles como botones"""
        # Estructura para almacenar información de herramientas
        self.available_tools = []
        
        # CATEGORÍA: Escaneo de red
        category_label = tk.Label(
            self.tools_frame,
            text="ESCANEO DE RED",
            font=self.heading_font,
            fg=self.accent_color,
            bg=self.bg_color,
            anchor="w",
            padx=5,
            pady=5
        )
        category_label.pack(fill=tk.X, pady=(10, 5))
        
        self.available_tools.extend([
            {"id": "advanced_udp_scanner", "name": "Scanner UDP avanzado", 
             "desc": "Escaneo avanzado de puertos UDP en la red local"},
            {"id": "udp_scanner_gui", "name": "Scanner UDP gráfico", 
             "desc": "Interfaz gráfica para escaneo de red"}
        ])
        
        # CATEGORÍA: Registro y monitoreo
        category_label = tk.Label(
            self.tools_frame,
            text="REGISTRO Y MONITOREO",
            font=self.heading_font,
            fg=self.accent_color,
            bg=self.bg_color,
            anchor="w",
            padx=5,
            pady=5
        )
        category_label.pack(fill=tk.X, pady=(20, 5))
        
        self.available_tools.extend([
            {"id": "udp_data_logger", "name": "Logger UDP", 
             "desc": "Guardar datos UDP brutos en archivos"},
            {"id": "udp_logger_gui", "name": "Logger UDP gráfico", 
             "desc": "Interfaz gráfica para registrar datos UDP"},
            {"id": "udp_monitor_logger", "name": "Monitor UDP integrado", 
             "desc": "Detección y registro automático de transmisiones UDP"}
        ])
        
        # CATEGORÍA: Herramientas integradas
        category_label = tk.Label(
            self.tools_frame,
            text="HERRAMIENTAS INTEGRADAS",
            font=self.heading_font,
            fg=self.accent_color,
            bg=self.bg_color,
            anchor="w",
            padx=5,
            pady=5
        )
        category_label.pack(fill=tk.X, pady=(20, 5))
        
        self.available_tools.extend([
            {"id": "reverse_engineer", "name": "MyLaps Reverse Engineer", 
             "desc": "Herramienta principal de ingeniería inversa"},
            {"id": "cloud_monitor", "name": "Cloud Sync Monitor", 
             "desc": "Monitor de sincronización en la nube"},
            {"id": "query_db", "name": "Database Query", 
             "desc": "Consultas a la base de datos"},
            {"id": "analytics", "name": "Race Analytics", 
             "desc": "Analíticas de carrera"}
        ])
        
        # CATEGORÍA: Utilidades
        category_label = tk.Label(
            self.tools_frame,
            text="UTILIDADES",
            font=self.heading_font,
            fg=self.accent_color,
            bg=self.bg_color,
            anchor="w",
            padx=5,
            pady=5
        )
        category_label.pack(fill=tk.X, pady=(20, 5))
        
        self.available_tools.extend([
            {"id": "build_executable", "name": "Empaquetar aplicación", 
             "desc": "Crear ejecutable con PyInstaller"}
        ])
        
        # Crear botones para cada herramienta
        for tool in self.available_tools:
            tool_btn = tk.Button(
                self.tools_frame,
                text=tool['name'],
                bg=self.button_bg,
                fg=self.fg_color,
                activebackground=self.highlight_color,
                activeforeground=self.fg_color,
                font=self.normal_font,
                anchor="w",
                padx=10,
                pady=8,
                bd=1,
                relief=tk.RAISED,
                cursor="hand2",
                width=25,
                command=lambda t=tool: self.on_tool_select(t)
            )
            tool_btn.pack(fill=tk.X, pady=2, padx=5)
        
    def on_tool_select(self, tool):
        """Maneja la selección de una herramienta mediante botón
        
        Args:
            tool: Diccionario con información de la herramienta
        """
        # Actualizar descripción y habilitar botón
        self._update_description(tool["desc"])
        self.run_btn.config(state=tk.NORMAL)
        self.status_var.set(f"Listo - Herramienta seleccionada: {tool['id']}")
        
        # Almacenar herramienta seleccionada
        self.selected_tool = tool
    
    def _update_description(self, desc_text):
        """Actualiza el cuadro de descripción de la herramienta"""
        self.desc_text.config(state=tk.NORMAL)
        self.desc_text.delete(1.0, tk.END)
        self.desc_text.insert(tk.END, desc_text)
        self.desc_text.config(state=tk.DISABLED)
    
    def _run_selected_tool(self):
        """Ejecuta la herramienta seleccionada"""
        if self.is_running:
            messagebox.showwarning("Aviso", "Ya hay una herramienta ejecutándose")
            return
            
        # Verificar si hay una herramienta seleccionada
        if not hasattr(self, 'selected_tool'):
            messagebox.showinfo("Información", "Por favor, selecciona una herramienta primero")
            return
        
        # Ejecutar la herramienta usando la función común
        self._run_tool_by_id(self.selected_tool["id"])
    
    def _run_tool_by_id(self, tool_id):
        """
        Ejecuta una herramienta directamente por su ID
        
        Args:
            tool_id: Identificador de la herramienta
        """
        # Actualizar estado de la interfaz
        self.is_running = True
        self.run_btn.config(state=tk.DISABLED)
        self.stop_btn.config(state=tk.NORMAL)
        
        # Limpiar área de salida
        self.output_text.config(state=tk.NORMAL)
        self.output_text.delete(1.0, tk.END)
        self.output_text.config(state=tk.DISABLED)
        
        # Iniciar en un hilo separado
        self.process_thread = threading.Thread(
            target=self._run_tool_process,
            args=(tool_id,),
            daemon=True
        )
        self.process_thread.start()
    
    def _run_tool_process(self, tool_id):
        """
        Ejecuta la herramienta en un proceso separado
        
        Args:
            tool_id: Identificador de la herramienta
        """
        try:
            # Configurar variables de estado
            self.status_var.set(f"Ejecutando: {tool_id}")
            print(f"=== Iniciando {tool_id} ===\n")
            
            # Ejecutar herramienta basada en el ID
            if tool_id == "advanced_udp_scanner":
                self._run_advanced_scanner()
            elif tool_id == "udp_scanner_gui":
                self._run_udp_scanner_gui()
            elif tool_id == "udp_data_logger":
                self._run_udp_data_logger()
            elif tool_id == "udp_logger_gui":
                self._run_udp_logger_gui()
            elif tool_id == "udp_monitor_logger":
                self._run_udp_monitor_logger()
            elif tool_id == "reverse_engineer":
                self._run_reverse_engineer()
            elif tool_id == "cloud_monitor":
                self._run_cloud_monitor()
            elif tool_id == "query_db":
                self._run_query_db()
            elif tool_id == "analytics":
                self._run_analytics()
            elif tool_id == "build_executable":
                self._run_build_executable()
            else:
                print(f"Herramienta '{tool_id}' no implementada")
            
        except Exception as e:
            print(f"Error ejecutando {tool_id}: {e}")
            import traceback
            traceback.print_exc()
            
        finally:
            # Restaurar estado
            self.is_running = False
            self.current_process = None
            
            # Actualizar interfaz desde el hilo principal
            self.root.after(0, self._reset_ui_after_run)
    
    def _reset_ui_after_run(self):
        """Restaura la interfaz después de ejecutar una herramienta"""
        self.status_var.set("Listo")
        self.run_btn.config(state=tk.NORMAL)
        self.stop_btn.config(state=tk.DISABLED)
        
        print("\n=== Ejecución finalizada ===")
    
    def _stop_current_process(self):
        """Detiene el proceso actual"""
        if not self.is_running or not self.current_process:
            return
            
        try:
            print("\nDeteniendo proceso...")
            self.current_process.terminate()
        except Exception as e:
            print(f"Error al detener el proceso: {e}")
            
        self.is_running = False
        self.status_var.set("Proceso detenido")
        self.run_btn.config(state=tk.NORMAL)
        self.stop_btn.config(state=tk.DISABLED)
    
    def _run_external_python_script(self, script_name: str, args: List[str] = None):
        """
        Ejecuta un script Python externo
        
        Args:
            script_name: Nombre del script a ejecutar
            args: Lista de argumentos para el script
        """
        # Construir ruta al script
        script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), script_name)
        
        if not os.path.exists(script_path):
            print(f"Error: No se encontró el script {script_path}")
            return
            
        # Preparar comando
        cmd = [sys.executable, script_path]
        if args:
            cmd.extend(args)
            
        # Ejecutar proceso
        print(f"Ejecutando: {' '.join(cmd)}")
        try:
            # Usar subprocess con stdout/stderr redirigidos
            self.current_process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                universal_newlines=True,
                bufsize=1
            )
            
            # Leer la salida línea por línea
            for line in self.current_process.stdout:
                print(line, end='')
                
            # Esperar a que termine el proceso
            exit_code = self.current_process.wait()
            print(f"Proceso finalizado con código: {exit_code}")
            
        except Exception as e:
            print(f"Error ejecutando el script: {e}")
    
    def _run_module_function(self, module_name: str, function_name: str, *args, **kwargs):
        """
        Ejecuta una función de un módulo Python
        
        Args:
            module_name: Nombre del módulo a importar
            function_name: Nombre de la función a ejecutar
            *args: Argumentos posicionales para la función
            **kwargs: Argumentos con nombre para la función
        """
        try:
            # Intentar importar el módulo
            module = __import__(module_name)
            
            # Obtener la función
            function = getattr(module, function_name)
            
            # Ejecutar la función
            print(f"Ejecutando {module_name}.{function_name}()...")
            result = function(*args, **kwargs)
            
            return result
            
        except ImportError:
            print(f"Error: No se pudo importar el módulo {module_name}")
        except AttributeError:
            print(f"Error: No se encontró la función {function_name} en el módulo {module_name}")
        except Exception as e:
            print(f"Error ejecutando {module_name}.{function_name}: {e}")
            import traceback
            traceback.print_exc()
    
    # Implementaciones específicas de las herramientas
    
    def _run_advanced_scanner(self):
        """Ejecuta el scanner UDP avanzado"""
        port = int(self.port_var.get())
        cidr = int(self.cidr_var.get())
        duration = int(self.duration_var.get())
        
        if MYLAPS_AVAILABLE:
            # Ejecutar la función directamente desde el paquete importado
            print(f"Ejecutando scanner UDP avanzado en puerto {port} (CIDR /{cidr}) durante {duration}s...")
            run_scanner_cli(port=port, cidr=cidr, duration=duration)
        else:
            print("Error: No se pudo importar el módulo advanced_udp_scanner desde mylaps")
            print("Intentando ejecutar script independiente...")
            
            args = [
                "--port", str(port),
                "--cidr", str(cidr),
                "--duration", str(duration)
            ]
            
            self._run_external_python_script("advanced_udp_scanner.py", args)
    
    def _run_udp_scanner_gui(self):
        """Ejecuta la interfaz gráfica del scanner UDP"""
        if MYLAPS_AVAILABLE:
            # Ejecutar en un proceso separado para permitir que tenga su propio bucle de eventos Tk
            import subprocess
            
            # Usar el wrapper script para garantizar compatibilidad
            script_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "udp_scanner_gui.py")
            
            if os.path.exists(script_path):
                self.current_process = subprocess.Popen(
                    [sys.executable, script_path],
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    universal_newlines=True
                )
                print("Aplicación scanner UDP iniciada en una ventana separada.")
            else:
                # Intentar usar directamente el módulo
                module_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mylaps", "udp_scanner_gui.py")
                if os.path.exists(module_path):
                    self.current_process = subprocess.Popen(
                        [sys.executable, module_path],
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT,
                        universal_newlines=True
                    )
                    print("Aplicación scanner UDP iniciada en una ventana separada.")
                else:
                    print(f"Error: No se encontraron los scripts necesarios")
        else:
            print("Error: No se pudo importar el módulo udp_scanner_gui desde mylaps")
            print("Intentando ejecutar script independiente...")
            self._run_external_python_script("udp_scanner_gui.py")
    
    def _run_udp_data_logger(self):
        """Ejecuta el logger de datos UDP"""
        port = int(self.port_var.get())
        
        if MYLAPS_AVAILABLE:
            # Crear y ejecutar logger
            print(f"Iniciando logger de datos UDP en puerto {port}...")
            
            logger = create_udp_logger(port=port)
            if logger.start():
                try:
                    while self.is_running:
                        time.sleep(1)
                        # Mostrar estadísticas cada 5 segundos
                        if hasattr(logger, 'packets_received') and logger.packets_received % 5 == 0 and logger.packets_received > 0:
                            stats = logger.get_stats()
                            print(f"Paquetes: {stats['packets_received']}, "
                                 f"Bytes: {stats['bytes_received']}")
                finally:
                    logger.stop()
        else:
            print("Error: No se pudo importar el módulo udp_data_logger desde mylaps")
            print("Intentando ejecutar script independiente...")
            
            args = ["--port", str(port)]
            self._run_external_python_script("udp_data_logger.py", args)
    
    def _run_udp_logger_gui(self):
        """Ejecuta la interfaz gráfica del logger UDP"""
        # Esta herramienta todavía no existe en el paquete
        print("Nota: La interfaz gráfica del logger UDP aún no está implementada")
        print("Ejecutando script independiente si existe...")
        self._run_external_python_script("udp_logger_gui.py")
    
    def _run_udp_monitor_logger(self):
        """Ejecuta el monitor UDP integrado con logger"""
        port = int(self.port_var.get())
        cidr = int(self.cidr_var.get())
        duration = int(self.duration_var.get())
        
        args = [
            "--port", str(port),
            "--cidr", str(cidr),
            "--time", str(duration),
            "--auto-start"
        ]
        
        self._run_external_python_script("udp_monitor_logger.py", args)
    
    def _run_reverse_engineer(self):
        """Ejecuta la herramienta principal de ingeniería inversa"""
        self._run_external_python_script("reverse_engineer.py")
    
    def _run_cloud_monitor(self):
        """Ejecuta el monitor de sincronización en la nube"""
        self._run_external_python_script("cloud_monitor.py", ["--sync"])
    
    def _run_query_db(self):
        """Ejecuta consultas a la base de datos"""
        self._run_external_python_script("query_db.py", ["summary"])
    
    def _run_analytics(self):
        """Ejecuta analíticas de carrera"""
        self._run_external_python_script("analytics.py", ["summary"])
    
    def _run_build_executable(self):
        """Ejecuta el empaquetado de la aplicación"""
        self._run_external_python_script("build_executable.py")
        
    def _on_close(self):
        """Maneja el cierre de la aplicación"""
        if self.is_running:
            if messagebox.askyesno("Confirmar", "Hay una herramienta en ejecución. ¿Desea detenerla y salir?"):
                self._stop_current_process()
                self.root.after(500, self.root.destroy)
        else:
            self.root.destroy()
        
        # Restaurar stdout
        sys.stdout = sys.__stdout__

# Función principal para iniciar la aplicación
def main():
    """Función principal que inicia la aplicación"""
    # Parsear argumentos de línea de comandos
    parser = argparse.ArgumentParser(description="MyLaps UDP Tools - Centro unificado de herramientas")
    parser.add_argument('--tool', help='Iniciar directamente una herramienta específica')
    parser.add_argument('--theme', choices=['light', 'dark'], default='dark', help='Tema de la interfaz (light/dark)')
    args = parser.parse_args()
    
    # Iniciar la aplicación
    root = tk.Tk()
    app = MyLapsToolsApp(root)
    
    # Si se especificó una herramienta, ejecutarla directamente
    if args.tool:
        # Programar la ejecución después de que se haya inicializado la interfaz
        root.after(500, lambda: app._run_tool_by_id(args.tool))
    
    # Iniciar el bucle de la aplicación
    root.mainloop()

# Punto de entrada
if __name__ == "__main__":
    main()
else:
    # Cuando se importa como módulo, no ejecuta la interfaz gráfica
    # Solo expone las funciones y clases necesarias
    pass
