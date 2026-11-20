#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Módulo de escaneo de subred para detectar fuentes de transmisión UDP en el puerto de RMonitor
"""

import socket
import ipaddress
import threading
import time
import asyncio
import logging
from typing import List, Dict, Tuple, Optional, Any
from concurrent.futures import ThreadPoolExecutor

from . import config
from . import utils

class UdpScanner:
    """Escáner de subred para encontrar IPs transmitiendo en un puerto UDP específico"""
    
    def __init__(self, port: int = None, timeout: float = 0.2, max_workers: int = 50):
        """
        Inicializa el escáner UDP
        
        Args:
            port: Puerto UDP a escanear (por defecto usa el puerto configurado en config.UDP_PORT)
            timeout: Tiempo máximo de espera para cada conexión en segundos
            max_workers: Número máximo de hilos para el escaneo paralelo
        """
        self.port = port or config.UDP_PORT
        self.timeout = timeout
        self.max_workers = max_workers
        self.scan_results = {}
        self._active_scan = False
        self._listener_socket = None
        self._listener_thread = None
        self._scan_complete_event = threading.Event()
    
    def get_local_ip(self) -> str:
        """Obtiene la dirección IP local de la máquina"""
        try:
            # Crea un socket para conectarse a un servidor externo (no hace conexión real)
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))  # Google DNS
            local_ip = s.getsockname()[0]
            s.close()
            return local_ip
        except Exception:
            # Fallback: obtener hostname si lo anterior falla
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
        
        # Crear la subred con la IP y CIDR especificados
        subnet = ipaddress.IPv4Network(f"{ip}/{cidr}", strict=False)
        return subnet
    
    def port_is_open(self, ip: str, port: int) -> bool:
        """
        Comprueba si un puerto UDP está abierto en una IP específica
        
        Args:
            ip: Dirección IP a comprobar
            port: Puerto UDP a comprobar
            
        Returns:
            True si el puerto está abierto, False en caso contrario
        """
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.settimeout(self.timeout)
        
        try:
            sock.sendto(b"PING", (ip, port))
            # Para UDP, no podemos saber realmente si el puerto está abierto
            # Pero podemos intentar ver si hay respuestas ICMP de "puerto inalcanzable"
            # La ausencia de error sugiere que el puerto podría estar abierto
            return True
        except (socket.timeout, socket.error):
            return False
        finally:
            sock.close()
    
    async def async_scan_subnet(self, subnet: ipaddress.IPv4Network) -> Dict[str, bool]:
        """
        Escanea toda la subred de forma asíncrona para encontrar puertos UDP abiertos
        
        Args:
            subnet: La subred a escanear
            
        Returns:
            Diccionario con IPs como claves y estado del puerto como valores
        """
        utils.log("INFO", f"Iniciando escaneo de subred {subnet} para puerto UDP {self.port}")
        
        results = {}
        loop = asyncio.get_running_loop()
        
        with ThreadPoolExecutor(max_workers=self.max_workers) as executor:
            futures = []
            
            for ip in subnet.hosts():
                ip_str = str(ip)
                # Evitar escanear la propia IP
                if ip_str == self.get_local_ip():
                    continue
                
                # Crear una función parcial para el escaneo
                futures.append(
                    loop.run_in_executor(
                        executor, 
                        self.port_is_open,
                        ip_str,
                        self.port
                    )
                )
            
            # Esperar todos los resultados
            i = 0
            for ip in subnet.hosts():
                ip_str = str(ip)
                if ip_str == self.get_local_ip():
                    continue
                    
                is_open = await futures[i]
                results[ip_str] = is_open
                
                if is_open:
                    utils.log("INFO", f"Puerto {self.port} posiblemente abierto en {ip_str}")
                
                i += 1
        
        utils.log("INFO", f"Escaneo de subred completado. Encontradas {sum(results.values())} IPs potenciales")
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
            
            utils.log("INFO", f"Escuchando transmisiones UDP en puerto {self.port}")
            
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
                            utils.log("INFO", f"Recibidos datos desde {ip}:{addr[1]} - {len(data)} bytes")
                            
                except socket.timeout:
                    # Timeout normal, continuamos el ciclo
                    continue
                except Exception as e:
                    utils.log("ERROR", f"Error en monitor UDP: {e}")
                    break
                    
        except Exception as e:
            utils.log("ERROR", f"Error al configurar el monitor UDP: {e}")
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
            utils.log("WARNING", "Ya hay un escaneo activo en progreso")
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
        
        utils.log("INFO", f"Monitoreo iniciado por {duration} segundos")
        
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
                # Crear un nuevo socket para enviar algo al socket de escucha
                # Esto ayuda a "despertar" el socket que está en recvfrom()
                sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                sock.sendto(b"STOP", ("127.0.0.1", self.port))
                sock.close()
            except Exception:
                pass
        
        # Esperar a que el hilo termine
        if self._listener_thread and self._listener_thread.is_alive():
            self._scan_complete_event.wait(timeout=5.0)
            
        utils.log("INFO", "Monitoreo de transmisiones UDP detenido")
    
    async def scan_for_transmitters(self, cidr: int = 24, active_scan_duration: int = 30) -> Dict[str, Any]:
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
        
        utils.log("INFO", f"Iniciando escaneo para puerto UDP {self.port} en subred {subnet}")
        utils.log("INFO", f"IP local: {local_ip}")
        
        # Fase 1: Escaneo de puertos en la subred
        port_scan_results = await self.async_scan_subnet(subnet)
        
        # Filtrar solo las IPs con puertos potencialmente abiertos
        potential_ips = [ip for ip, is_open in port_scan_results.items() if is_open]
        
        if not potential_ips:
            utils.log("INFO", f"No se encontraron hosts con puerto {self.port} abierto en la subred")
            return {
                "local_ip": local_ip,
                "subnet": str(subnet),
                "port": self.port,
                "potential_transmitters": [],
                "active_transmitters": []
            }
        
        utils.log("INFO", f"Encontrados {len(potential_ips)} hosts con puerto {self.port} potencialmente abierto")
        utils.log("INFO", f"IPs potenciales: {', '.join(potential_ips)}")
        
        # Fase 2: Detección activa de transmisiones
        utils.log("INFO", f"Iniciando detección activa por {active_scan_duration} segundos")
        
        # Usar un thread para la detección activa ya que no se puede hacer async
        detection_thread = threading.Thread(
            target=self.start_active_detection,
            args=(potential_ips, active_scan_duration),
            daemon=True
        )
        detection_thread.start()
        
        # Esperar a que termine
        detection_thread.join()
        
        # Preparar resultados
        active_ips = [ip for ip, data in self.scan_results.items() if data.get("active", False)]
        
        utils.log("INFO", f"Escaneo completo. Encontrados {len(active_ips)} transmisores activos")
        if active_ips:
            utils.log("INFO", f"Transmisores activos: {', '.join(active_ips)}")
        
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


# Función de conveniencia para uso directo
async def scan_subnet(port: int = None, cidr: int = 24, duration: int = 30) -> Dict[str, Any]:
    """
    Escanea la subred para encontrar transmisores UDP activos
    
    Args:
        port: Puerto UDP a escanear (por defecto usa config.UDP_PORT)
        cidr: Máscara de subred en formato CIDR (ej: 24 para /24)
        duration: Duración del monitoreo activo en segundos
        
    Returns:
        Diccionario con los resultados del escaneo
    """
    scanner = UdpScanner(port=port)
    return await scanner.scan_for_transmitters(cidr=cidr, active_scan_duration=duration)

# Si se ejecuta directamente
if __name__ == "__main__":
    import asyncio
    
    # Configurar logging básico para pruebas directas
    logging.basicConfig(
        level=logging.INFO,
        format='%(asctime)s [%(levelname)s] %(message)s',
        datefmt='%H:%M:%S'
    )
    
    # Puerto predeterminado para RMonitor
    DEFAULT_PORT = 5403
    
    async def main():
        print(f"Escaneando subred para el puerto UDP {DEFAULT_PORT}...")
        results = await scan_subnet(port=DEFAULT_PORT)
        
        print("\nResultados del escaneo:")
        print(f"IP local: {results['local_ip']}")
        print(f"Subred: {results['subnet']}")
        print(f"Puerto escaneado: {results['port']}")
        
        if results['potential_transmitters']:
            print(f"\nHosts con puerto {DEFAULT_PORT} potencialmente abierto:")
            for ip in results['potential_transmitters']:
                print(f"  - {ip}")
        else:
            print(f"\nNo se encontraron hosts con puerto {DEFAULT_PORT} abierto")
        
        if results['active_transmitters']:
            print("\nTransmisores UDP activos detectados:")
            for transmitter in results['active_transmitters']:
                print(f"  - {transmitter['ip']} "
                      f"(Paquetes: {transmitter['count']}, "
                      f"Detectado: {time.strftime('%H:%M:%S', time.localtime(transmitter['first_seen']))})")
        else:
            print("\nNo se detectaron transmisiones UDP activas")
    
    # Ejecutar el escaneo
    asyncio.run(main())