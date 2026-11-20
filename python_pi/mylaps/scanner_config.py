#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Módulo de configuración para herramientas de escaneo y registro UDP
"""

import os
import sys
import json
import logging
from typing import Dict, Any, Optional

# Configuración del sistema de registro
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)

logger = logging.getLogger("ScannerConfig")

# Constantes
DEFAULT_CONFIG_FILE = "scanner_config.json"
DEFAULT_CONFIG = {
    "udp_host": "",
    "udp_port": 5403,
    "cidr": 24,
    "scan_duration": 30,
    "log_dir": "logs/udp",
    "log_raw_data": True,
    "log_decoded_data": True,
    "scan_method": "auto"  # 'auto', 'scapy', 'nmap', o 'socket'
}

class ScannerConfig:
    """Clase para gestionar la configuración de las herramientas de escaneo"""
    
    def __init__(self, config_file: Optional[str] = None):
        """
        Inicializa el gestor de configuración
        
        Args:
            config_file: Ruta al archivo de configuración
        """
        self.config_file = config_file or self._get_default_config_path()
        self.config = self.load_config()
    
    def _get_default_config_path(self) -> str:
        """
        Obtiene la ruta por defecto del archivo de configuración
        
        Returns:
            Ruta al archivo de configuración
        """
        # Determinar directorio base
        base_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        return os.path.join(base_dir, DEFAULT_CONFIG_FILE)
    
    def load_config(self) -> Dict[str, Any]:
        """
        Carga la configuración desde el archivo
        
        Returns:
            Configuración cargada
        """
        config = DEFAULT_CONFIG.copy()
        
        if os.path.exists(self.config_file):
            try:
                with open(self.config_file, 'r', encoding='utf-8') as f:
                    loaded_config = json.load(f)
                    
                    # Actualizar configuración con los valores cargados
                    for key, value in loaded_config.items():
                        if key in config:  # Solo usar claves válidas
                            config[key] = value
                            
                logger.info(f"Configuración cargada desde {self.config_file}")
                            
            except Exception as e:
                logger.error(f"Error al cargar configuración: {e}")
                logger.info("Usando configuración por defecto")
        else:
            logger.info(f"Archivo de configuración no encontrado: {self.config_file}")
            logger.info("Usando configuración por defecto")
            
        return config
    
    def save_config(self, config: Optional[Dict[str, Any]] = None) -> bool:
        """
        Guarda la configuración en el archivo
        
        Args:
            config: Configuración a guardar
        
        Returns:
            True si se guardó correctamente, False en caso contrario
        """
        if config is None:
            config = self.config
            
        try:
            # Crear directorio si no existe
            os.makedirs(os.path.dirname(os.path.abspath(self.config_file)), exist_ok=True)
            
            # Guardar configuración
            with open(self.config_file, 'w', encoding='utf-8') as f:
                json.dump(config, f, indent=4)
                
            self.config = config
            logger.info(f"Configuración guardada en {self.config_file}")
            return True
            
        except Exception as e:
            logger.error(f"Error al guardar configuración: {e}")
            return False
    
    def get(self, key: str, default: Any = None) -> Any:
        """
        Obtiene un valor de la configuración
        
        Args:
            key: Clave de la configuración
            default: Valor por defecto si no existe
            
        Returns:
            Valor de la configuración
        """
        return self.config.get(key, default)
    
    def update(self, key: str, value: Any) -> bool:
        """
        Actualiza un valor en la configuración
        
        Args:
            key: Clave a actualizar
            value: Nuevo valor
            
        Returns:
            True si se actualizó correctamente, False en caso contrario
        """
        if key in self.config:
            self.config[key] = value
            return self.save_config()
        return False

# Instancia global de configuración
_config_instance = None

def get_config(config_file: Optional[str] = None) -> ScannerConfig:
    """
    Obtiene la instancia global de configuración
    
    Args:
        config_file: Ruta al archivo de configuración
        
    Returns:
        Instancia de configuración
    """
    global _config_instance
    if _config_instance is None:
        _config_instance = ScannerConfig(config_file)
    return _config_instance

def update_config(config_dict: Dict[str, Any]) -> bool:
    """
    Actualiza la configuración con un diccionario de valores
    
    Args:
        config_dict: Diccionario con los valores a actualizar
        
    Returns:
        True si se actualizó correctamente, False en caso contrario
    """
    config = get_config()
    
    # Actualizar cada clave proporcionada
    updated = False
    for key, value in config_dict.items():
        if key in config.config:
            config.config[key] = value
            updated = True
    
    # Guardar si se realizó alguna actualización
    if updated:
        return config.save_config()
    
    return False

# Funciones de utilidad
def get_udp_settings() -> Dict[str, Any]:
    """
    Obtiene la configuración de conexión UDP
    
    Returns:
        Diccionario con la configuración UDP
    """
    config = get_config()
    return {
        "host": config.get("udp_host", ""),
        "port": config.get("udp_port", 5403),
        "cidr": config.get("cidr", 24),
        "scan_duration": config.get("scan_duration", 30),
        "scan_method": config.get("scan_method", "auto")
    }

def get_log_settings() -> Dict[str, Any]:
    """
    Obtiene la configuración de registro
    
    Returns:
        Diccionario con la configuración de registro
    """
    config = get_config()
    return {
        "log_dir": config.get("log_dir", "logs/udp"),
        "log_raw_data": config.get("log_raw_data", True),
        "log_decoded_data": config.get("log_decoded_data", True)
    }

def print_config():
    """Muestra la configuración actual en pantalla"""
    config = get_config()
    print("\n=== CONFIGURACIÓN ACTUAL DE ESCANEO ===")
    
    # Configuración UDP
    print("\nConfiguración UDP:")
    print(f"- Host: {config.get('udp_host') or 'Auto-detectado'}")
    print(f"- Puerto: {config.get('udp_port')}")
    print(f"- CIDR: /{config.get('cidr')}")
    print(f"- Duración de escaneo: {config.get('scan_duration')}s")
    print(f"- Método de escaneo: {config.get('scan_method')}")
    
    # Configuración de registro
    print("\nConfiguración de registro:")
    print(f"- Directorio: {config.get('log_dir')}")
    print(f"- Guardar datos sin procesar: {'Sí' if config.get('log_raw_data') else 'No'}")
    print(f"- Guardar datos decodificados: {'Sí' if config.get('log_decoded_data') else 'No'}")

# Función principal para pruebas
def main():
    """Función principal para pruebas"""
    # Mostrar configuración
    print_config()
    
    # Ejemplo de actualización
    if input("\n¿Actualizar puerto UDP a 5404? (s/n): ").lower() == 's':
        if update_config({"udp_port": 5404}):
            print("Puerto actualizado correctamente")
            print_config()
        else:
            print("Error al actualizar el puerto")

if __name__ == "__main__":
    main()