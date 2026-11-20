#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script para escanear la subred en busca de transmisores UDP de RMonitor

Este script escanea la subred local para encontrar dispositivos
que estén transmitiendo datos UDP en el puerto predeterminado
de RMonitor (5403 por defecto).
"""

import asyncio
import argparse
import time
import sys
import os
import json

# Asegurar que el paquete mylaps sea importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from mylaps import udp_scanner
from mylaps import config
from mylaps import utils

async def main():
    parser = argparse.ArgumentParser(description='Escanea la subred para encontrar transmisores UDP de RMonitor')
    
    parser.add_argument('-p', '--port', type=int, default=config.UDP_PORT,
                        help=f'Puerto UDP a escanear (predeterminado: {config.UDP_PORT})')
    
    parser.add_argument('-c', '--cidr', type=int, default=24,
                        help='Máscara de subred en formato CIDR (predeterminado: 24 para /24)')
    
    parser.add_argument('-d', '--duration', type=int, default=30,
                        help='Duración del monitoreo activo en segundos (predeterminado: 30)')
    
    parser.add_argument('-j', '--json', action='store_true',
                        help='Muestra los resultados en formato JSON')
    
    parser.add_argument('-a', '--auto-config', action='store_true',
                        help='Configura automáticamente el primer transmisor activo encontrado')
    
    args = parser.parse_args()
    
    # Mostrar encabezado
    if not args.json:
        print("\n=== MyLaps RMonitor UDP Scanner ===\n")
        print(f"Escaneando puerto UDP {args.port} en subred /{args.cidr}...")
        print(f"Duración del monitoreo activo: {args.duration} segundos\n")
    
    # Ejecutar el escaneo
    results = await udp_scanner.scan_subnet(
        port=args.port, 
        cidr=args.cidr, 
        duration=args.duration
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
    if args.auto_config and results['active_transmitters']:
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
    
    return 0

if __name__ == "__main__":
    try:
        sys.exit(asyncio.run(main()))
    except KeyboardInterrupt:
        print("\nOperación cancelada por el usuario.")
        sys.exit(130)
    except Exception as e:
        print(f"\nError: {e}")
        sys.exit(1)