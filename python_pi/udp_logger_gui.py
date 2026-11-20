#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
SCRIPT WRAPPER - Redirige a la implementación en el paquete mylaps
Este archivo se mantiene por compatibilidad con scripts existentes.
"""

import os
import sys

# Asegurar que el paquete mylaps sea importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Importar desde el paquete mylaps
try:
    from mylaps.udp_logger_gui import UdpLoggerGUI, main
    MYLAPS_AVAILABLE = True
except ImportError:
    MYLAPS_AVAILABLE = False
    print("Error: No se pudo importar el módulo mylaps.udp_logger_gui")

# Este script es un wrapper para la implementación en el paquete mylaps
# Importar la implementación desde el paquete mylaps

# Función principal - wrapper sobre la implementación en mylaps
if __name__ == "__main__":
    if not MYLAPS_AVAILABLE:
        print("No se pudo importar la implementación desde el paquete mylaps.")
        print("Este script wrapper requiere que el paquete mylaps esté disponible.")
        sys.exit(1)
        
    # Ejecutar la función importada
    main()