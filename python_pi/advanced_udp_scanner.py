#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
SCRIPT WRAPPER - Redirige a la implementación en el paquete mylaps
Este archivo se mantiene por compatibilidad con scripts existentes.
"""

import os
import sys
import argparse
import json
import time

# Asegurar que el paquete mylaps sea importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Importar desde el paquete mylaps
from mylaps.advanced_udp_scanner import (
    scan_network_for_udp,
    UdpScannerFactory,
    UdpTransmissionDetector,
    BaseUdpScanner,
    ScapyUdpScanner,
    NmapUdpScanner,
    SocketUdpScanner
)

# Importar constantes de disponibilidad
from mylaps.advanced_udp_scanner import (
    SCAPY_AVAILABLE,
    NMAP_AVAILABLE,
    MYLAPS_AVAILABLE
)

# Importar config para compatibilidad con el script original
try:
    from mylaps import config
except ImportError:
    # Crear un objeto de configuración simulado para compatibilidad
    class Config:
        UDP_PORT = 5403
        
        @staticmethod
        def update_config(new_config):
            print("ADVERTENCIA: update_config llamado en wrapper simulado")
            
    config = Config()

# Script independiente - wrapper sobre la implementación principal
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
    
    try:
        # Ejecutar el escaneo
        results = scan_network_for_udp(
            port=args.port,
            cidr=args.cidr,
            duration=args.duration,
            method=args.method
        )
        
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
        print(f"Método utilizado: {results['scan_method']}")
        
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
            
        # Si se solicitó auto-configuración y hay transmisores activos
        if args.auto_config and results['active_transmitters'] and MYLAPS_AVAILABLE:
            # Seleccionar el transmisor con más paquetes
            best_transmitter = max(results['active_transmitters'], key=lambda x: x['count'])
            ip = best_transmitter['ip']
            
            print(f"\n=== Configuración automática ===")
            print(f"Configurando ingestor para recibir desde {ip}:{args.port}")
            
            # Actualizar la configuración
            new_config = {
                "udp_host": ip,
                "udp_port": args.port
            }
            
            config.update_config(new_config)
            print("Configuración actualizada. Reinicie el ingestor para aplicar los cambios.")
            
    except KeyboardInterrupt:
        print("\nOperación cancelada por el usuario.")
        sys.exit(130)
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)