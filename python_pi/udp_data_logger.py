#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
SCRIPT WRAPPER - Redirige a la implementación en el paquete mylaps
Este archivo se mantiene por compatibilidad con scripts existentes.
"""

import os
import sys
import time
import datetime
import socket
import threading
import hashlib
import argparse
from typing import Optional, Dict, Any

# Asegurarse que el paquete mylaps sea importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Importar desde el paquete mylaps
from mylaps.udp_data_logger import (
    UdpDataLogger,
    UdpListenerWithLogger,
    create_udp_logger
)

# Simplemente usamos la implementación del paquete mylaps

# Ejemplo de uso directo - wrapper sobre la implementación en mylaps
if __name__ == "__main__":    
    # Parseamos los argumentos como en el script original
    parser = argparse.ArgumentParser(description='Logger de datos UDP raw')
    parser.add_argument('-p', '--port', type=int, default=5403,
                        help='Puerto UDP a escuchar (predeterminado: 5403)')
    parser.add_argument('-d', '--dir', type=str, default=None,
                        help='Directorio para guardar los logs (predeterminado: ./logs)')
    
    args = parser.parse_args()
    
    try:
        # Usamos la función importada de mylaps
        listener = create_udp_logger(port=args.port, log_dir=args.dir)
        listener.start()
        
        print("Presiona Ctrl+C para detener...")
        while True:
            time.sleep(1)
            
    except KeyboardInterrupt:
        print("\nDeteniendo listener UDP...")
        if 'listener' in locals():
            listener.stop()
        print("Finalizado.")