#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Módulo de recepción UDP para el ingestor de datos
"""

import asyncio
from typing import Tuple
import socket

from . import config
from . import utils
from .stats import stats

class UdpToQueueProtocol(asyncio.DatagramProtocol):
    """Protocolo UDP que recibe datagramas y envía líneas a una cola"""
    def __init__(self, queue: asyncio.Queue):
        self.queue = queue
        self.count = 0

    def datagram_received(self, data: bytes, addr: Tuple[str, int]):
        try:
            text = data.decode("utf-8", errors="replace")
        except Exception:
            # fallback latin-1 si fuera necesario
            text = data.decode("latin-1", errors="replace")

        # puede traer varias líneas; separarlas
        # RMonitor suele ser 1 por línea, pero seamos defensivos
        lines = [utils.sanitize_line(l) for l in text.splitlines() if l.strip()]
        ts = utils.now_ms()

        for line in lines:
            # Detectar tipo de mensaje
            msg_type = utils.detect_type(line)
            
            # Registrar en estadísticas
            stats.register_message(msg_type, line)
            
            # Encolar (line, type, ts)
            self.queue.put_nowait((line, msg_type, ts))
            self.count += 1

        # Log ocasional
        if self.count and self.count % config.LOG_EVERY == 0:
            utils.log("INFO", f"Recibidas {self.count} líneas (última: '{lines[-1] if lines else ''}')")
            
        # Logging más detallado en modo debug
        if config.LOG_LEVEL == "DEBUG" and lines:
            utils.log("DEBUG", f"UDP desde {addr[0]}:{addr[1]} - {len(lines)} líneas")

async def create_udp_server(queue: asyncio.Queue) -> Tuple[asyncio.BaseTransport, UdpToQueueProtocol]:
    """Crea un servidor UDP en el host y puerto configurados"""
    try:
        loop = asyncio.get_running_loop()
        transport, protocol = await loop.create_datagram_endpoint(
            lambda: UdpToQueueProtocol(queue),
            local_addr=(config.UDP_HOST, config.UDP_PORT),
            family=socket.AF_INET
        )
        
        utils.log("INFO", f"Servidor UDP escuchando en {config.UDP_HOST}:{config.UDP_PORT}")
        stats.set_udp_connection(transport, protocol, config.UDP_HOST, config.UDP_PORT)
        
        return transport, protocol
    except Exception as e:
        utils.log("ERROR", f"Error creando servidor UDP: {e}")
        raise
