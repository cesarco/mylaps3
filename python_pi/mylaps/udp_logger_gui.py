#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Demo para mostrar el funcionamiento del logger UDP
"""

import os
import sys
import time
import datetime
import argparse
import threading
import tkinter as tk
from tkinter import ttk, scrolledtext, filedialog, messagebox
from typing import Dict, List, Any, Optional

# Importar el logger UDP desde el paquete mylaps
from .udp_data_logger import UdpListenerWithLogger

class UdpLoggerGUI:
    """Interfaz gráfica para el logger UDP"""
    
    def __init__(self, root):
        """
        Inicializa la interfaz gráfica
        
        Args:
            root: Ventana raíz de Tkinter
        """
        self.root = root
        self.root.title("MyLaps UDP Logger")
        self.root.geometry("900x600")
        self.root.minsize(800, 500)
        
        # Variables de la aplicación
        self.udp_listener = None
        self.update_thread = None
        self.update_running = False
        self.sessions_data = {}
        
        # Variables de configuración
        self.port_var = tk.StringVar(value="5403")
        self.log_dir_var = tk.StringVar(value=os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs"))
        
        # Crear los widgets de la interfaz
        self._create_widgets()
        
        # Centrar la ventana
        self.root.update_idletasks()
        width = self.root.winfo_width()
        height = self.root.winfo_height()
        x = (self.root.winfo_screenwidth() // 2) - (width // 2)
        y = (self.root.winfo_screenheight() // 2) - (height // 2)
        self.root.geometry(f"{width}x{height}+{x}+{y}")
        
        # Configurar el cierre de la aplicación
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)
    
    def _create_widgets(self):
        """Crea todos los widgets de la interfaz"""
        # Panel principal con grid layout
        main_frame = ttk.Frame(self.root, padding=10)
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        # Panel de configuración
        config_frame = ttk.LabelFrame(main_frame, text="Configuración", padding=10)
        config_frame.pack(fill=tk.X, pady=(0, 10))
        
        # Configuración con grid layout
        ttk.Label(config_frame, text="Puerto UDP:").grid(row=0, column=0, sticky=tk.W, padx=5, pady=5)
        ttk.Entry(config_frame, textvariable=self.port_var, width=10).grid(row=0, column=1, sticky=tk.W, padx=5, pady=5)
        
        ttk.Label(config_frame, text="Directorio de logs:").grid(row=0, column=2, sticky=tk.W, padx=5, pady=5)
        ttk.Entry(config_frame, textvariable=self.log_dir_var, width=40).grid(row=0, column=3, sticky=tk.EW, padx=5, pady=5)
        
        ttk.Button(config_frame, text="...", width=3, command=self._select_log_dir).grid(row=0, column=4, padx=5, pady=5)
        
        # Botones de control
        control_frame = ttk.Frame(main_frame)
        control_frame.pack(fill=tk.X, pady=(0, 10))
        
        self.start_btn = ttk.Button(control_frame, text="Iniciar logger", command=self._start_logger)
        self.start_btn.pack(side=tk.LEFT, padx=5)
        
        self.stop_btn = ttk.Button(control_frame, text="Detener", command=self._stop_logger, state=tk.DISABLED)
        self.stop_btn.pack(side=tk.LEFT, padx=5)
        
        self.open_logs_btn = ttk.Button(control_frame, text="Abrir directorio de logs", command=self._open_logs_dir)
        self.open_logs_btn.pack(side=tk.LEFT, padx=5)
        
        # Notebook con pestañas para diferentes vistas
        notebook = ttk.Notebook(main_frame)
        notebook.pack(fill=tk.BOTH, expand=True)
        
        # Pestaña de sesiones
        sessions_tab = ttk.Frame(notebook)
        notebook.add(sessions_tab, text="Sesiones activas")
        
        # Tabla de sesiones (Treeview)
        self.sessions_tree = ttk.Treeview(sessions_tab)
        self.sessions_tree["columns"] = ("ip", "duration", "packets", "last_seen", "log_file")
        
        # Configurar columnas
        self.sessions_tree.column("#0", width=100, stretch=tk.NO)
        self.sessions_tree.column("ip", width=150, stretch=tk.YES)
        self.sessions_tree.column("duration", width=100, stretch=tk.YES)
        self.sessions_tree.column("packets", width=80, stretch=tk.YES)
        self.sessions_tree.column("last_seen", width=150, stretch=tk.YES)
        self.sessions_tree.column("log_file", width=250, stretch=tk.YES)
        
        # Configurar encabezados
        self.sessions_tree.heading("#0", text="Sesión")
        self.sessions_tree.heading("ip", text="Dirección IP:Puerto")
        self.sessions_tree.heading("duration", text="Duración")
        self.sessions_tree.heading("packets", text="Paquetes")
        self.sessions_tree.heading("last_seen", text="Último paquete")
        self.sessions_tree.heading("log_file", text="Archivo de log")
        
        # Agregar scrollbars
        sessions_scroll_y = ttk.Scrollbar(sessions_tab, orient=tk.VERTICAL, command=self.sessions_tree.yview)
        sessions_scroll_x = ttk.Scrollbar(sessions_tab, orient=tk.HORIZONTAL, command=self.sessions_tree.xview)
        self.sessions_tree.configure(yscrollcommand=sessions_scroll_y.set, xscrollcommand=sessions_scroll_x.set)
        
        # Posicionar con grid
        self.sessions_tree.grid(row=0, column=0, sticky=tk.NSEW)
        sessions_scroll_y.grid(row=0, column=1, sticky=tk.NS)
        sessions_scroll_x.grid(row=1, column=0, sticky=tk.EW)
        
        sessions_tab.columnconfigure(0, weight=1)
        sessions_tab.rowconfigure(0, weight=1)
        
        # Configurar menú contextual para la tabla de sesiones
        self.session_menu = tk.Menu(self.root, tearoff=0)
        self.session_menu.add_command(label="Ver archivo de log", command=self._view_log_file)
        self.session_menu.add_command(label="Abrir directorio", command=self._open_log_dir)
        
        self.sessions_tree.bind("<Button-3>", self._show_session_menu)
        self.sessions_tree.bind("<Double-1>", lambda e: self._view_log_file())
        
        # Pestaña de registro
        log_tab = ttk.Frame(notebook)
        notebook.add(log_tab, text="Registro")
        
        # Área de texto para registro
        self.log_text = scrolledtext.ScrolledText(log_tab, wrap=tk.WORD, width=80, height=20)
        self.log_text.pack(fill=tk.BOTH, expand=True)
        self.log_text.config(state=tk.DISABLED)
        
        # Redirigir stdout a la ventana de registro
        self._redirect_stdout()
        
        # Barra de estado
        self.status_var = tk.StringVar(value="Listo para iniciar")
        status_bar = ttk.Label(main_frame, textvariable=self.status_var, relief=tk.SUNKEN, anchor=tk.W)
        status_bar.pack(side=tk.BOTTOM, fill=tk.X)
    
    def _redirect_stdout(self):
        """Redirige la salida estándar al widget de texto"""
        class StdoutRedirector:
            def __init__(self, text_widget):
                self.text_widget = text_widget
                self.buffer = ""
                
            def write(self, string):
                self.buffer += string
                if '\n' in self.buffer:
                    lines = self.buffer.split('\n')
                    for i, line in enumerate(lines[:-1]):
                        self.text_widget.config(state=tk.NORMAL)
                        self.text_widget.insert(tk.END, line + '\n')
                        self.text_widget.see(tk.END)
                        self.text_widget.config(state=tk.DISABLED)
                    self.buffer = lines[-1]
                    
            def flush(self):
                if self.buffer:
                    self.text_widget.config(state=tk.NORMAL)
                    self.text_widget.insert(tk.END, self.buffer)
                    self.text_widget.see(tk.END)
                    self.text_widget.config(state=tk.DISABLED)
                    self.buffer = ""
                    
        sys.stdout = StdoutRedirector(self.log_text)
    
    def _select_log_dir(self):
        """Abre un diálogo para seleccionar el directorio de logs"""
        directory = filedialog.askdirectory(
            initialdir=self.log_dir_var.get(),
            title="Seleccionar directorio para logs"
        )
        
        if directory:
            self.log_dir_var.set(directory)
    
    def _start_logger(self):
        """Inicia el listener UDP y el hilo de actualización"""
        try:
            # Validar configuración
            port = int(self.port_var.get())
            if port <= 0 or port > 65535:
                raise ValueError("El puerto debe estar entre 1 y 65535")
                
            log_dir = self.log_dir_var.get()
            if not os.path.exists(log_dir):
                os.makedirs(log_dir, exist_ok=True)
                
            # Crear y iniciar el listener UDP
            self.udp_listener = UdpListenerWithLogger(port=port, log_dir=log_dir)
            self.udp_listener.start()
            
            # Iniciar el hilo de actualización de la interfaz
            self.update_running = True
            self.update_thread = threading.Thread(target=self._update_loop, daemon=True)
            self.update_thread.start()
            
            # Actualizar interfaz
            self.start_btn.config(state=tk.DISABLED)
            self.stop_btn.config(state=tk.NORMAL)
            self.status_var.set(f"Escuchando en puerto UDP {port}")
            
            # Mostrar mensaje de éxito
            print(f"Logger UDP iniciado en puerto {port}")
            print(f"Los datos recibidos se guardarán en {log_dir}")
            
        except Exception as e:
            messagebox.showerror("Error", f"No se pudo iniciar el logger UDP: {e}")
            print(f"[ERROR] No se pudo iniciar el logger: {e}")
    
    def _stop_logger(self):
        """Detiene el listener UDP y el hilo de actualización"""
        if self.udp_listener:
            self.udp_listener.stop()
            self.udp_listener = None
            
        self.update_running = False
        if self.update_thread and self.update_thread.is_alive():
            self.update_thread.join(timeout=5.0)
            
        # Actualizar interfaz
        self.start_btn.config(state=tk.NORMAL)
        self.stop_btn.config(state=tk.DISABLED)
        self.status_var.set("Logger detenido")
        
        print("Logger UDP detenido")
    
    def _update_loop(self):
        """Hilo que actualiza la información de sesiones periódicamente"""
        while self.update_running:
            try:
                if self.udp_listener:
                    # Obtener estadísticas de sesiones
                    stats = self.udp_listener.session_stats
                    
                    # Actualizar la interfaz en el hilo principal
                    self.root.after(0, self._update_sessions_view, stats)
                    
            except Exception as e:
                print(f"[ERROR] Error actualizando estadísticas: {e}")
                
            # Esperar antes de la siguiente actualización
            time.sleep(1)
    
    def _update_sessions_view(self, sessions_stats: Dict[str, Dict[str, Any]]):
        """
        Actualiza la vista de sesiones con los datos actuales
        
        Args:
            sessions_stats: Estadísticas de las sesiones activas
        """
        try:
            # Actualizar datos internos
            self.sessions_data = sessions_stats
            
            # Lista de sesiones actuales en la vista
            current_items = set(self.sessions_tree.get_children())
            
            # Actualizar sesiones existentes o agregar nuevas
            for session_key, stats in sessions_stats.items():
                session_id = stats["session_id"]
                
                # Datos para la vista
                ip_port = session_key
                duration = self._format_duration(stats["duration"])
                packets = stats["packet_count"]
                last_seen = datetime.datetime.fromtimestamp(stats["last_seen"]).strftime("%H:%M:%S")
                log_file = stats["log_file"]
                
                # Verificar si la sesión ya está en la vista
                if session_id in current_items:
                    # Actualizar sesión existente
                    self.sessions_tree.item(
                        session_id,
                        values=(ip_port, duration, packets, last_seen, log_file)
                    )
                    # Marcar como procesada
                    current_items.remove(session_id)
                else:
                    # Agregar nueva sesión
                    self.sessions_tree.insert(
                        "", tk.END, iid=session_id, text=session_id[:8],
                        values=(ip_port, duration, packets, last_seen, log_file)
                    )
            
            # Eliminar sesiones que ya no están activas
            for item_id in current_items:
                self.sessions_tree.delete(item_id)
                
            # Actualizar contador en la barra de estado
            active_count = len(sessions_stats)
            self.status_var.set(f"Escuchando en puerto {self.port_var.get()} - {active_count} sesiones activas")
            
        except Exception as e:
            print(f"[ERROR] Error actualizando vista de sesiones: {e}")
    
    def _format_duration(self, seconds: float) -> str:
        """
        Formatea una duración en segundos como HH:MM:SS
        
        Args:
            seconds: Duración en segundos
            
        Returns:
            Duración formateada
        """
        hours = int(seconds // 3600)
        minutes = int((seconds % 3600) // 60)
        secs = int(seconds % 60)
        
        if hours > 0:
            return f"{hours}:{minutes:02d}:{secs:02d}"
        else:
            return f"{minutes:02d}:{secs:02d}"
    
    def _show_session_menu(self, event):
        """Muestra el menú contextual para una sesión seleccionada"""
        # Identificar el ítem bajo el cursor
        item = self.sessions_tree.identify_row(event.y)
        if not item:
            return
            
        # Seleccionar el ítem
        self.sessions_tree.selection_set(item)
        
        # Mostrar menú contextual
        self.session_menu.post(event.x_root, event.y_root)
    
    def _view_log_file(self):
        """Abre el archivo de log seleccionado"""
        selected = self.sessions_tree.selection()
        if not selected:
            return
            
        # Obtener la información de la sesión
        session_id = selected[0]
        
        # Buscar el archivo de log
        for stats in self.sessions_data.values():
            if stats["session_id"] == session_id:
                log_file = stats["log_file"]
                log_path = os.path.join(self.log_dir_var.get(), log_file)
                
                # Verificar que el archivo existe
                if not os.path.exists(log_path):
                    messagebox.showerror("Error", f"No se encuentra el archivo de log: {log_file}")
                    return
                
                # Abrir el archivo en el editor predeterminado
                if sys.platform == 'win32':
                    os.startfile(log_path)
                elif sys.platform == 'darwin':
                    os.system(f'open "{log_path}"')
                else:
                    os.system(f'xdg-open "{log_path}"')
                    
                return
    
    def _open_log_dir(self):
        """Abre el directorio del log seleccionado"""
        selected = self.sessions_tree.selection()
        if not selected:
            return
        
        # Abrir el directorio de logs
        log_dir = self.log_dir_var.get()
        
        if sys.platform == 'win32':
            os.startfile(log_dir)
        elif sys.platform == 'darwin':
            os.system(f'open "{log_dir}"')
        else:
            os.system(f'xdg-open "{log_dir}"')
    
    def _open_logs_dir(self):
        """Abre el directorio de logs configurado"""
        log_dir = self.log_dir_var.get()
        
        # Verificar que el directorio existe
        if not os.path.exists(log_dir):
            try:
                os.makedirs(log_dir, exist_ok=True)
            except Exception as e:
                messagebox.showerror("Error", f"No se pudo crear el directorio de logs: {e}")
                return
        
        # Abrir el directorio
        if sys.platform == 'win32':
            os.startfile(log_dir)
        elif sys.platform == 'darwin':
            os.system(f'open "{log_dir}"')
        else:
            os.system(f'xdg-open "{log_dir}"')
    
    def _on_close(self):
        """Maneja el cierre de la aplicación"""
        if self.udp_listener:
            if messagebox.askyesno("Confirmar", "¿Desea detener el logger y salir?"):
                self._stop_logger()
                self.root.after(500, self.root.destroy)
        else:
            self.root.destroy()
        
        # Restaurar stdout
        sys.stdout = sys.__stdout__

def main():
    """Función principal"""
    root = tk.Tk()
    app = UdpLoggerGUI(root)
    root.mainloop()

if __name__ == "__main__":
    main()