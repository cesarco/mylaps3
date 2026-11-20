#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Interfaz gráfica para el escáner avanzado de puertos UDP
"""

import os
import sys
import time
import json
import threading
import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext
from typing import Dict, Any, List, Optional

# Importar el escáner avanzado desde la misma carpeta mylaps
try:
    from . import advanced_udp_scanner
    from .advanced_udp_scanner import scan_network_for_udp, UdpScannerFactory, SCAPY_AVAILABLE, NMAP_AVAILABLE
except ImportError:
    messagebox.showerror("Error", "No se pudo importar el módulo advanced_udp_scanner.py")
    sys.exit(1)

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

class UdpScannerApp:
    """Aplicación de escaneo UDP con interfaz gráfica"""
    
    def __init__(self, root):
        """
        Inicializa la aplicación
        
        Args:
            root: Ventana raíz de Tkinter
        """
        self.root = root
        self.root.title("MyLaps UDP Scanner")
        self.root.geometry("800x600")
        self.root.minsize(700, 500)
        
        # Asignar icono si está disponible
        try:
            icon_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "mylaps_icon.ico")
            if os.path.exists(icon_path):
                self.root.iconbitmap(icon_path)
        except Exception:
            pass
            
        # Inicializar variables
        self.scan_thread = None
        self.scan_results = None
        self.is_scanning = False
        
        # Variables de configuración
        self.port_var = tk.StringVar(value="5403")
        self.cidr_var = tk.StringVar(value="24")
        self.duration_var = tk.StringVar(value="20")
        self.method_var = tk.StringVar(value="auto")
        
        # Crear estructura de la interfaz
        self._create_widgets()
        
        # Centrar la ventana en la pantalla
        self.root.update_idletasks()
        width = self.root.winfo_width()
        height = self.root.winfo_height()
        x = (self.root.winfo_screenwidth() // 2) - (width // 2)
        y = (self.root.winfo_screenheight() // 2) - (height // 2)
        self.root.geometry(f"{width}x{height}+{x}+{y}")
        
        # Indicar métodos disponibles
        self._check_available_methods()
        
        # Configurar el cierre de la aplicación
        self.root.protocol("WM_DELETE_WINDOW", self._on_close)
    
    def _check_available_methods(self):
        """Comprueba qué métodos de escaneo están disponibles"""
        methods_info = "Métodos disponibles: "
        
        if SCAPY_AVAILABLE:
            methods_info += "Scapy (óptimo) ✓, "
        else:
            methods_info += "Scapy (óptimo) ✗, "
            
        if NMAP_AVAILABLE:
            methods_info += "Nmap ✓, "
        else:
            methods_info += "Nmap ✗, "
            
        methods_info += "Socket (básico) ✓"
        
        self.status_label.config(text=methods_info)
    
    def _create_widgets(self):
        """Crea los widgets de la interfaz"""
        # Panel principal
        main_frame = ttk.Frame(self.root, padding="10")
        main_frame.pack(fill=tk.BOTH, expand=True)
        
        # Configuración - Panel superior
        config_frame = ttk.LabelFrame(main_frame, text="Configuración", padding="10")
        config_frame.pack(fill=tk.X, pady=5)
        
        # Grid de configuración
        ttk.Label(config_frame, text="Puerto UDP:").grid(row=0, column=0, sticky=tk.W, padx=5, pady=5)
        ttk.Entry(config_frame, textvariable=self.port_var, width=10).grid(row=0, column=1, sticky=tk.W, padx=5, pady=5)
        
        ttk.Label(config_frame, text="CIDR (máscara):").grid(row=0, column=2, sticky=tk.W, padx=5, pady=5)
        ttk.Spinbox(config_frame, textvariable=self.cidr_var, from_=16, to=30, width=5).grid(row=0, column=3, sticky=tk.W, padx=5, pady=5)
        
        ttk.Label(config_frame, text="Duración (s):").grid(row=1, column=0, sticky=tk.W, padx=5, pady=5)
        ttk.Spinbox(config_frame, textvariable=self.duration_var, from_=5, to=120, width=5).grid(row=1, column=1, sticky=tk.W, padx=5, pady=5)
        
        ttk.Label(config_frame, text="Método:").grid(row=1, column=2, sticky=tk.W, padx=5, pady=5)
        method_combo = ttk.Combobox(config_frame, textvariable=self.method_var, width=10)
        method_combo['values'] = ('auto', 'scapy', 'nmap', 'socket')
        method_combo.grid(row=1, column=3, sticky=tk.W, padx=5, pady=5)
        
        # Botones de acción
        buttons_frame = ttk.Frame(main_frame)
        buttons_frame.pack(fill=tk.X, pady=5)
        
        self.scan_btn = ttk.Button(buttons_frame, text="Iniciar escaneo", command=self._start_scan)
        self.scan_btn.pack(side=tk.LEFT, padx=5)
        
        self.stop_btn = ttk.Button(buttons_frame, text="Detener", command=self._stop_scan, state=tk.DISABLED)
        self.stop_btn.pack(side=tk.LEFT, padx=5)
        
        self.config_btn = ttk.Button(buttons_frame, text="Auto-configurar ingestor", command=self._auto_configure, state=tk.DISABLED)
        self.config_btn.pack(side=tk.LEFT, padx=5)
        
        # Estado y barra de progreso
        status_frame = ttk.Frame(main_frame)
        status_frame.pack(fill=tk.X, pady=5)
        
        self.status_label = ttk.Label(status_frame, text="Listo para escanear")
        self.status_label.pack(side=tk.LEFT, fill=tk.X, expand=True, padx=5)
        
        self.progress = ttk.Progressbar(status_frame, mode="indeterminate")
        self.progress.pack(side=tk.RIGHT, fill=tk.X, expand=True, padx=5)
        
        # Pestañas para resultados
        notebook = ttk.Notebook(main_frame)
        notebook.pack(fill=tk.BOTH, expand=True, pady=5)
        
        # Pestaña de registro
        log_tab = ttk.Frame(notebook)
        notebook.add(log_tab, text="Registro")
        
        # Área de texto para registro
        self.log_text = scrolledtext.ScrolledText(log_tab, wrap=tk.WORD, width=80, height=20)
        self.log_text.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        self.log_text.config(state=tk.DISABLED)
        
        # Redirigir stdout a la ventana de registro
        self.stdout_redirect = RedirectText(self.log_text)
        sys.stdout = self.stdout_redirect
        
        # Pestaña de resultados
        results_tab = ttk.Frame(notebook)
        notebook.add(results_tab, text="Resultados")
        
        # Árbol de resultados
        self.results_tree = ttk.Treeview(results_tab)
        self.results_tree["columns"] = ("value")
        self.results_tree.column("#0", width=200, stretch=tk.YES)
        self.results_tree.column("value", width=400, stretch=tk.YES)
        self.results_tree.heading("#0", text="Parámetro")
        self.results_tree.heading("value", text="Valor")
        self.results_tree.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # Transmisores activos
        transmitters_tab = ttk.Frame(notebook)
        notebook.add(transmitters_tab, text="Transmisores activos")
        
        self.transmitters_tree = ttk.Treeview(transmitters_tab)
        self.transmitters_tree["columns"] = ("packets", "first_seen")
        self.transmitters_tree.column("#0", width=200, stretch=tk.YES)
        self.transmitters_tree.column("packets", width=100, stretch=tk.YES)
        self.transmitters_tree.column("first_seen", width=200, stretch=tk.YES)
        self.transmitters_tree.heading("#0", text="Dirección IP")
        self.transmitters_tree.heading("packets", text="Paquetes")
        self.transmitters_tree.heading("first_seen", text="Detectado")
        self.transmitters_tree.pack(fill=tk.BOTH, expand=True, padx=5, pady=5)
        
        # Barra de estado inferior
        self.footer_status = ttk.Label(main_frame, text="MyLaps UDP Scanner v1.0", relief=tk.SUNKEN, anchor=tk.W)
        self.footer_status.pack(side=tk.BOTTOM, fill=tk.X)
    
    def _start_scan(self):
        """Inicia el proceso de escaneo en un hilo separado"""
        if self.is_scanning:
            return
            
        # Validar entradas
        try:
            port = int(self.port_var.get())
            cidr = int(self.cidr_var.get())
            duration = int(self.duration_var.get())
            method = self.method_var.get()
            
            if port <= 0 or port > 65535:
                raise ValueError("Puerto debe estar entre 1 y 65535")
                
            if cidr < 16 or cidr > 30:
                raise ValueError("CIDR debe estar entre 16 y 30")
                
            if duration < 5 or duration > 120:
                raise ValueError("Duración debe estar entre 5 y 120 segundos")
                
            if method not in ('auto', 'scapy', 'nmap', 'socket'):
                method = 'auto'
                
        except ValueError as e:
            messagebox.showerror("Error de validación", str(e))
            return
            
        # Limpiar resultados anteriores
        self.log_text.config(state=tk.NORMAL)
        self.log_text.delete(1.0, tk.END)
        self.log_text.config(state=tk.DISABLED)
        
        self.results_tree.delete(*self.results_tree.get_children())
        self.transmitters_tree.delete(*self.transmitters_tree.get_children())
        
        # Actualizar interfaz para escaneo
        self.scan_btn.config(state=tk.DISABLED)
        self.stop_btn.config(state=tk.NORMAL)
        self.config_btn.config(state=tk.DISABLED)
        self.is_scanning = True
        self.progress.start(10)
        
        # Método real a usar
        method = None if method == 'auto' else method
        
        # Iniciar el escaneo en un hilo separado
        self.scan_thread = threading.Thread(
            target=self._run_scan,
            args=(port, cidr, duration, method),
            daemon=True
        )
        self.scan_thread.start()
        
        # Actualizar estado
        self.status_label.config(text=f"Escaneando puerto {port} en subred /{cidr}...")
    
    def _run_scan(self, port: int, cidr: int, duration: int, method: Optional[str]):
        """
        Ejecuta el escaneo en un hilo separado
        
        Args:
            port: Puerto UDP a escanear
            cidr: Máscara de red CIDR
            duration: Duración del monitoreo activo
            method: Método de escaneo
        """
        try:
            print(f"Iniciando escaneo del puerto {port} en subred /{cidr}")
            print(f"Duración del escaneo: {duration} segundos")
            print(f"Método de escaneo: {'Auto' if method is None else method}")
            print("=" * 50)
            
            # Ejecutar el escaneo
            results = scan_network_for_udp(
                port=port,
                cidr=cidr,
                duration=duration,
                method=method
            )
            
            # Guardar resultados
            self.scan_results = results
            
            # Actualizar la interfaz desde el hilo principal
            self.root.after(0, self._update_results, results)
            
        except Exception as e:
            import traceback
            print(f"Error durante el escaneo: {e}")
            print(traceback.format_exc())
            self.root.after(0, self._show_error, f"Error durante el escaneo: {e}")
        finally:
            # Finalizar el escaneo
            self.root.after(0, self._end_scan)
    
    def _update_results(self, results: Dict[str, Any]):
        """
        Actualiza la interfaz con los resultados del escaneo
        
        Args:
            results: Resultados del escaneo
        """
        # Actualizar árbol de resultados generales
        self.results_tree.delete(*self.results_tree.get_children())
        
        # Información general
        self.results_tree.insert("", tk.END, text="IP local", values=(results['local_ip'],))
        self.results_tree.insert("", tk.END, text="Subred", values=(results['subnet'],))
        self.results_tree.insert("", tk.END, text="Puerto escaneado", values=(results['port'],))
        self.results_tree.insert("", tk.END, text="Método utilizado", values=(results['scan_method'],))
        
        # Hosts potenciales
        potential_hosts = len(results['potential_transmitters'])
        potential_item = self.results_tree.insert("", tk.END, text="Hosts con puerto abierto", values=(potential_hosts,))
        
        for ip in results['potential_transmitters']:
            self.results_tree.insert(potential_item, tk.END, text=ip, values=(""))
            
        # Transmisores activos
        self.transmitters_tree.delete(*self.transmitters_tree.get_children())
        
        for transmitter in results['active_transmitters']:
            ip = transmitter['ip']
            packets = transmitter['count']
            first_seen = time.strftime('%H:%M:%S', time.localtime(transmitter['first_seen']))
            
            self.transmitters_tree.insert("", tk.END, text=ip, values=(packets, first_seen))
            
        # Actualizar estado
        active_count = len(results['active_transmitters'])
        
        if active_count > 0:
            self.status_label.config(text=f"Escaneo completado. Se encontraron {active_count} transmisores activos.")
            self.config_btn.config(state=tk.NORMAL)
        else:
            self.status_label.config(text="Escaneo completado. No se encontraron transmisores activos.")
    
    def _show_error(self, message: str):
        """
        Muestra un mensaje de error
        
        Args:
            message: Mensaje de error
        """
        messagebox.showerror("Error", message)
        self.status_label.config(text=f"Error: {message}")
    
    def _end_scan(self):
        """Finaliza el proceso de escaneo"""
        self.is_scanning = False
        self.progress.stop()
        self.scan_btn.config(state=tk.NORMAL)
        self.stop_btn.config(state=tk.DISABLED)
        
        # Forzar la escritura de cualquier salida pendiente
        if hasattr(self, 'stdout_redirect'):
            self.stdout_redirect.flush()
            
        print("=" * 50)
        print("Escaneo finalizado")
    
    def _stop_scan(self):
        """Detiene el escaneo en curso"""
        if not self.is_scanning:
            return
            
        print("Deteniendo escaneo por solicitud del usuario...")
        self.status_label.config(text="Deteniendo escaneo...")
        self.is_scanning = False
        
        # El hilo terminará eventualmente y llamará a _end_scan
    
    def _auto_configure(self):
        """Configura automáticamente el ingestor con la IP detectada"""
        if not self.scan_results or not self.scan_results['active_transmitters']:
            messagebox.showinfo("Información", "No hay transmisores activos para configurar")
            return
            
        # Seleccionar el transmisor con más paquetes
        best_transmitter = max(self.scan_results['active_transmitters'], key=lambda x: x['count'])
        ip = best_transmitter['ip']
        port = self.scan_results['port']
        
        # Verificar si podemos acceder al módulo de configuración
        try:
            # Importar módulos necesarios
            from . import config as mylaps_config
            
            # Actualizar la configuración
            new_config = {
                "udp_host": ip,
                "udp_port": port
            }
            
            mylaps_config.update_config(new_config)
            
            messagebox.showinfo(
                "Configuración actualizada", 
                f"Se ha configurado el ingestor para recibir desde {ip}:{port}.\n\n"
                "Reinicie el ingestor para aplicar los cambios."
            )
            
        except ImportError:
            # Si no podemos importar, mostrar instrucciones manuales
            messagebox.showinfo(
                "Configuración manual requerida", 
                f"No se pudo actualizar automáticamente la configuración.\n\n"
                f"Configure manualmente el ingestor con estos valores:\n"
                f"- Host UDP: {ip}\n"
                f"- Puerto UDP: {port}"
            )
    
    def _on_close(self):
        """Maneja el cierre de la aplicación"""
        if self.is_scanning:
            if messagebox.askyesno("Confirmar", "¿Desea detener el escaneo y salir?"):
                self._stop_scan()
                self.root.after(500, self.root.destroy)
        else:
            self.root.destroy()
        
        # Restaurar stdout
        sys.stdout = sys.__stdout__

# Función principal
def main():
    """Función principal del programa"""
    root = tk.Tk()
    app = UdpScannerApp(root)
    root.mainloop()

if __name__ == "__main__":
    main()