#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Módulo de escritura a Redis para el ingestor de datos
"""

import asyncio
from collections import deque
from typing import Tuple, Deque

try:
    import redis.asyncio as redis
except ImportError:
    raise ImportError("Se requiere el paquete 'redis>=5.0.0'. Instala con: pip install redis>=5.0.0")

from . import config
from . import utils
from .stats import stats

class RedisWriter:
    """
    Consume desde una Queue y hace XADD en lotes (pipeline),
    con MAXLEN ~ para tope amortiguado.
    """

    def __init__(self, queue: asyncio.Queue):
        self.queue = queue
        self._stop = asyncio.Event()
        self._client = None
        self._buffer: Deque[Tuple[str, str, int]] = deque()  # (line, type, ts)
        self._written = 0
        self._batches = 0

    async def connect(self) -> bool:
        """Conecta a Redis"""
        try:
            self._client = await redis.from_url(config.REDIS_URL, decode_responses=True)
            # Probar conexión
            await self._client.ping()
            utils.log("INFO", f"Conectado a Redis en {config.REDIS_URL}")
            return True
        except Exception as e:
            utils.log("ERROR", f"Error conectando a Redis: {e}")
            return False

    async def start(self):
        """Loop principal de procesamiento"""
        if not self._client:
            if not await self.connect():
                utils.log("ERROR", "No se puede iniciar writer sin conexión a Redis")
                return
                
        # Crear task de flush periódico
        flush_task = asyncio.create_task(self._interval_flusher())
        
        try:
            utils.log("INFO", f"Writer iniciado - Stream: {config.STREAM_KEY}, MaxLen: {config.STREAM_MAXLEN}, Batch: {config.BATCH_SIZE}")
            
            # Loop principal: lee de la cola y flush por lote o por tiempo
            while not self._stop.is_set():
                try:
                    # Get item with timeout para poder revisar _stop flag
                    item = await asyncio.wait_for(self.queue.get(), timeout=0.1)
                    self._buffer.append(item)
                    
                    # Flush si el buffer alcanza el tamaño de batch
                    if len(self._buffer) >= config.BATCH_SIZE:
                        await self.flush()
                        
                except asyncio.TimeoutError:
                    continue
        finally:
            # Limpieza final
            if self._buffer:
                await self.flush()
                
            flush_task.cancel()
            try:
                await flush_task
            except asyncio.CancelledError:
                pass
                
            if self._client:
                await self._client.close()
                utils.log("INFO", "Conexión Redis cerrada")

    async def stop(self):
        """Señal de parada y espera de limpieza"""
        self._stop.set()

    async def _interval_flusher(self):
        """Flush periódico por intervalo de tiempo"""
        while not self._stop.is_set():
            await asyncio.sleep(config.FLUSH_MS / 1000.0)
            if self._buffer:
                await self.flush()

    async def flush(self):
        """Flush buffer a Redis stream con pipeline"""
        if not self._buffer:
            return
            
        pipe = self._client.pipeline(transaction=False)
        
        # MAXLEN ~ usa trimming amortiguado (eficiente)
        # xadd(stream, fields, maxlen=..., approximate=True) no existe con pipeline,
        # así que usamos el form "XADD key MAXLEN ~ N * field value ..."
        items_count = 0
        while self._buffer:
            line, typ, ts = self._buffer.popleft()
            pipe.execute_command(
                "XADD", config.STREAM_KEY, "MAXLEN", "~", str(config.STREAM_MAXLEN), "*",
                "type", typ, "line", line, "ts", str(ts)
            )
            items_count += 1
            
        try:
            await pipe.execute()
            self._written += items_count
            self._batches += 1
            
            # Registrar en estadísticas
            stats.register_batch(items_count)
            
            if self._batches % 10 == 0:
                utils.log("INFO", f"Redis: {self._written} mensajes en {self._batches} batches")
                
            # Logging más detallado en modo debug
            if config.LOG_LEVEL == "DEBUG":
                utils.log("DEBUG", f"Flushed batch: {items_count} items")
                
        except Exception as e:
            # En caso de error, no devolvemos al buffer (podría duplicar).
            # Preferimos loggear y continuar; la ingesta UDP seguirá.
            utils.log("ERROR", f"Error al flush: {e}")
            stats.register_error()
