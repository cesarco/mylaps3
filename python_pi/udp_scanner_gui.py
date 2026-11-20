#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
SCRIPT WRAPPER - Redirige a la implementación en el paquete mylaps
Este archivo se mantiene por compatibilidad con scripts existentes.
"""

import os
import sys
import time
import json
import threading
import tkinter as tk
from tkinter import ttk, messagebox, scrolledtext
from typing import Dict, Any, List, Optional

# Asegurarse que el paquete mylaps sea importable
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

# Importar desde el paquete mylaps
try:
    from mylaps.advanced_udp_scanner import scan_network_for_udp, UdpScannerFactory, SCAPY_AVAILABLE, NMAP_AVAILABLE
    from mylaps.udp_scanner_gui import UdpScannerApp, RedirectText
except ImportError:
    messagebox.showerror("Error", "No se pudo importar el módulo mylaps.udp_scanner_gui")
    sys.exit(1)

# Simplemente usamos la implementación del paquete mylaps

# Función principal - wrapper sobre la implementación en mylaps
def main():
    """
    Función principal del programa
    Este es un wrapper para la implementación en mylaps/udp_scanner_gui.py
    """
    from mylaps.udp_scanner_gui import main
    main()

if __name__ == "__main__":
    main()