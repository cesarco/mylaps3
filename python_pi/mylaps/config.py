#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Módulo de configuración para el ingestor de datos
Carga configuración desde variables de entorno y/o archivo .env
"""

import os
import socket
from typing import Dict, Any

try:
    import dotenv
    dotenv.load_dotenv()
    print("[config] Cargando variables desde archivo .env")
except ImportError:
    print("[config] dotenv no instalado, usando variables de entorno")
except Exception as e:
    print(f"[config] Error cargando .env: {e}")
    print("[config] Continuando con valores por defecto")

# -----------------------
# Config (env overrides)
# -----------------------
UDP_HOST       = os.getenv("UDP_HOST", "0.0.0.0")
UDP_PORT       = int(os.getenv("UDP_PORT", "5403"))             # Orbits por defecto
REDIS_URL      = os.getenv("REDIS_URL", "redis://:Rd%242025%21NodeCG%23Secure%4077X9P%26Ultra%2AStrong@66.42.90.210:6379")
STREAM_KEY     = os.getenv("STREAM_KEY", "rmon:raw")
STREAM_MAXLEN  = int(os.getenv("STREAM_MAXLEN", "100000"))      # longitud amortiguada
BATCH_SIZE     = int(os.getenv("BATCH_SIZE", "200"))            # XADD por lote
FLUSH_MS       = int(os.getenv("FLUSH_MS", "50"))               # flush cada N ms si no se llena lote
LINE_MAX_CHARS = int(os.getenv("LINE_MAX_CHARS", "2048"))       # seguridad ante líneas gigantes
LOG_EVERY      = int(os.getenv("LOG_EVERY", "2000"))            # logging cada N mensajes
LOG_LEVEL      = os.getenv("LOG_LEVEL", "INFO").upper()         # nivel de logging

# Configuración del simulador
USE_SIMULATOR  = os.getenv("USE_SIMULATOR", "").lower() == "true" # Si es "true", usa simulador en vez de UDP
SIMULATOR_FILE = os.getenv("SIMULATOR_FILE", "./data/data.txt")  # Archivo de datos para el simulador
SIMULATOR_DELAY_MS = int(os.getenv("SIMULATOR_DELAY_MS", "100"))  # Retraso entre líneas en ms
SIMULATOR_LOOP = os.getenv("SIMULATOR_LOOP", "true").lower() == "true"  # Si es true, repite en bucle

# Control remoto mediante Redis PubSub
DEVICE_ID      = os.getenv("DEVICE_ID", socket.gethostname())   # Identificador único para este dispositivo
CONTROL_CHANNEL = f"control:{DEVICE_ID}"                        # Canal para recibir comandos
STATUS_KEY     = f"status:{DEVICE_ID}"                          # Clave para publicar estado
CONFIG_KEY     = f"config:{DEVICE_ID}"                          # Clave para la configuración del dispositivo

def get_config() -> Dict[str, Any]:
    """Retorna la configuración actual como diccionario"""
    return {
        "udp_host": UDP_HOST,
        "udp_port": UDP_PORT,
        "redis_url": REDIS_URL,
        "stream_key": STREAM_KEY,
        "stream_maxlen": STREAM_MAXLEN,
        "batch_size": BATCH_SIZE,
        "flush_ms": FLUSH_MS,
        "line_max_chars": LINE_MAX_CHARS,
        "log_every": LOG_EVERY,
        "log_level": LOG_LEVEL,
        "device_id": DEVICE_ID,
        "control_channel": CONTROL_CHANNEL,
        "status_key": STATUS_KEY,
        "config_key": CONFIG_KEY,
        "use_simulator": USE_SIMULATOR,
        "simulator_file": SIMULATOR_FILE,
        "simulator_delay_ms": SIMULATOR_DELAY_MS,
        "simulator_loop": SIMULATOR_LOOP
    }

def update_config(new_config: Dict[str, Any]) -> Dict[str, str]:
    """
    Actualiza las variables de configuración con nuevos valores
    Retorna un diccionario con los cambios realizados
    """
    global UDP_HOST, UDP_PORT, STREAM_KEY, STREAM_MAXLEN
    global BATCH_SIZE, FLUSH_MS, LINE_MAX_CHARS, LOG_EVERY, LOG_LEVEL
    global USE_SIMULATOR, SIMULATOR_FILE, SIMULATOR_DELAY_MS, SIMULATOR_LOOP
    
    changes = {}
    
    # Actualizar variables según lo recibido
    if "udp_host" in new_config:
        UDP_HOST = new_config["udp_host"]
        changes["UDP_HOST"] = UDP_HOST
        
    if "udp_port" in new_config:
        UDP_PORT = int(new_config["udp_port"])
        changes["UDP_PORT"] = str(UDP_PORT)
        
    if "stream_key" in new_config:
        STREAM_KEY = new_config["stream_key"]
        changes["STREAM_KEY"] = STREAM_KEY
        
    if "stream_maxlen" in new_config:
        STREAM_MAXLEN = int(new_config["stream_maxlen"])
        changes["STREAM_MAXLEN"] = str(STREAM_MAXLEN)
        
    if "batch_size" in new_config:
        BATCH_SIZE = int(new_config["batch_size"])
        changes["BATCH_SIZE"] = str(BATCH_SIZE)
        
    if "flush_ms" in new_config:
        FLUSH_MS = int(new_config["flush_ms"])
        changes["FLUSH_MS"] = str(FLUSH_MS)
        
    if "line_max_chars" in new_config:
        LINE_MAX_CHARS = int(new_config["line_max_chars"])
        changes["LINE_MAX_CHARS"] = str(LINE_MAX_CHARS)
        
    if "log_every" in new_config:
        LOG_EVERY = int(new_config["log_every"])
        changes["LOG_EVERY"] = str(LOG_EVERY)
        
    if "log_level" in new_config:
        LOG_LEVEL = new_config["log_level"].upper()
        changes["LOG_LEVEL"] = LOG_LEVEL
    
    # Configuración del simulador
    if "use_simulator" in new_config:
        USE_SIMULATOR = str(new_config["use_simulator"]).lower() == "true"
        changes["USE_SIMULATOR"] = str(USE_SIMULATOR)
        
    if "simulator_file" in new_config:
        SIMULATOR_FILE = new_config["simulator_file"]
        changes["SIMULATOR_FILE"] = SIMULATOR_FILE
        
    if "simulator_delay_ms" in new_config:
        SIMULATOR_DELAY_MS = int(new_config["simulator_delay_ms"])
        changes["SIMULATOR_DELAY_MS"] = str(SIMULATOR_DELAY_MS)
        
    if "simulator_loop" in new_config:
        SIMULATOR_LOOP = str(new_config["simulator_loop"]).lower() == "true"
        changes["SIMULATOR_LOOP"] = str(SIMULATOR_LOOP)
    
    return changes
