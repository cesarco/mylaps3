#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Módulo de estadísticas para el ingestor de datos
"""

import datetime
from typing import Dict, Any

from . import config

class IngestorStats:
    """Mantiene estadísticas de rendimiento y estado del sistema"""
    def __init__(self):
        self.start_time = datetime.datetime.now()
        self.messages_received = 0
        self.messages_by_type = {}
        self.redis_batches_sent = 0
        self.redis_messages_sent = 0
        self.redis_errors = 0
        self.last_message_time = None
        self.last_message_content = None
        self.current_udp_host = config.UDP_HOST
        self.current_udp_port = config.UDP_PORT
        self.current_redis_url = config.REDIS_URL
        self.transport = None
        self.protocol = None
        self.using_simulator = config.USE_SIMULATOR
        self.simulator_file = config.SIMULATOR_FILE if config.USE_SIMULATOR else None
    
    def register_message(self, message_type: str, content: str):
        """Registra un mensaje recibido en las estadísticas"""
        self.messages_received += 1
        self.messages_by_type[message_type] = self.messages_by_type.get(message_type, 0) + 1
        self.last_message_time = datetime.datetime.now()
        self.last_message_content = content[:50] + "..." if len(content) > 50 else content
    
    def register_batch(self, count: int):
        """Registra un batch enviado a Redis"""
        self.redis_batches_sent += 1
        self.redis_messages_sent += count
    
    def register_error(self):
        """Registra un error de Redis"""
        self.redis_errors += 1
    
    def set_udp_connection(self, transport, protocol, host: str, port: int):
        """Actualiza información de conexión UDP"""
        self.transport = transport
        self.protocol = protocol
        self.current_udp_host = host
        self.current_udp_port = port
        self.using_simulator = False
        self.simulator_file = None
        
    def set_simulator_connection(self, transport, protocol, file_path: str):
        """Actualiza información de conexión del simulador"""
        self.transport = transport
        self.protocol = protocol
        self.using_simulator = True
        self.simulator_file = file_path
    
    def uptime(self) -> str:
        """Calcula y formatea el tiempo de ejecución"""
        delta = datetime.datetime.now() - self.start_time
        days = delta.days
        hours, remainder = divmod(delta.seconds, 3600)
        minutes, seconds = divmod(remainder, 60)
        return f"{days}d {hours}h {minutes}m {seconds}s"
    
    def get_stats(self) -> Dict[str, Any]:
        """Retorna todas las estadísticas como diccionario"""
        stats_dict = {
            "device_id": config.DEVICE_ID,
            "status": "running",
            "uptime": self.uptime(),
            "start_time": self.start_time.isoformat(),
            "redis": {
                "url": "***redis-url-hidden***",  # No exponemos credenciales
                "stream_key": config.STREAM_KEY,
                "batches_sent": self.redis_batches_sent,
                "messages_sent": self.redis_messages_sent,
                "errors": self.redis_errors
            },
            "last_message": {
                "time": self.last_message_time.isoformat() if self.last_message_time else None,
                "age_seconds": (datetime.datetime.now() - self.last_message_time).total_seconds() if self.last_message_time else None,
                "content": self.last_message_content
            },
            "message_types": self.messages_by_type
        }
        
        # Añadir información específica según el modo (simulador o UDP real)
        if self.using_simulator:
            stats_dict["input_mode"] = "simulator"
            stats_dict["simulator"] = {
                "file": self.simulator_file,
                "messages_processed": self.messages_received
            }
        else:
            stats_dict["input_mode"] = "udp"
            stats_dict["udp"] = {
                "host": self.current_udp_host,
                "port": self.current_udp_port,
                "messages_received": self.messages_received
            }
            
        return stats_dict

# Instancia global de estadísticas
stats = IngestorStats()
