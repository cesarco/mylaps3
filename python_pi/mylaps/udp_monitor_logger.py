#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Integración del logger UDP en el scanner avanzado
"""

import os
import sys
import time
import socket
import threading
import json
from typing import Dict, Any, List

# Importar componentes necesarios del paquete mylaps
from .advanced_udp_scanner import UdpTransmissionDetector, scan_network_for_udp
from .udp_data_logger import UdpDataLogger

class UdpMonitorWithLogger:
    """Monitor UDP con logger integrado"""
    
    def __init__(self, port: int = 5403, log_dir: str = None):
        """
        Inicializa el monitor UDP con logging
        
        Args:
            port: Puerto UDP a escuchar
            log_dir: Directorio para guardar los logs
        """
        self.port = port
        self.logger = UdpDataLogger(log_dir)
        
        self._running = False
        self._thread = None
        self._socket = None
        self._detected_ips = set()
        self.active_sources = {}
    
    def start(self, target_ips: List[str] = None) -> None:
        """
        Inicia el monitor UDP
        
        Args:
            target_ips: Lista opcional de IPs para restringir el monitoreo
        """
        if self._running:
            print(f"[WARNING] El monitor UDP ya está en ejecución")
            return
            
        self._running = True
        self._detected_ips = set(target_ips or [])
        
        # Iniciar hilo de monitoreo
        self._thread = threading.Thread(
            target=self._monitor_thread,
            daemon=True
        )
        self._thread.start()
        
        log_dir = self.logger.log_dir
        
        if target_ips:
            targets = ", ".join(target_ips)
            print(f"[INFO] Monitor UDP iniciado en puerto {self.port} para {targets}")
        else:
            print(f"[INFO] Monitor UDP iniciado en puerto {self.port} (todas las IPs)")
            
        print(f"[INFO] Los datos recibidos se están guardando en {log_dir}")
    
    def stop(self) -> None:
        """Detiene el monitor UDP"""
        if not self._running:
            return
            
        self._running = False
        
        # Cerrar socket para liberar el hilo
        if self._socket:
            try:
                self._socket.close()
            except Exception:
                pass
        
        # Esperar a que el hilo termine
        if self._thread and self._thread.is_alive():
            self._thread.join(timeout=5.0)
            
        print("[INFO] Monitor UDP detenido")
    
    def _monitor_thread(self) -> None:
        """Función principal del hilo de monitoreo"""
        try:
            # Crear socket para escuchar en el puerto especificado
            self._socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            self._socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self._socket.bind(("0.0.0.0", self.port))
            self._socket.settimeout(1.0)  # 1 segundo de timeout para checks de cancelación
            
            print(f"[INFO] Monitoreando transmisiones UDP en puerto {self.port}")
            
            while self._running:
                try:
                    data, addr = self._socket.recvfrom(8192)
                    ip = addr[0]
                    port = addr[1]
                    
                    # Si tenemos una lista de IPs específicas, verificar si esta IP está incluida
                    if not self._detected_ips or ip in self._detected_ips:
                        # Registrar el paquete en el logger
                        session_id = self.logger.log_packet(ip, port, data)
                        
                        # Actualizar información de la fuente activa
                        if ip not in self.active_sources:
                            self.active_sources[ip] = {
                                "ip": ip,
                                "port": port,
                                "first_seen": time.time(),
                                "last_seen": time.time(),
                                "packet_count": 1,
                                "session_id": session_id
                            }
                            print(f"[INFO] Detectada nueva fuente de datos: {ip}:{port}")
                        else:
                            self.active_sources[ip]["last_seen"] = time.time()
                            self.active_sources[ip]["packet_count"] += 1
                            
                            # Log de hitos
                            count = self.active_sources[ip]["packet_count"]
                            if count in (10, 50, 100, 500, 1000) or count % 1000 == 0:
                                print(f"[INFO] Recibidos {count} paquetes desde {ip}:{port}")
                        
                except socket.timeout:
                    # Timeout normal, continuamos el ciclo
                    continue
                except Exception as e:
                    print(f"[ERROR] Error en monitor UDP: {e}")
                    if not self._running:
                        break
        
        except Exception as e:
            print(f"[ERROR] Error al inicializar el monitor UDP: {e}")
        finally:
            if self._socket:
                try:
                    self._socket.close()
                except Exception:
                    pass
                
            self._socket = None
    
    def get_stats(self) -> Dict[str, Any]:
        """
        Obtiene estadísticas del monitor
        
        Returns:
            Estadísticas del monitoreo UDP
        """
        now = time.time()
        stats = {
            "port": self.port,
            "running": self._running,
            "log_dir": self.logger.log_dir,
            "active_sources": {}
        }
        
        # Preparar datos de fuentes activas
        for ip, source in self.active_sources.items():
            stats["active_sources"][ip] = {
                "ip": source["ip"],
                "port": source["port"],
                "first_seen": source["first_seen"],
                "last_seen": source["last_seen"],
                "uptime": now - source["first_seen"],
                "packet_count": source["packet_count"],
                "session_id": source["session_id"]
            }
            
        return stats

def detect_and_log(port: int = 5403, cidr: int = 24, log_dir: str = None, 
                   duration: int = 30, auto_start: bool = True) -> Dict[str, Any]:
    """
    Detecta transmisores UDP activos y configura un logger para cada uno
    
    Args:
        port: Puerto UDP a monitorear
        cidr: Máscara de subred CIDR para escaneo
        log_dir: Directorio para guardar logs
        duration: Duración del escaneo inicial en segundos
        auto_start: Inicia automáticamente el logger después de la detección
        
    Returns:
        Resultados del escaneo y configuración del logger
    """
    print("[INFO] Iniciando detección de transmisores UDP...")
    
    # Ejecutar escaneo de red
    scan_results = scan_network_for_udp(
        port=port,
        cidr=cidr,
        duration=duration
    )
    
    # Extraer transmisores activos detectados
    active_transmitters = [t["ip"] for t in scan_results.get("active_transmitters", [])]
    
    if not active_transmitters:
        print("[INFO] No se detectaron transmisores activos.")
        return scan_results
    
    # Mostrar resultados del escaneo
    print(f"\n[INFO] Detectados {len(active_transmitters)} transmisores activos:")
    for ip in active_transmitters:
        print(f"  - {ip}")
    
    # Si se solicitó, iniciar automáticamente el logger
    if auto_start:
        print("\n[INFO] Iniciando logger UDP para los transmisores detectados...")
        
        # Crear y configurar el monitor con logger
        monitor = UdpMonitorWithLogger(port=port, log_dir=log_dir)
        monitor.start(target_ips=active_transmitters)
        
        try:
            # Ciclo principal
            print("\n[INFO] Logger en ejecución. Presiona Ctrl+C para detener...")
            
            while True:
                time.sleep(10)
                
                # Mostrar estadísticas periódicamente
                stats = monitor.get_stats()
                
                for ip, source in stats["active_sources"].items():
                    print(f"[STATS] {ip}: {source['packet_count']} paquetes, "
                          f"tiempo activo: {int(source['uptime'])} segundos")
                
        except KeyboardInterrupt:
            print("\n[INFO] Deteniendo el logger...")
        finally:
            # Detener monitor al salir
            if 'monitor' in locals():
                monitor.stop()
    
    return scan_results

def run_monitor_logger(port: int = 5403, cidr: int = 24, log_dir: str = None, 
                       duration: int = 30, auto_start: bool = True) -> Dict[str, Any]:
    """
    Función de conveniencia para ejecutar el monitor logger
    
    Args:
        port: Puerto UDP a monitorear
        cidr: Máscara de subred CIDR para escaneo
        log_dir: Directorio para guardar logs
        duration: Duración del escaneo inicial en segundos
        auto_start: Inicia automáticamente el logger después de la detección
        
    Returns:
        Resultados del escaneo y configuración del logger
    """
    return detect_and_log(port, cidr, log_dir, duration, auto_start)