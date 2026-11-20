"""
Paquete mylaps - Ingestor UDP para RMonitor/Orbits a Redis Streams
-----------------------------------------------------------------
Sistema modular para recepción de datos de cronometraje y telemetría

Incluye herramientas para escanear, capturar y procesar
datos UDP de sistemas MyLaps para cronometraje deportivo.
"""

__version__ = '1.0.0'
__author__ = 'MyLaps Reverse Engineering Team'

# Importar componentes principales para facilitar el acceso
try:
    from .advanced_udp_scanner import (
        scan_network_for_udp,
        run_scanner_cli,
        UdpScannerFactory,
        UdpTransmissionDetector,
        SCAPY_AVAILABLE,
        NMAP_AVAILABLE,
        MYLAPS_AVAILABLE
    )
except ImportError:
    pass

try:
    from .udp_scanner_gui import UdpScannerApp, main as scanner_gui_main
except ImportError:
    pass

try:
    from .udp_logger_gui import UdpLoggerGUI, main as logger_gui_main
except ImportError:
    pass

try:
    from .udp_data_logger import (
        UdpDataLogger,
        create_udp_logger,
        UdpLogFileReader,
        find_log_files,
        replay_log_file
    )
except ImportError:
    pass

try:
    from .udp_monitor_logger import (
        UdpMonitorWithLogger,
        detect_and_log,
        run_monitor_logger
    )
except ImportError:
    pass

try:
    from .scanner_config import (
        get_config,
        update_config,
        print_config,
        get_udp_settings,
        get_log_settings
    )
except ImportError:
    pass

# Definir qué se importa con "from mylaps import *"
__all__ = [
    'scan_network_for_udp',
    'run_scanner_cli',
    'UdpScannerFactory',
    'UdpTransmissionDetector',
    'UdpScannerApp',
    'scanner_gui_main',
    'UdpLoggerGUI',
    'logger_gui_main',
    'UdpDataLogger',
    'create_udp_logger',
    'UdpLogFileReader',
    'find_log_files',
    'replay_log_file',
    'UdpMonitorWithLogger',
    'detect_and_log',
    'run_monitor_logger',
    'get_config',
    'update_config',
    'print_config',
    'get_udp_settings',
    'get_log_settings',
    'SCAPY_AVAILABLE',
    'NMAP_AVAILABLE',
    'MYLAPS_AVAILABLE'
]
