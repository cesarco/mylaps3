#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Módulo de simulación para el ingestor de datos
Permite simular datos de entrada leyendo de un archivo de texto
"""

import asyncio
import time
from typing import Tuple, Optional
import os

from . import utils
from . import config
from .stats import stats

class SimulatorProtocol:
    """
    Simulador que lee líneas de un archivo de texto y las envía a una cola
    como si fueran recibidas por UDP
    """
    def __init__(self, queue: asyncio.Queue):
        self.queue = queue
        self.count = 0
        self.running = False
        self.data_file = config.SIMULATOR_FILE
        self.delay_ms = config.SIMULATOR_DELAY_MS
        self.loop = True  # Si es True, vuelve a empezar al llegar al final del archivo

    async def start(self) -> Tuple[Optional[object], object]:
        """Inicia el simulador"""
        if not os.path.exists(self.data_file):
            utils.log("ERROR", f"Archivo de simulación no encontrado: {self.data_file}")
            return None, None

        utils.log("INFO", f"Iniciando simulador con archivo: {self.data_file}")
        utils.log("INFO", f"Retraso entre líneas: {self.delay_ms}ms, Modo bucle: {self.loop}")
        
        self.running = True
        
        # El simulador no tiene un objeto transport real, pero creamos un objeto
        # simple para que la interfaz sea compatible con el protocolo UDP
        transport = type('DummyTransport', (), {
            'close': lambda: None,  # Método dummy para poder cerrar el transporte
        })()
        
        # Iniciar la tarea de simulación
        asyncio.create_task(self._simulate_data())
        
        return transport, self

    async def _simulate_data(self):
        """Lee líneas del archivo y las envía a la cola"""
        while self.running:
            with open(self.data_file, 'r', encoding='utf-8', errors='replace') as f:
                utils.log("INFO", f"Abriendo archivo de simulación: {self.data_file}")
                
                for line in f:
                    if not self.running:
                        break
                    
                    line = utils.sanitize_line(line)
                    if not line:
                        continue
                    
                    # Detectar tipo de mensaje
                    msg_type = utils.detect_type(line)
                    ts = utils.now_ms()
                    
                    # Registrar en estadísticas
                    stats.register_message(msg_type, line)
                    
                    # Encolar (line, type, ts)
                    await self.queue.put((line, msg_type, ts))
                    self.count += 1
                    
                    # Log ocasional
                    if self.count and self.count % config.LOG_EVERY == 0:
                        utils.log("INFO", f"Simulador: {self.count} líneas enviadas (última: '{line}')")
                        
                    # Retraso entre líneas
                    if self.delay_ms > 0:
                        await asyncio.sleep(self.delay_ms / 1000.0)
                
            # Si no está en modo bucle, terminar
            if not self.loop:
                utils.log("INFO", "Simulador: fin del archivo alcanzado. Terminando.")
                self.running = False
                break
                
            utils.log("INFO", "Simulador: fin del archivo alcanzado. Reiniciando desde el principio.")

    def stop(self):
        """Detiene el simulador"""
        self.running = False
        utils.log("INFO", "Simulador detenido")

async def create_simulator(queue: asyncio.Queue) -> Tuple[object, SimulatorProtocol]:
    """Crea un simulador que lee datos de un archivo"""
    simulator = SimulatorProtocol(queue)
    transport, protocol = await simulator.start()
    
    if transport and protocol:
        # Actualizar estadísticas (aunque no hay host/port real)
        stats.set_simulator_connection(transport, protocol, config.SIMULATOR_FILE)
        
    return transport, protocol
