#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Módulo de escaneo de subred UDP utilizando Scapy
"""

import time
import socket
import ipaddress
import threading
import json
from typing import List, Dict, Any, Optional, Tuple
import logging

try:
    from scapy.all import sr1, IP, UDP, ICMP
    SCAPY_AVAILABLE = True
except ImportError:
    SCAPY_AVAILABLE = False
    print("Scapy no está instalado. Para una detección más eficiente: pip install scapy")

class ScapyUdpScanner:
    """Escáner de subred para encontrar IPs transmitiendo en un puerto UDP específico usando Scapy"""
    
    def __init__(self, port: int = 5403, timeout: float = 1.0, retries: int = 2):
        """
        Inicializa el escáner UDP con Scapy
        
        Args:
            port: Puerto UDP a escanear
            timeout: Tiempo máximo de espera para cada sondeo en segundos
            retries: Número de reintentos para cada IP
        """
        if not SCAPY_AVAILABLE:
            raise ImportError("Esta clase requiere Scapy. Instálalo con: pip install scapy")
            
        self.port = port
        self.timeout = timeout
        self.retries = retries
        self.scan_results = {}
        self._active_scan = False
        self._listener_thread = None
        self._listener_socket = None
        self._scan_complete_event = threading.Event()
    
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
    
    def scan_port_on_ip(self, ip: str) -> bool:
        """
        Escanea un puerto UDP en una IP específica utilizando Scapy
        
        Args:
            ip: Dirección IP a escanear
            
        Returns:
            True si el puerto está potencialmente abierto, False en caso contrario
        """
        # Crear un paquete UDP con un payload mínimo
        packet = IP(dst=ip)/UDP(dport=self.port, sport=12345)
        
        # Enviar paquete y esperar respuesta con timeout
        for attempt in range(self.retries):
            response = sr1(packet, timeout=self.timeout, verbose=0)
            
            if response is None:
                # Sin respuesta podría significar:
                # 1. Puerto abierto (sin respuesta ICMP)
                # 2. Paquete filtrado
                # 3. Host inaccesible
                # Consideramos que es potencialmente abierto
                return True
                
            # Si recibimos una respuesta ICMP de error
            if response.haslayer(ICMP):
                icmp_type = response.getlayer(ICMP).type
                icmp_code = response.getlayer(ICMP).code
                
                # ICMP Port Unreachable (tipo 3, código 3) = puerto cerrado
                if icmp_type == 3 and icmp_code == 3:
                    return False
        
        # Si llegamos aquí, asumimos que es potencialmente abierto
        return True
    
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
        
        print(f"[INFO] Iniciando escaneo Scapy para puerto UDP {self.port} en {subnet}")
        print(f"[INFO] Este proceso puede tomar varios minutos dependiendo del tamaño de la subred")
        
        # Crear hebras para escaneo paralelo
        threads = []
        thread_results = {}
        
        # Limitar el número de hebras activas simultáneamente
        active_threads = threading.Semaphore(max_workers)
        
        def scan_worker(ip_str):
            with active_threads:
                try:
                    is_open = self.scan_port_on_ip(ip_str)
                    thread_results[ip_str] = is_open
                    if is_open:
                        print(f"[INFO] Detectado puerto {self.port} potencialmente abierto en {ip_str}")
                except Exception as e:
                    print(f"[ERROR] Error escaneando {ip_str}: {e}")
        
        # Crear hebras para cada IP
        for ip in subnet.hosts():
            ip_str = str(ip)
            if ip_str == local_ip:
                continue
                
            thread = threading.Thread(target=scan_worker, args=(ip_str,))
            threads.append(thread)
            thread.start()
        
        # Esperar a que todas las hebras terminen
        for thread in threads:
            thread.join()
            
        # Recopilar resultados
        results.update(thread_results)
        
        print(f"[INFO] Escaneo completado. Encontradas {sum(results.values())} IPs potenciales")
        return results
    
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
            
            print(f"[INFO] Escuchando transmisiones UDP en puerto {self.port}")
            
            # Monitorear durante el tiempo especificado
            while self._active_scan:
                try:
                    data, addr = sock.recvfrom(4096)
                    ip = addr[0]
                    
                    # Si recibimos datos de una IP en la lista de monitoreo
                    if ip in ips:
                        # Actualizamos el resultado con los datos recibidos
                        if ip not in self.scan_results:
                            self.scan_results[ip] = {"active": True, "first_seen": time.time(), "count": 1}
                        else:
                            self.scan_results[ip]["count"] += 1
                            
                        # Log detallado de los primeros paquetes recibidos
                        if self.scan_results[ip]["count"] <= 3:
                            print(f"[INFO] Recibidos datos desde {ip}:{addr[1]} - {len(data)} bytes")
                            
                except socket.timeout:
                    # Timeout normal, continuamos el ciclo
                    continue
                except Exception as e:
                    print(f"[ERROR] Error en monitor UDP: {e}")
                    break
                    
        except Exception as e:
            print(f"[ERROR] Error al configurar el monitor UDP: {e}")
        finally:
            if self._listener_socket:
                self._listener_socket.close()
                self._listener_socket = None
            
            # Señalizar que hemos completado el escaneo
            self._scan_complete_event.set()
    
    def start_active_detection(self, ips: List[str], duration: int = 30) -> None:
        """
        Inicia la detección activa de transmisiones UDP
        
        Args:
            ips: Lista de IPs a monitorear
            duration: Duración del monitoreo en segundos
        """
        if self._active_scan:
            print("[WARNING] Ya hay un escaneo activo en progreso")
            return
        
        # Inicializar/resetear variables
        self._active_scan = True
        self._scan_complete_event.clear()
        self.scan_results = {}
        
        # Iniciar hilo de escucha
        self._listener_thread = threading.Thread(
            target=self._listen_for_udp,
            args=(ips,),
            daemon=True
        )
        self._listener_thread.start()
        
        print(f"[INFO] Monitoreo iniciado por {duration} segundos")
        
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
            
        print("[INFO] Monitoreo de transmisiones UDP detenido")
    
    def scan_for_transmitters(self, cidr: int = 24, active_scan_duration: int = 30) -> Dict[str, Any]:
        """
        Escanea la subred para encontrar transmisores UDP activos
        
        Este método realiza un escaneo completo en dos fases:
        1. Escaneo de puertos para encontrar hosts con el puerto abierto
        2. Monitoreo activo para detectar transmisiones reales
        
        Args:
            cidr: Máscara de subred en formato CIDR (ej: 24 para /24)
            active_scan_duration: Duración del escaneo activo en segundos
            
        Returns:
            Diccionario con los resultados del escaneo
        """
        # Obtener la IP local y la subred
        local_ip = self.get_local_ip()
        subnet = self.get_subnet(local_ip, cidr)
        
        print(f"[INFO] Iniciando escaneo para puerto UDP {self.port} en subred {subnet}")
        print(f"[INFO] IP local: {local_ip}")
        
        # Fase 1: Escaneo de puertos en la subred
        port_scan_results = self.scan_subnet(subnet)
        
        # Filtrar solo las IPs con puertos potencialmente abiertos
        potential_ips = [ip for ip, is_open in port_scan_results.items() if is_open]
        
        if not potential_ips:
            print(f"[INFO] No se encontraron hosts con puerto {self.port} abierto en la subred")
            return {
                "local_ip": local_ip,
                "subnet": str(subnet),
                "port": self.port,
                "potential_transmitters": [],
                "active_transmitters": []
            }
        
        print(f"[INFO] Encontrados {len(potential_ips)} hosts con puerto {self.port} potencialmente abierto")
        print(f"[INFO] IPs potenciales: {', '.join(potential_ips)}")
        
        # Fase 2: Detección activa de transmisiones
        print(f"[INFO] Iniciando detección activa por {active_scan_duration} segundos")
        
        # Usar un thread para la detección activa ya que no se puede hacer async
        self.start_active_detection(potential_ips, active_scan_duration)
        
        # Preparar resultados
        active_ips = [ip for ip, data in self.scan_results.items() if data.get("active", False)]
        
        print(f"[INFO] Escaneo completo. Encontrados {len(active_ips)} transmisores activos")
        if active_ips:
            print(f"[INFO] Transmisores activos: {', '.join(active_ips)}")
        
        return {
            "local_ip": local_ip,
            "subnet": str(subnet),
            "port": self.port,
            "potential_transmitters": potential_ips,
            "active_transmitters": [
                {
                    "ip": ip,
                    "count": self.scan_results[ip].get("count", 0),
                    "first_seen": self.scan_results[ip].get("first_seen", 0)
                }
                for ip in active_ips
            ]
        }

class AsyncioUdpScanner:
    """Versión basada en asyncio para el escaneo de puertos UDP"""
    
    def __init__(self, port: int = 5403, timeout: float = 0.5):
        """
        Inicializa el escáner UDP asyncio
        
        Args:
            port: Puerto UDP a escanear
            timeout: Tiempo máximo de espera para cada conexión en segundos
        """
        self.port = port
        self.timeout = timeout
        
    # Implementación pendiente
    # asyncio proporciona mejor rendimiento para operaciones concurrentes de red
    # especialmente útil para escanear redes grandes
    
# Si se ejecuta directamente este archivo
if __name__ == "__main__":
    import sys
    import argparse
    
    parser = argparse.ArgumentParser(description='Escaner de subred para puertos UDP usando Scapy')
    parser.add_argument('-p', '--port', type=int, default=5403,
                        help='Puerto UDP a escanear (predeterminado: 5403)')
    parser.add_argument('-c', '--cidr', type=int, default=24,
                        help='Máscara de subred en formato CIDR (predeterminado: 24)')
    parser.add_argument('-d', '--duration', type=int, default=30,
                        help='Duración del monitoreo activo en segundos (predeterminado: 30)')
    parser.add_argument('-j', '--json', action='store_true',
                        help='Muestra los resultados en formato JSON')
    
    args = parser.parse_args()
    
    try:
        if not SCAPY_AVAILABLE:
            print("ADVERTENCIA: Scapy no está instalado. Por favor, instale para un mejor rendimiento:")
            print("pip install scapy")
            print("Utilizando método alternativo basado en sockets estándar.")
            sys.exit(1)
            
        # Crear e iniciar el escáner
        scanner = ScapyUdpScanner(port=args.port, timeout=0.5)
        results = scanner.scan_for_transmitters(cidr=args.cidr, active_scan_duration=args.duration)
        
        # Mostrar resultados en JSON si se solicitó
        if args.json:
            print(json.dumps(results, indent=2))
            # Si no hay transmisores activos, salir con código de error
            if not results['active_transmitters']:
                sys.exit(1)
                
            sys.exit(0)
        
        # Mostrar resultados en formato legible
        print("\n=== Resultados del escaneo ===\n")
        print(f"IP local: {results['local_ip']}")
        print(f"Subred: {results['subnet']}")
        print(f"Puerto escaneado: {args.port}")
        
        if results['potential_transmitters']:
            print(f"\nHosts con puerto {args.port} potencialmente abierto:")
            for ip in results['potential_transmitters']:
                print(f"  - {ip}")
        else:
            print(f"\nNo se encontraron hosts con puerto {args.port} abierto")
        
        if results['active_transmitters']:
            print("\nTransmisores UDP activos detectados:")
            for transmitter in results['active_transmitters']:
                print(f"  - {transmitter['ip']} "
                      f"(Paquetes: {transmitter['count']}, "
                      f"Detectado: {time.strftime('%H:%M:%S', time.localtime(transmitter['first_seen']))})")
        else:
            print("\nNo se detectaron transmisiones UDP activas")
    
    except KeyboardInterrupt:
        print("\nOperación cancelada por el usuario.")
        sys.exit(130)
    except Exception as e:
        print(f"\nError: {e}")
        sys.exit(1)