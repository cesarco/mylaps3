#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Utilidades para el ingestor de datos
"""

import time
from typing import Dict

from . import config

def log(level: str, message: str) -> None:
    """Log filtrado por nivel"""
    levels = {"DEBUG": 10, "INFO": 20, "WARNING": 30, "ERROR": 40}
    current_level = levels.get(config.LOG_LEVEL, 20)
    if levels.get(level, 0) >= current_level:
        print(f"[{level}] {message}")

def now_ms() -> int:
    """Timestamp actual en milisegundos"""
    return int(time.time() * 1000)

def sanitize_line(s: str) -> str:
    """Limpia una línea: recorta CR/LF, limita tamaño, elimina nulos"""
    s = s.strip("\r\n")
    if len(s) > config.LINE_MAX_CHARS:
        s = s[:config.LINE_MAX_CHARS]
    return s.replace("\x00", "")

def detect_type(line: str) -> str:
    """Detecta tipo de mensaje RMonitor/Orbits ($A, $H, $G, etc.)"""
    idx = line.find(",")
    t = line[:idx] if idx >= 0 else line
    # fallback rápido si viene vacío
    if not t or not t.startswith("$"):
        return "$UNK"
    return t
