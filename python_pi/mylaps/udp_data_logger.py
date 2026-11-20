#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Registrador de datos UDP para el sistema MyLaps
Captura y guarda paquetes UDP para su análisis y procesamiento
"""

import os
import sys
import time
import json
import socket
import struct
import logging
import threading
from typing import Dict, Any, List, Optional, Tuple, BinaryIO
from datetime import datetime

# Configuración del sistema de registro
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger("UdpDataLogger")

# Constantes
DEFAULT_PORT = 5403
DEFAULT_BUFFER_SIZE = 2048
DEFAULT_LOG_DIR = "logs/udp"
DEFAULT_RAW_DIR = "raw"
DEFAULT_DECODED_DIR = "decoded"

class UdpDataLogger:
    """
    Clase para registrar y guardar datos UDP de MyLaps en tiempo real
    """
    
    def __init__(self, port: int = DEFAULT_PORT, 
                 log_dir: str = DEFAULT_LOG_DIR,
                 save_raw: bool = True,
                 save_decoded: bool = True,
                 buffer_size: int = DEFAULT_BUFFER_SIZE):
        """
        Inicializa el registrador de datos UDP
        
        Args:
            port: Puerto UDP para escuchar
            log_dir: Directorio para almacenar los archivos de registro
            save_raw: Si debe guardar los paquetes sin procesar
            save_decoded: Si debe guardar los paquetes decodificados
            buffer_size: Tamaño del buffer para recepción de datos
        """
        self.port = port
        self.buffer_size = buffer_size
        self.log_dir = log_dir
        self.save_raw = save_raw
        self.save_decoded = save_decoded
        
        # Estado interno
        self.running = False
        self.socket = None
        self.listener_thread = None
        self.raw_file = None
        self.decoded_file = None
        self.log_date = None
        self.log_filename_base = None
        self.packets_received = 0
        self.bytes_received = 0
        
        # Callbacks
        self.packet_callbacks = []
        
        # Crear directorios de registro
        self._ensure_log_dirs()
    
    def _ensure_log_dirs(self):
        """Crea los directorios de registro si no existen"""
        if self.save_raw:
            raw_path = os.path.join(self.log_dir, DEFAULT_RAW_DIR)
            if not os.path.exists(raw_path):
                os.makedirs(raw_path, exist_ok=True)
        
        if self.save_decoded:
            decoded_path = os.path.join(self.log_dir, DEFAULT_DECODED_DIR)
            if not os.path.exists(decoded_path):
                os.makedirs(decoded_path, exist_ok=True)
    
    def _create_log_files(self):
        """Crea nuevos archivos de registro con la fecha actual"""
        # Cerrar archivos existentes
        self._close_log_files()
        
        # Obtener fecha actual
        self.log_date = datetime.now()
        date_str = self.log_date.strftime("%Y%m%d_%H%M%S")
        self.log_filename_base = f"mylaps_udp_{date_str}"
        
        # Crear archivos de registro
        if self.save_raw:
            raw_path = os.path.join(self.log_dir, DEFAULT_RAW_DIR, f"{self.log_filename_base}.bin")
            self.raw_file = open(raw_path, "wb")
            logger.info(f"Guardando paquetes sin procesar en: {raw_path}")
        
        if self.save_decoded:
            decoded_path = os.path.join(self.log_dir, DEFAULT_DECODED_DIR, f"{self.log_filename_base}.json")
            self.decoded_file = open(decoded_path, "w", encoding="utf-8")
            logger.info(f"Guardando paquetes decodificados en: {decoded_path}")
            
            # Iniciar archivo JSON como un array
            self.decoded_file.write("[\n")
    
    def _close_log_files(self):
        """Cierra los archivos de registro abiertos"""
        if self.raw_file:
            try:
                self.raw_file.close()
            except:
                pass
            self.raw_file = None
        
        if self.decoded_file:
            try:
                # Cerrar el array JSON
                if self.packets_received > 0:
                    self.decoded_file.write("\n]\n")
                else:
                    self.decoded_file.write("]\n")
                self.decoded_file.close()
            except:
                pass
            self.decoded_file = None
    
    def add_packet_callback(self, callback):
        """
        Añade un callback que será llamado con cada paquete recibido
        
        Args:
            callback: Función que recibe (datos_binarios, dirección_ip_fuente)
        """
        if callable(callback) and callback not in self.packet_callbacks:
            self.packet_callbacks.append(callback)
            return True
        return False
    
    def remove_packet_callback(self, callback):
        """
        Elimina un callback previamente registrado
        
        Args:
            callback: Función previamente registrada
        """
        if callback in self.packet_callbacks:
            self.packet_callbacks.remove(callback)
            return True
        return False
    
    def start(self):
        """Inicia el registrador de datos UDP"""
        if self.running:
            logger.warning("El registrador ya está ejecutándose")
            return False
        
        try:
            # Crear socket UDP
            self.socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.socket.bind(("0.0.0.0", self.port))
            
            # Reiniciar contadores
            self.packets_received = 0
            self.bytes_received = 0
            
            # Crear archivos de registro
            self._create_log_files()
            
            # Iniciar hilo de escucha
            self.running = True
            self.listener_thread = threading.Thread(target=self._listen_for_data)
            self.listener_thread.daemon = True
            self.listener_thread.start()
            
            logger.info(f"Registrador iniciado en puerto UDP {self.port}")
            return True
            
        except Exception as e:
            logger.error(f"Error al iniciar registrador: {e}")
            self._cleanup()
            return False
    
    def _listen_for_data(self):
        """Escucha y registra datos UDP"""
        try:
            logger.info(f"Esperando paquetes UDP en puerto {self.port}...")
            
            # Fijar tiempo de espera del socket
            self.socket.settimeout(0.5)
            
            while self.running:
                try:
                    # Recibir datos
                    data, addr = self.socket.recvfrom(self.buffer_size)
                    src_ip = addr[0]
                    
                    # Incrementar contadores
                    self.packets_received += 1
                    self.bytes_received += len(data)
                    
                    # Procesar el paquete recibido
                    self._process_packet(data, src_ip)
                    
                except socket.timeout:
                    # Tiempo de espera normal
                    continue
                except Exception as e:
                    if self.running:  # Solo mostrar errores si aún estamos ejecutando
                        logger.error(f"Error recibiendo datos: {e}")
            
        except Exception as e:
            if self.running:  # Solo mostrar errores si aún estamos ejecutando
                logger.error(f"Error en hilo de escucha: {e}")
        
        finally:
            logger.info("Hilo de escucha finalizado")
    
    def _process_packet(self, data: bytes, src_ip: str):
        """
        Procesa un paquete UDP recibido
        
        Args:
            data: Datos binarios recibidos
            src_ip: Dirección IP de origen
        """
        timestamp = time.time()
        
        # Llamar callbacks registrados
        for callback in self.packet_callbacks:
            try:
                callback(data, src_ip)
            except Exception as e:
                logger.error(f"Error en callback: {e}")
        
        # Guardar datos sin procesar
        if self.save_raw and self.raw_file:
            try:
                # Formato: [longitud 4 bytes][timestamp 8 bytes][datos]
                length = len(data)
                header = struct.pack("<IQ", length, int(timestamp * 1000))
                self.raw_file.write(header)
                self.raw_file.write(data)
                self.raw_file.flush()
            except Exception as e:
                logger.error(f"Error guardando datos sin procesar: {e}")
        
        # Guardar datos decodificados
        if self.save_decoded and self.decoded_file:
            try:
                # Intentar decodificar el paquete
                packet_info = self._decode_packet(data, timestamp, src_ip)
                
                # Convertir a JSON
                if self.packets_received > 1:
                    self.decoded_file.write(",\n")
                
                json_data = json.dumps(packet_info, indent=2)
                self.decoded_file.write(json_data)
                self.decoded_file.flush()
                
            except Exception as e:
                logger.error(f"Error guardando datos decodificados: {e}")
    
    def _decode_packet(self, data: bytes, timestamp: float, src_ip: str) -> Dict[str, Any]:
        """
        Decodifica un paquete UDP en formato legible
        
        Args:
            data: Datos binarios a decodificar
            timestamp: Marca de tiempo de recepción
            src_ip: Dirección IP de origen
            
        Returns:
            Diccionario con la información decodificada
        """
        packet_info = {
            "timestamp": timestamp,
            "datetime": datetime.fromtimestamp(timestamp).isoformat(),
            "source_ip": src_ip,
            "length": len(data),
            "data": {
                "hex": data.hex(),
                "format": "unknown"
            }
        }
        
        # Intentar detectar el formato de los datos
        # Aquí se podría integrar con un decodificador específico para MyLaps
        # Por ahora solo guardaremos información básica
        
        return packet_info
    
    def get_stats(self) -> Dict[str, Any]:
        """
        Obtiene estadísticas del registrador
        
        Returns:
            Diccionario con estadísticas de funcionamiento
        """
        duration = 0
        if self.log_date:
            duration = (datetime.now() - self.log_date).total_seconds()
            
        return {
            "running": self.running,
            "port": self.port,
            "started_at": self.log_date.isoformat() if self.log_date else None,
            "duration": duration,
            "packets_received": self.packets_received,
            "bytes_received": self.bytes_received,
            "callbacks_registered": len(self.packet_callbacks),
            "save_raw": self.save_raw,
            "save_decoded": self.save_decoded,
            "log_filename_base": self.log_filename_base
        }
    
    def stop(self):
        """Detiene el registrador de datos UDP"""
        if not self.running:
            logger.warning("El registrador no está ejecutándose")
            return False
        
        logger.info("Deteniendo registrador...")
        self.running = False
        self._cleanup()
        
        logger.info(f"Registrador detenido. Se recibieron {self.packets_received} paquetes "
                   f"({self.bytes_received} bytes)")
        return True
    
    def _cleanup(self):
        """Limpia los recursos utilizados"""
        # Cerrar archivos de registro
        self._close_log_files()
        
        # Cerrar socket
        if self.socket:
            try:
                self.socket.close()
            except:
                pass
            self.socket = None
        
        # Esperar a que termine el hilo
        if self.listener_thread and self.listener_thread.is_alive():
            # No esperaremos indefinidamente
            self.listener_thread.join(timeout=1.0)
        
        self.listener_thread = None


class UdpLogFileReader:
    """
    Clase para leer archivos de registro UDP grabados previamente
    """
    
    def __init__(self, raw_file_path: str):
        """
        Inicializa el lector de archivos de registro
        
        Args:
            raw_file_path: Ruta al archivo binario de registro
        """
        self.file_path = raw_file_path
        self.file = None
    
    def __enter__(self):
        """Soporte para uso con 'with'"""
        self.open()
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        """Soporte para uso con 'with'"""
        self.close()
    
    def open(self):
        """Abre el archivo de registro"""
        self.file = open(self.file_path, "rb")
        return self
    
    def close(self):
        """Cierra el archivo de registro"""
        if self.file:
            self.file.close()
            self.file = None
    
    def read_packet(self) -> Optional[Tuple[bytes, float]]:
        """
        Lee el siguiente paquete del archivo
        
        Returns:
            Tupla (datos_binarios, timestamp) o None si no hay más paquetes
        """
        if not self.file:
            raise ValueError("Archivo no abierto")
            
        try:
            # Leer encabezado [longitud 4 bytes][timestamp 8 bytes]
            header = self.file.read(12)
            if not header or len(header) < 12:
                return None
                
            length, timestamp_ms = struct.unpack("<IQ", header)
            timestamp = timestamp_ms / 1000.0  # Convertir a segundos
            
            # Leer datos según la longitud
            data = self.file.read(length)
            if not data or len(data) < length:
                return None
                
            return (data, timestamp)
            
        except Exception as e:
            logger.error(f"Error leyendo paquete: {e}")
            return None
    
    def read_all_packets(self) -> List[Tuple[bytes, float]]:
        """
        Lee todos los paquetes del archivo
        
        Returns:
            Lista de tuplas (datos_binarios, timestamp)
        """
        if not self.file:
            raise ValueError("Archivo no abierto")
        
        result = []
        while True:
            packet = self.read_packet()
            if packet is None:
                break
            result.append(packet)
        
        return result


# Funciones de utilidad
def find_log_files(log_dir: str = DEFAULT_LOG_DIR, raw: bool = True) -> List[str]:
    """
    Busca archivos de registro en el directorio especificado
    
    Args:
        log_dir: Directorio base de registros
        raw: Si debe buscar archivos raw (True) o decodificados (False)
    
    Returns:
        Lista de rutas a archivos de registro encontrados
    """
    subdir = DEFAULT_RAW_DIR if raw else DEFAULT_DECODED_DIR
    search_dir = os.path.join(log_dir, subdir)
    
    if not os.path.exists(search_dir):
        return []
        
    extension = ".bin" if raw else ".json"
    
    # Buscar archivos con la extensión correcta
    files = []
    for filename in os.listdir(search_dir):
        if filename.endswith(extension) and filename.startswith("mylaps_udp_"):
            files.append(os.path.join(search_dir, filename))
    
    # Ordenar por fecha (más reciente primero)
    files.sort(reverse=True)
    
    return files

def replay_log_file(file_path: str, port: int = DEFAULT_PORT, 
                   real_time: bool = True) -> bool:
    """
    Reproduce un archivo de registro enviando los paquetes por UDP
    
    Args:
        file_path: Ruta al archivo de registro binario
        port: Puerto UDP al que enviar los paquetes
        real_time: Si debe respetar los tiempos originales entre paquetes
        
    Returns:
        True si la reproducción fue exitosa, False en caso contrario
    """
    if not os.path.exists(file_path):
        logger.error(f"Archivo no encontrado: {file_path}")
        return False
    
    try:
        # Crear socket para envío
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        
        # Leer y enviar paquetes
        with UdpLogFileReader(file_path) as reader:
            packets = reader.read_all_packets()
            
            if not packets:
                logger.warning("No se encontraron paquetes en el archivo")
                return False
            
            logger.info(f"Reproduciendo {len(packets)} paquetes de {file_path}")
            
            # Tiempo de inicio de la reproducción
            start_time = time.time()
            # Tiempo del primer paquete para calcular deltas
            first_packet_time = packets[0][1]
            
            for i, (data, timestamp) in enumerate(packets):
                # Calcular tiempo de espera si estamos en modo tiempo real
                if real_time and i > 0:
                    time_delta = timestamp - packets[i-1][1]
                    if time_delta > 0:
                        time.sleep(time_delta)
                
                # Enviar el paquete al puerto local
                sock.sendto(data, ("127.0.0.1", port))
                
                # Mostrar progreso
                if i % 100 == 0 or i == len(packets) - 1:
                    elapsed = time.time() - start_time
                    progress = (i + 1) / len(packets) * 100
                    logger.info(f"Progreso: {progress:.1f}% ({i+1}/{len(packets)}, {elapsed:.1f}s)")
            
            # Cierre limpio
            sock.close()
            
            logger.info(f"Reproducción completada. Se enviaron {len(packets)} paquetes.")
            return True
            
    except Exception as e:
        logger.error(f"Error reproduciendo archivo: {e}")
        return False


# Punto de entrada si se ejecuta directamente
def main():
    """Función principal para ejecución directa"""
    import argparse
    
    # Analizar argumentos de línea de comandos
    parser = argparse.ArgumentParser(description="Registrador de datos UDP para MyLaps")
    
    # Subcomandos
    subparsers = parser.add_subparsers(dest="command", help="Comandos disponibles")
    
    # Comando para registrar datos
    log_cmd = subparsers.add_parser("log", help="Registra datos UDP entrantes")
    log_cmd.add_argument("-p", "--port", type=int, default=DEFAULT_PORT,
                        help=f"Puerto UDP para escuchar (predeterminado: {DEFAULT_PORT})")
    log_cmd.add_argument("-d", "--dir", type=str, default=DEFAULT_LOG_DIR,
                        help=f"Directorio para guardar registros (predeterminado: {DEFAULT_LOG_DIR})")
    log_cmd.add_argument("--no-raw", action="store_true",
                        help="No guardar datos sin procesar")
    log_cmd.add_argument("--no-decode", action="store_true",
                        help="No guardar datos decodificados")
    
    # Comando para listar archivos de registro
    list_cmd = subparsers.add_parser("list", help="Lista archivos de registro disponibles")
    list_cmd.add_argument("-d", "--dir", type=str, default=DEFAULT_LOG_DIR,
                         help=f"Directorio base de registros (predeterminado: {DEFAULT_LOG_DIR})")
    list_cmd.add_argument("--decoded", action="store_true",
                         help="Listar archivos decodificados en lugar de archivos raw")
    
    # Comando para reproducir un archivo de registro
    replay_cmd = subparsers.add_parser("replay", help="Reproduce un archivo de registro")
    replay_cmd.add_argument("file", type=str, help="Ruta al archivo de registro binario")
    replay_cmd.add_argument("-p", "--port", type=int, default=DEFAULT_PORT,
                           help=f"Puerto UDP al que enviar los paquetes (predeterminado: {DEFAULT_PORT})")
    replay_cmd.add_argument("--no-realtime", action="store_true",
                           help="No respetar tiempos originales entre paquetes")
    
    args = parser.parse_args()
    
    # Ejecutar comando seleccionado
    if args.command == "log":
        logger.info(f"Iniciando registrador en puerto {args.port}")
        
        # Crear registrador
        udp_logger = UdpDataLogger(
            port=args.port,
            log_dir=args.dir,
            save_raw=not args.no_raw,
            save_decoded=not args.no_decode
        )
        
        # Iniciar registrador
        if udp_logger.start():
            try:
                # Esperar hasta que el usuario presione Ctrl+C
                print("Registrador en ejecución. Presione Ctrl+C para detener.")
                while True:
                    time.sleep(1)
                    
                    # Mostrar estadísticas cada 10 segundos
                    if udp_logger.packets_received % 10 == 0:
                        stats = udp_logger.get_stats()
                        print(f"Paquetes: {stats['packets_received']}, "
                              f"Bytes: {stats['bytes_received']}")
                    
            except KeyboardInterrupt:
                print("Deteniendo registrador...")
            finally:
                udp_logger.stop()
        
    elif args.command == "list":
        # Listar archivos de registro
        files = find_log_files(args.dir, not args.decoded)
        
        if not files:
            print(f"No se encontraron archivos de registro en {args.dir}")
        else:
            print(f"Archivos de registro {'decodificados' if args.decoded else 'binarios'} disponibles:")
            for i, file_path in enumerate(files):
                file_size = os.path.getsize(file_path) / (1024 * 1024)  # MB
                file_date = datetime.fromtimestamp(os.path.getmtime(file_path))
                print(f"{i+1}. {os.path.basename(file_path)} "
                      f"({file_size:.2f} MB, {file_date.strftime('%Y-%m-%d %H:%M:%S')})")
    
    elif args.command == "replay":
        # Reproducir archivo de registro
        replay_log_file(
            file_path=args.file,
            port=args.port,
            real_time=not args.no_realtime
        )
    
    else:
        # Si no se especifica comando, mostrar ayuda
        parser.print_help()

# Función auxiliar para crear un logger UDP desde la API externa
def create_udp_logger(port: int, log_dir: str = None) -> UdpDataLogger:
    """
    Crea y configura una instancia del logger UDP
    
    Args:
        port: Puerto UDP a escuchar
        log_dir: Directorio para guardar los logs (opcional)
        
    Returns:
        Instancia configurada de UdpDataLogger
    """
    return UdpDataLogger(port=port, log_dir=log_dir)

if __name__ == "__main__":
    main()