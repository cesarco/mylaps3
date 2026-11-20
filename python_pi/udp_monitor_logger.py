#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
SCRIPT WRAPPER - Redirige a la implementación en el paquete mylaps
Este archivo se mantiene por compatibilidad con scripts existentes.
"""

import os
import sys
import time
import argparse
import json
from typing import Dict, Any, List

# Asegurar que el paquete mylaps sea importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Importar desde el paquete mylaps
try:
    from mylaps.udp_monitor_logger import detect_and_log, run_monitor_logger, UdpMonitorWithLogger
    MYLAPS_AVAILABLE = True
except ImportError:
    MYLAPS_AVAILABLE = False
    print("Error: No se pudo importar el módulo mylaps.udp_monitor_logger")

# Este script es un wrapper para la implementación en el paquete mylaps
# Solo se mantiene por compatibilidad con scripts existentes

# Ejemplo de uso directo - wrapper sobre la implementación en mylaps

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='Detector y logger de transmisiones UDP')
    parser.add_argument('-p', '--port', type=int, default=5403,
                        help='Puerto UDP a monitorear (predeterminado: 5403)')
    parser.add_argument('-c', '--cidr', type=int, default=24,
                        help='Máscara de subred en formato CIDR (predeterminado: 24)')
    parser.add_argument('-d', '--dir', type=str, default=None,
                        help='Directorio para guardar logs (predeterminado: ./logs)')
    parser.add_argument('-t', '--time', type=int, default=20,
                        help='Duración del escaneo inicial en segundos (predeterminado: 20)')
    parser.add_argument('-a', '--auto-start', action='store_true',
                        help='Iniciar automáticamente el logger después de la detección')
    parser.add_argument('-j', '--json', action='store_true',
                        help='Muestra los resultados en formato JSON')
    
    args = parser.parse_args()
    
    # Configurar directorio de logs si no se especificó
    if not args.dir:
        args.dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "logs")
    
    try:
        if not MYLAPS_AVAILABLE:
            print("No se pudo importar la implementación desde el paquete mylaps.")
            print("Este script wrapper requiere que el paquete mylaps esté disponible.")
            sys.exit(1)
            
        # Ejecutar la detección y logging usando la implementación en mylaps
        results = detect_and_log(
            port=args.port,
            cidr=args.cidr,
            log_dir=args.dir,
            duration=args.time,
            auto_start=args.auto_start or not args.json
        )
        
        # Si se solicitó salida JSON, mostrarla
        if args.json:
            print(json.dumps(results, indent=2))
    
    except KeyboardInterrupt:
        print("\nOperación cancelada por el usuario.")
        sys.exit(130)
    except Exception as e:
        print(f"\nError: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)