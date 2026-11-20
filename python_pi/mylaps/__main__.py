#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Punto de entrada para ejecutar mylaps como un módulo
Permite usar: python -m mylaps
"""

import os
import sys
import argparse
from typing import Dict, Any, List, Optional

def main():
    """Función principal para ejecutar el paquete como módulo"""
    # Crear el parser principal con subcomandos
    parser = argparse.ArgumentParser(
        description="MyLaps UDP Tools - Herramientas para escaneo y análisis de datos UDP",
        epilog="Ejemplo: python -m mylaps scan --port 5403"
    )
    
    # Agregar versión
    parser.add_argument('--version', action='version', version='mylaps 1.0.0')
    
    # Crear subparsers para los diferentes comandos
    subparsers = parser.add_subparsers(dest='command', help='Comando a ejecutar')
    
    # Comando para escaneo de red
    scan_parser = subparsers.add_parser('scan', help='Escanear red en busca de transmisiones UDP')
    scan_parser.add_argument('-p', '--port', type=int, default=5403,
                            help='Puerto UDP a escanear (predeterminado: 5403)')
    scan_parser.add_argument('-c', '--cidr', type=int, default=24,
                            help='Máscara de subred en formato CIDR (predeterminado: 24)')
    scan_parser.add_argument('-d', '--duration', type=int, default=30,
                            help='Duración del monitoreo activo en segundos (predeterminado: 30)')
    scan_parser.add_argument('-m', '--method', choices=['scapy', 'nmap', 'socket'],
                            help='Método de escaneo a utilizar')
    scan_parser.add_argument('-j', '--json', action='store_true',
                            help='Muestra los resultados en formato JSON')
    scan_parser.add_argument('-a', '--auto-config', action='store_true',
                            help='Configura automáticamente el primer transmisor activo encontrado')
    
    # Comando para interfaz gráfica de escaneo
    scan_gui_parser = subparsers.add_parser('scan-gui', help='Interfaz gráfica para escaneo de red')
    
    # Comando para registro de datos UDP
    logger_parser = subparsers.add_parser('logger', help='Registrar datos UDP entrantes')
    logger_parser.add_argument('-p', '--port', type=int, default=5403,
                            help='Puerto UDP para escuchar (predeterminado: 5403)')
    logger_parser.add_argument('-d', '--dir', type=str, default='logs/udp',
                            help='Directorio para guardar registros (predeterminado: logs/udp)')
    logger_parser.add_argument('--no-raw', action='store_true',
                            help='No guardar datos sin procesar')
    logger_parser.add_argument('--no-decode', action='store_true',
                            help='No guardar datos decodificados')
    
    # Comando para listar archivos de registro
    list_parser = subparsers.add_parser('list', help='Listar archivos de registro disponibles')
    list_parser.add_argument('-d', '--dir', type=str, default='logs/udp',
                           help='Directorio base de registros (predeterminado: logs/udp)')
    list_parser.add_argument('--decoded', action='store_true',
                           help='Listar archivos decodificados en lugar de archivos raw')
    
    # Comando para reproducir un archivo de registro
    replay_parser = subparsers.add_parser('replay', help='Reproducir un archivo de registro')
    replay_parser.add_argument('file', type=str, help='Ruta al archivo de registro binario')
    replay_parser.add_argument('-p', '--port', type=int, default=5403,
                             help='Puerto UDP al que enviar los paquetes (predeterminado: 5403)')
    replay_parser.add_argument('--no-realtime', action='store_true',
                             help='No respetar tiempos originales entre paquetes')
    
    # Comando para mostrar configuración
    config_parser = subparsers.add_parser('config', help='Mostrar o modificar configuración')
    config_parser.add_argument('--show', action='store_true', 
                              help='Mostrar la configuración actual')
    config_parser.add_argument('--set', metavar='KEY=VALUE', nargs='+',
                              help='Establecer valores de configuración (ej: udp_port=5403)')
    
    # Analizar argumentos
    args = parser.parse_args()
    
    # Si no se especifica ningún comando, mostrar la ayuda
    if not args.command:
        parser.print_help()
        return
    
    # Ejecutar el comando apropiado
    if args.command == 'scan':
        # Importar aquí para evitar importaciones circulares
        from .advanced_udp_scanner import run_scanner_cli
        run_scanner_cli(
            port=args.port,
            cidr=args.cidr,
            duration=args.duration,
            method=args.method,
            json_output=args.json,
            auto_config=args.auto_config
        )
    
    elif args.command == 'scan-gui':
        # Importar aquí para evitar importaciones circulares
        from .udp_scanner_gui import main as run_scanner_gui
        run_scanner_gui()
    
    elif args.command == 'logger':
        # Importar aquí para evitar importaciones circulares
        from .udp_data_logger import UdpDataLogger
        import time
        
        logger = UdpDataLogger(
            port=args.port,
            log_dir=args.dir,
            save_raw=not args.no_raw,
            save_decoded=not args.no_decode
        )
        
        if logger.start():
            try:
                print("Logger en ejecución. Presione Ctrl+C para detener.")
                while True:
                    time.sleep(1)
                    # Mostrar estadísticas cada 10 segundos
                    if logger.packets_received % 10 == 0 and logger.packets_received > 0:
                        stats = logger.get_stats()
                        print(f"Paquetes: {stats['packets_received']}, "
                             f"Bytes: {stats['bytes_received']}")
            except KeyboardInterrupt:
                print("\nDeteniendo logger...")
            finally:
                logger.stop()
    
    elif args.command == 'list':
        # Importar aquí para evitar importaciones circulares
        from .udp_data_logger import find_log_files
        from datetime import datetime
        
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
    
    elif args.command == 'replay':
        # Importar aquí para evitar importaciones circulares
        from .udp_data_logger import replay_log_file
        
        replay_log_file(
            file_path=args.file,
            port=args.port,
            real_time=not args.no_realtime
        )
    
    elif args.command == 'config':
        # Importar aquí para evitar importaciones circulares
        from .scanner_config import print_config, update_config
        
        if args.show or not args.set:
            print_config()
            
        if args.set:
            # Procesar parámetros de configuración
            config_dict = {}
            for item in args.set:
                if '=' in item:
                    key, value = item.split('=', 1)
                    # Convertir valores numéricos si es posible
                    try:
                        if value.isdigit():
                            value = int(value)
                        elif value.lower() in ('true', 'false'):
                            value = value.lower() == 'true'
                    except (ValueError, AttributeError):
                        pass
                    
                    config_dict[key] = value
            
            if config_dict:
                if update_config(config_dict):
                    print("Configuración actualizada correctamente.")
                    print_config()
                else:
                    print("Error actualizando la configuración.")

if __name__ == "__main__":
    main()