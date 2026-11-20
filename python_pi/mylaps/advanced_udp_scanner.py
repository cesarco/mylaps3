#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script avanzado de escaneo de redes con múltiples métodos de detección UDP
"""

import os
import sys
import time
import socket
import argparse
import ipaddress
import threading
import json
import concurrent.futures
from typing import List, Dict, Any, Tuple

# Intentar importar bibliotecas optimizadas
try:
    import scapy.all as scapy
    SCAPY_AVAILABLE = True
    print("[INFO] Usando Scapy para detección optimizada")
except ImportError:
    SCAPY_AVAILABLE = False
    print("[INFO] Scapy no está disponible. Para una mejor detección: pip install scapy")

try:
    import nmap
    NMAP_AVAILABLE = True
    print("[INFO] Usando python-nmap para escaneo avanzado")
except ImportError:
    NMAP_AVAILABLE = False
    print("[INFO] python-nmap no está disponible. Para escaneo avanzado: pip install python-nmap")

# Importar funcionalidades de mylaps
try:
    from . import config
    from . import utils
    MYLAPS_AVAILABLE = True
except ImportError:
    MYLAPS_AVAILABLE = False
    
    def log(level, message):
        print(f"[{level}] {message}")
    
    # Crear un objeto de configuración simulado
    class Config:
        UDP_PORT = 5403
        
    config = Config()

# Clase de base para detección de puerto
class BaseUdpScanner:
    """Clase base para los escáneres de puertos UDP"""
    
    def __init__(self, port: int = None, timeout: float = 0.5):
        """
        Inicializa el escáner UDP base
        
        Args:
            port: Puerto UDP a escanear (por defecto usa config.UDP_PORT)
            timeout: Tiempo de espera en segundos para cada operación
        """
        self.port = port if port is not None else config.UDP_PORT
        self.timeout = timeout
        self.log = log if 'log' in globals() else utils.log
    
    def get_local_ip(self) -> str:
        """Obtiene la dirección IP local de la máquina"""
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            local_ip = s.getsockname()[0]
            s.close()
            return local_ip
        except Exception:
            return socket.gethostbyname(socket.gethostname())
    
    def get_subnet(self, ip: str = None, cidr: int = 24) -> ipaddress.IPv4Network:
        """
        Obtiene la subred basada en la IP local
        
        Args:
            ip: Dirección IP para la subred (por defecto usa la IP local)
            cidr: Máscara de red en formato CIDR (por defecto /24)
        
        Returns:
            Objeto IPv4Network representando la subred
        """
        if not ip:
            ip = self.get_local_ip()
        
        subnet = ipaddress.IPv4Network(f"{ip}/{cidr}", strict=False)
        return subnet

# Escáner basado en Scapy para mejor rendimiento
class ScapyUdpScanner(BaseUdpScanner):
    """Implementación de escáner UDP usando Scapy para mejor precisión"""
    
    def __init__(self, port: int = None, timeout: float = 0.5):
        """
        Inicializa el escáner UDP con Scapy
        
        Args:
            port: Puerto UDP a escanear (por defecto usa config.UDP_PORT)
            timeout: Tiempo de espera en segundos para cada operación
        """
        if not SCAPY_AVAILABLE:
            raise ImportError("Esta clase requiere Scapy. Instálalo con: pip install scapy")
        
        super().__init__(port, timeout)
        self.scapy = scapy
    
    def check_port(self, ip: str) -> bool:
        """
        Comprueba si un puerto UDP está abierto usando Scapy
        
        Args:
            ip: Dirección IP a comprobar
            
        Returns:
            True si el puerto está potencialmente abierto, False en caso contrario
        """
        packet = self.scapy.IP(dst=ip)/self.scapy.UDP(dport=self.port, sport=12345)
        
        # Enviar paquete y esperar respuesta (o no) con timeout
        response = self.scapy.sr1(packet, timeout=self.timeout, verbose=0)
        
        if response is None:
            # Sin respuesta generalmente significa puerto abierto o filtrado
            return True
            
        # Si recibimos ICMP port unreachable, significa puerto cerrado
        if response.haslayer(self.scapy.ICMP):
            icmp_type = response.getlayer(self.scapy.ICMP).type
            icmp_code = response.getlayer(self.scapy.ICMP).code
            
            # ICMP Port Unreachable (tipo 3, código 3)
            if icmp_type == 3 and icmp_code == 3:
                return False
        
        # Para cualquier otra respuesta, consideramos que podría estar abierto
        return True
    
    def scan_subnet(self, subnet: ipaddress.IPv4Network, max_workers: int = 50) -> Dict[str, bool]:
        """
        Escanea una subred para encontrar puertos UDP potencialmente abiertos
        
        Args:
            subnet: La subred a escanear
            max_workers: Número máximo de hilos para el escaneo paralelo
            
        Returns:
            Diccionario con IPs como claves y estado del puerto como valores
        """
        results = {}
        local_ip = self.get_local_ip()
        
        self.log("INFO", f"Iniciando escaneo Scapy para puerto UDP {self.port} en {subnet}")
        
        # Dividir la subred en bloques para mejor rendimiento
        all_ips = list(str(ip) for ip in subnet.hosts() if str(ip) != local_ip)
        total_ips = len(all_ips)
        
        if total_ips == 0:
            return {}
            
        self.log("INFO", f"Escaneando {total_ips} hosts...")
        
        # Usar ThreadPoolExecutor para paralelismo
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Mapear cada IP a un futuro
            future_to_ip = {executor.submit(self.check_port, ip): ip for ip in all_ips}
            
            # Procesar resultados a medida que se completan
            for future in concurrent.futures.as_completed(future_to_ip):
                ip = future_to_ip[future]
                
                try:
                    is_open = future.result()
                    results[ip] = is_open
                    
                    if is_open:
                        self.log("INFO", f"Puerto {self.port} potencialmente abierto en {ip}")
                except Exception as e:
                    self.log("ERROR", f"Error escaneando {ip}: {e}")
        
        open_count = sum(results.values())
        self.log("INFO", f"Escaneo completado. Encontrados {open_count} hosts potenciales de {total_ips}")
        
        return results

# Escáner basado en Nmap para detección completa
class NmapUdpScanner(BaseUdpScanner):
    """Implementación de escáner UDP usando python-nmap para detección avanzada"""
    
    def __init__(self, port: int = None, timeout: float = 2.0):
        """
        Inicializa el escáner UDP con python-nmap
        
        Args:
            port: Puerto UDP a escanear (por defecto usa config.UDP_PORT)
            timeout: Tiempo de espera en segundos para cada operación
        """
        if not NMAP_AVAILABLE:
            raise ImportError("Esta clase requiere python-nmap. Instálalo con: pip install python-nmap")
        
        super().__init__(port, timeout)
        self.nm = nmap.PortScanner()
    
    def scan_subnet(self, subnet: ipaddress.IPv4Network) -> Dict[str, bool]:
        """
        Escanea una subred para encontrar puertos UDP abiertos usando nmap
        
        Args:
            subnet: La subred a escanear
            
        Returns:
            Diccionario con IPs como claves y estado del puerto como valores
        """
        results = {}
        local_ip = self.get_local_ip()
        
        self.log("INFO", f"Iniciando escaneo Nmap para puerto UDP {self.port} en {subnet}")
        
        # Configurar escaneo nmap
        # -sU: Escaneo UDP
        # -T4: Velocidad agresiva
        # --open: Solo reportar puertos abiertos
        try:
            # Nmap trabaja con rangos CIDR directamente
            subnet_str = str(subnet)
            port_str = str(self.port)
            
            # Ejecutar el escaneo
            self.log("INFO", f"Ejecutando nmap -sU -T4 --open -p {port_str} {subnet_str}")
            self.nm.scan(hosts=subnet_str, ports=port_str, arguments=f'-sU -T4 --open')
            
            # Procesar resultados
            for host in self.nm.all_hosts():
                if host == local_ip:
                    continue
                    
                try:
                    # Verificar si el puerto está abierto o abierto|filtrado
                    if (self.port in self.nm[host]['udp'] and
                        self.nm[host]['udp'][self.port]['state'] in ['open', 'open|filtered']):
                        results[host] = True
                        self.log("INFO", f"Puerto {self.port} abierto en {host}")
                    else:
                        results[host] = False
                except KeyError:
                    results[host] = False
                    
        except Exception as e:
            self.log("ERROR", f"Error en escaneo Nmap: {e}")
            
        open_count = sum(results.values())
        self.log("INFO", f"Escaneo Nmap completado. Encontrados {open_count} hosts con puerto abierto")
        
        return results

# Escáner basado en sockets estándar (fallback)
class SocketUdpScanner(BaseUdpScanner):
    """Implementación de escáner UDP usando la librería socket estándar"""
    
    def check_port(self, ip: str) -> bool:
        """
        Comprueba si un puerto UDP está abierto usando sockets
        
        Args:
            ip: Dirección IP a comprobar
            
        Returns:
            True si el puerto podría estar abierto, False si hay error claro
        """
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(self.timeout)
        
        try:
            # Para UDP, enviamos datos y verificamos si hay errores
            sock.sendto(b"PING", (ip, self.port))
            
            # Intentar recibir datos (poco probable en UDP)
            try:
                sock.recvfrom(1024)
                # Si recibimos respuesta, definitivamente está abierto
                return True
            except socket.timeout:
                # Timeout puede significar abierto o filtrado
                return True
                
        except (socket.error, socket.gaierror):
            # Error claro significa cerrado o host no alcanzable
            return False
        finally:
            sock.close()
    
    def scan_subnet(self, subnet: ipaddress.IPv4Network, max_workers: int = 100) -> Dict[str, bool]:
        """
        Escanea una subred para encontrar puertos UDP potencialmente abiertos
        
        Args:
            subnet: La subred a escanear
            max_workers: Número máximo de hilos para el escaneo paralelo
            
        Returns:
            Diccionario con IPs como claves y estado del puerto como valores
        """
        results = {}
        local_ip = self.get_local_ip()
        
        self.log("INFO", f"Iniciando escaneo de sockets para puerto UDP {self.port} en {subnet}")
        
        # Dividir la subred en bloques para mejor rendimiento
        all_ips = list(str(ip) for ip in subnet.hosts() if str(ip) != local_ip)
        total_ips = len(all_ips)
        
        if total_ips == 0:
            return {}
            
        self.log("INFO", f"Escaneando {total_ips} hosts...")
        
        # Usar ThreadPoolExecutor para paralelismo
        with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
            # Mapear cada IP a un futuro
            future_to_ip = {executor.submit(self.check_port, ip): ip for ip in all_ips}
            
            # Procesar resultados a medida que se completan
            for future in concurrent.futures.as_completed(future_to_ip):
                ip = future_to_ip[future]
                
                try:
                    is_open = future.result()
                    results[ip] = is_open
                    
                    if is_open:
                        self.log("INFO", f"Puerto {self.port} potencialmente abierto en {ip}")
                except Exception as e:
                    self.log("ERROR", f"Error escaneando {ip}: {e}")
        
        open_count = sum(results.values())
        self.log("INFO", f"Escaneo completado. Encontrados {open_count} hosts potenciales de {total_ips}")
        
        return results

# Detector de transmisiones activas
class UdpTransmissionDetector:
    """Detector de transmisiones UDP activas"""
    
    def __init__(self, port: int = None):
        """
        Inicializa el detector de transmisiones UDP
        
        Args:
            port: Puerto UDP a monitorear
        """
        self.port = port if port is not None else config.UDP_PORT
        self.scan_results = {}
        self._active_scan = False
        self._scan_complete_event = threading.Event()
        self._listener_socket = None
        self._listener_thread = None
        self.log = log if 'log' in globals() else utils.log
    
    def _listen_for_udp(self, ips: List[str]) -> None:
        """
        Escucha paquetes UDP para detectar transmisiones activas
        
        Args:
            ips: Lista de direcciones IP a monitorear
        """
        try:
            # Crear socket para escuchar en el puerto especificado
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            sock.bind(("0.0.0.0", self.port))
            sock.settimeout(1.0)  # 1 segundo de timeout para checks de cancelación
            
            self._listener_socket = sock
            
            self.log("INFO", f"Escuchando transmisiones UDP en puerto {self.port}")
            
            # Monitorear durante el tiempo especificado
            while self._active_scan:
                try:
                    data, addr = sock.recvfrom(4096)
                    ip = addr[0]
                    
                    # Si recibimos datos de una IP en la lista de monitoreo
                    # o si la lista está vacía (monitorear todo)
                    if not ips or ip in ips:
                        # Actualizamos el resultado con los datos recibidos
                        if ip not in self.scan_results:
                            self.scan_results[ip] = {"active": True, "first_seen": time.time(), "count": 1}
                        else:
                            self.scan_results[ip]["count"] += 1
                            
                        # Log detallado de los primeros paquetes recibidos
                        if self.scan_results[ip]["count"] <= 3:
                            self.log("INFO", f"Recibidos datos desde {ip}:{addr[1]} - {len(data)} bytes")
                            
                except socket.timeout:
                    # Timeout normal, continuamos el ciclo
                    continue
                except Exception as e:
                    self.log("ERROR", f"Error en monitor UDP: {e}")
                    break
                    
        except Exception as e:
            self.log("ERROR", f"Error al configurar el monitor UDP: {e}")
        finally:
            if self._listener_socket:
                self._listener_socket.close()
                self._listener_socket = None
            
            # Señalizar que hemos completado el escaneo
            self._scan_complete_event.set()
    
    def start_active_detection(self, ips: List[str] = None, duration: int = 30) -> None:
        """
        Inicia la detección activa de transmisiones UDP
        
        Args:
            ips: Lista de IPs a monitorear (None para monitorear todas)
            duration: Duración del monitoreo en segundos
        """
        if self._active_scan:
            self.log("WARNING", "Ya hay un escaneo activo en progreso")
            return
        
        # Inicializar/resetear variables
        self._active_scan = True
        self._scan_complete_event.clear()
        self.scan_results = {}
        
        # Iniciar hilo de escucha
        self._listener_thread = threading.Thread(
            target=self._listen_for_udp,
            args=(ips or [],),
            daemon=True
        )
        self._listener_thread.start()
        
        self.log("INFO", f"Monitoreo iniciado por {duration} segundos")
        
        # Esperar la duración especificada
        time.sleep(duration)
        
        # Detener el monitoreo
        self.stop_active_detection()
    
    def stop_active_detection(self) -> None:
        """Detiene el monitoreo de transmisiones UDP"""
        if not self._active_scan:
            return
            
        self._active_scan = False
        
        # Si hay un socket activo, cerrarlo para liberar el hilo
        if self._listener_socket:
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                sock.sendto(b"STOP", ("127.0.0.1", self.port))
                sock.close()
            except Exception:
                pass
        
        # Esperar a que el hilo termine
        if self._listener_thread and self._listener_thread.is_alive():
            self._scan_complete_event.wait(timeout=5.0)
            
        self.log("INFO", "Monitoreo de transmisiones UDP detenido")

# Fachada para seleccionar el mejor método disponible
class UdpScannerFactory:
    """Fábrica para crear el escáner UDP más apropiado según las bibliotecas disponibles"""
    
    @staticmethod
    def create_scanner(port: int = None, method: str = None) -> BaseUdpScanner:
        """
        Crea un escáner UDP utilizando el mejor método disponible
        
        Args:
            port: Puerto UDP a escanear
            method: Método a utilizar ('scapy', 'nmap', 'socket' o None para autodetectar)
            
        Returns:
            Instancia de escáner UDP
        """
        log_fn = log if 'log' in globals() else utils.log
        
        if method == 'scapy' or (method is None and SCAPY_AVAILABLE):
            try:
                log_fn("INFO", "Utilizando Scapy para el escaneo (más preciso)")
                return ScapyUdpScanner(port=port)
            except ImportError:
                log_fn("WARNING", "No se pudo inicializar Scapy")
        
        if method == 'nmap' or (method is None and NMAP_AVAILABLE):
            try:
                log_fn("INFO", "Utilizando Nmap para el escaneo (más completo)")
                return NmapUdpScanner(port=port)
            except ImportError:
                log_fn("WARNING", "No se pudo inicializar Nmap")
        
        log_fn("INFO", "Utilizando sockets estándar para el escaneo (método básico)")
        return SocketUdpScanner(port=port)

# Función unificada de escaneo
def scan_network_for_udp(port: int = None, cidr: int = 24, duration: int = 30, 
                        method: str = None) -> Dict[str, Any]:
    """
    Escanea la red para encontrar transmisores UDP activos
    
    Args:
        port: Puerto UDP a escanear
        cidr: Máscara de red CIDR
        duration: Duración del escaneo activo en segundos
        method: Método de escaneo ('scapy', 'nmap', 'socket' o None para autodetectar)
        
    Returns:
        Diccionario con resultados del escaneo
    """
    log_fn = log if 'log' in globals() else utils.log
    
    # Crear el escáner más apropiado
    scanner = UdpScannerFactory.create_scanner(port, method)
    
    # Obtener la IP local y la subred
    local_ip = scanner.get_local_ip()
    subnet = scanner.get_subnet(local_ip, cidr)
    
    log_fn("INFO", f"Iniciando escaneo para puerto UDP {scanner.port} en subred {subnet}")
    log_fn("INFO", f"IP local: {local_ip}")
    
    # Fase 1: Escaneo de puertos en la subred
    port_scan_results = scanner.scan_subnet(subnet)
    
    # Filtrar solo las IPs con puertos potencialmente abiertos
    potential_ips = [ip for ip, is_open in port_scan_results.items() if is_open]
    
    if not potential_ips:
        log_fn("INFO", f"No se encontraron hosts con puerto {scanner.port} abierto en la subred")
        return {
            "local_ip": local_ip,
            "subnet": str(subnet),
            "port": scanner.port,
            "potential_transmitters": [],
            "active_transmitters": []
        }
    
    log_fn("INFO", f"Encontrados {len(potential_ips)} hosts con puerto {scanner.port} potencialmente abierto")
    
    # Fase 2: Detección activa de transmisiones
    log_fn("INFO", f"Iniciando detección activa por {duration} segundos")
    
    detector = UdpTransmissionDetector(port=scanner.port)
    detector.start_active_detection(potential_ips, duration)
    
    # Preparar resultados
    active_ips = [ip for ip, data in detector.scan_results.items() if data.get("active", False)]
    
    log_fn("INFO", f"Escaneo completo. Encontrados {len(active_ips)} transmisores activos")
    if active_ips:
        active_str = ", ".join(active_ips)
        log_fn("INFO", f"Transmisores activos: {active_str}")
    
    return {
        "local_ip": local_ip,
        "subnet": str(subnet),
        "port": scanner.port,
        "scan_method": scanner.__class__.__name__,
        "potential_transmitters": potential_ips,
        "active_transmitters": [
            {
                "ip": ip,
                "count": detector.scan_results[ip].get("count", 0),
                "first_seen": detector.scan_results[ip].get("first_seen", 0)
            }
            for ip in active_ips
        ]
    }

# Función para ejecutar el scanner desde línea de comandos o como módulo
def run_scanner_cli(port: int = 5403, cidr: int = 24, duration: int = 30, 
                   method: str = None, json_output: bool = False, 
                   auto_config: bool = False) -> Dict[str, Any]:
    """
    Ejecuta el scanner de red con opciones de línea de comandos
    
    Args:
        port: Puerto UDP a escanear
        cidr: Máscara de red CIDR
        duration: Duración del escaneo activo en segundos
        method: Método de escaneo ('scapy', 'nmap', 'socket' o None para autodetectar)
        json_output: Si es True, muestra resultados en formato JSON
        auto_config: Si es True, configura automáticamente el primer transmisor activo
        
    Returns:
        Diccionario con resultados del escaneo
    """
    try:
        # Ejecutar el escaneo
        results = scan_network_for_udp(
            port=port,
            cidr=cidr,
            duration=duration,
            method=method
        )
        
        # Mostrar resultados en JSON si se solicitó
        if json_output:
            print(json.dumps(results, indent=2))
            return results
        
        # Mostrar resultados en formato legible
        print("\n=== Resultados del escaneo ===\n")
        print(f"IP local: {results['local_ip']}")
        print(f"Subred: {results['subnet']}")
        print(f"Puerto escaneado: {port}")
        print(f"Método utilizado: {results['scan_method']}")
        
        if results['potential_transmitters']:
            print(f"\nHosts con puerto {port} potencialmente abierto:")
            for ip in results['potential_transmitters']:
                print(f"  - {ip}")
        else:
            print(f"\nNo se encontraron hosts con puerto {port} abierto")
        
        if results['active_transmitters']:
            print("\nTransmisores UDP activos detectados:")
            for transmitter in results['active_transmitters']:
                print(f"  - {transmitter['ip']} "
                      f"(Paquetes: {transmitter['count']}, "
                      f"Detectado: {time.strftime('%H:%M:%S', time.localtime(transmitter['first_seen']))})")
        else:
            print("\nNo se detectaron transmisiones UDP activas")
            
        # Si se solicitó auto-configuración y hay transmisores activos
        if auto_config and results['active_transmitters'] and MYLAPS_AVAILABLE:
            # Seleccionar el transmisor con más paquetes
            best_transmitter = max(results['active_transmitters'], key=lambda x: x['count'])
            ip = best_transmitter['ip']
            
            print(f"\n=== Configuración automática ===")
            print(f"Configurando ingestor para recibir desde {ip}:{port}")
            
            # Actualizar la configuración
            new_config = {
                "udp_host": ip,
                "udp_port": port
            }
            
            config.update_config(new_config)
            print("Configuración actualizada. Reinicie el ingestor para aplicar los cambios.")
            
        return results
        
    except KeyboardInterrupt:
        print("\nOperación cancelada por el usuario.")
        return {"error": "Operación cancelada por el usuario"}
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        return {"error": str(e)}

# Script independiente
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Escáner avanzado de subred para puertos UDP')
    parser.add_argument('-p', '--port', type=int, default=5403,
                        help='Puerto UDP a escanear (predeterminado: 5403)')
    parser.add_argument('-c', '--cidr', type=int, default=24,
                        help='Máscara de subred en formato CIDR (predeterminado: 24)')
    parser.add_argument('-d', '--duration', type=int, default=30,
                        help='Duración del monitoreo activo en segundos (predeterminado: 30)')
    parser.add_argument('-m', '--method', choices=['scapy', 'nmap', 'socket'],
                        help='Método de escaneo a utilizar')
    parser.add_argument('-j', '--json', action='store_true',
                        help='Muestra los resultados en formato JSON')
    parser.add_argument('-a', '--auto-config', action='store_true',
                        help='Configura automáticamente el primer transmisor activo encontrado')
    
    args = parser.parse_args()
    
    # Ejecutar el scanner con argumentos de línea de comandos
    results = run_scanner_cli(
        port=args.port,
        cidr=args.cidr,
        duration=args.duration,
        method=args.method,
        json_output=args.json,
        auto_config=args.auto_config
    )
    
    # Devolver código de salida apropiado
    if 'error' in results:
        sys.exit(1)
    elif args.json and not results.get('active_transmitters', []):
        sys.exit(1)
    else:
        sys.exit(0)