#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Módulo de control remoto para el ingestor de datos
"""

import asyncio
import json
import time
import socket

try:
    import redis.asyncio as redis
except ImportError:
    raise ImportError("Se requiere el paquete 'redis>=5.0.0'. Instala con: pip install redis>=5.0.0")

from . import config
from . import utils
from . import udp_scanner
from .stats import stats

class RemoteControl:
    """
    Permite control remoto del ingestor mediante Redis PubSub
    en lugar de API REST (ideal para dispositivos sin IP pública)
    """
    def __init__(self):
        self._client = None
        self._pubsub = None
        self._stop = asyncio.Event()
        self._udp_transport = None
        self._udp_protocol = None
        self._config_updated = False
    
    async def connect(self) -> bool:
        """Conecta a Redis para PubSub"""
        try:
            self._client = await redis.from_url(config.REDIS_URL, decode_responses=True)
            self._pubsub = self._client.pubsub()
            await self._pubsub.subscribe(config.CONTROL_CHANNEL)
            
            # Publicar configuración actual
            await self.publish_config()
            
            utils.log("INFO", f"Control remoto iniciado, escuchando en canal {config.CONTROL_CHANNEL}")
            return True
        except Exception as e:
            utils.log("ERROR", f"Error iniciando control remoto: {e}")
            return False
    
    def register_udp_connection(self, transport, protocol):
        """Registra la conexión UDP para poder reiniciarla"""
        self._udp_transport = transport
        self._udp_protocol = protocol
        
    async def publish_status(self):
        """Publica el estado actual en Redis"""
        if not self._client:
            return
            
        try:
            await self._client.set(config.STATUS_KEY, json.dumps(stats.get_stats()))
            utils.log("DEBUG", f"Estado publicado en {config.STATUS_KEY}")
        except Exception as e:
            utils.log("ERROR", f"Error publicando estado: {e}")
    
    async def publish_config(self):
        """Publica la configuración actual en Redis"""
        if not self._client:
            return
            
        try:
            current_config = config.get_config()
            # Filtramos la URL de Redis por seguridad
            if "redis_url" in current_config:
                current_config["redis_url"] = "***redis-url-hidden***"
                
            await self._client.set(config.CONFIG_KEY, json.dumps(current_config))
            utils.log("INFO", f"Configuración publicada en {config.CONFIG_KEY}")
        except Exception as e:
            utils.log("ERROR", f"Error publicando configuración: {e}")
    
    async def listen_for_commands(self):
        """Escucha comandos en el canal PubSub"""
        if not self._pubsub:
            utils.log("ERROR", "No se puede escuchar comandos sin conexión PubSub")
            return
            
        utils.log("INFO", f"Escuchando comandos en canal {config.CONTROL_CHANNEL}...")
        
        # Publicar estado inicial
        await self.publish_status()
        
        # Loop de escucha de comandos
        while not self._stop.is_set():
            try:
                message = await self._pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message and message["type"] == "message":
                    await self._process_command(message["data"])
                    
                # Publicar estado periódicamente (cada 5 segundos)
                if int(time.time()) % 5 == 0:
                    await self.publish_status()
                
            except Exception as e:
                utils.log("ERROR", f"Error procesando comandos: {e}")
                await asyncio.sleep(1)  # Evitar bucle rápido en caso de error
    
    async def stop(self):
        """Detiene el control remoto"""
        self._stop.set()
        if self._pubsub:
            await self._pubsub.unsubscribe()
        if self._client:
            await self._client.close()
    
    async def _process_command(self, data_str):
        """Procesa un comando recibido"""
        try:
            data = json.loads(data_str)
            command = data.get("command")
            
            utils.log("INFO", f"Comando recibido: {command}")
            
            if command == "get_status":
                # Forzar actualización inmediata de estado
                await self.publish_status()
                
            elif command == "get_config":
                # Forzar actualización inmediata de configuración
                await self.publish_config()
                
            elif command == "update_config":
                # Actualizar configuración
                await self._update_config(data.get("config", {}))
                
            elif command == "restart_udp":
                # Reiniciar conexión UDP
                await self._restart_udp(data.get("host"), data.get("port"))
                
            elif command == "reset_stats":
                # Reiniciar estadísticas
                from . import stats
                stats.stats = stats.IngestorStats()
                utils.log("INFO", "Estadísticas reiniciadas")
                await self.publish_status()
                
            elif command == "toggle_simulator":
                # Cambiar entre modo simulador y UDP real
                new_config = {"use_simulator": str(not config.USE_SIMULATOR).lower()}
                if "file" in data:
                    new_config["simulator_file"] = data.get("file")
                await self._update_config(new_config)
                # Es necesario reiniciar la aplicación para que el cambio surta efecto
                utils.log("WARNING", "Es necesario reiniciar la aplicación para cambiar el modo")
                
            elif command == "scan_network":
                # Escanear la red para encontrar transmisores UDP
                await self._scan_network(
                    port=data.get("port", config.UDP_PORT),
                    cidr=data.get("cidr", 24),
                    duration=data.get("duration", 30),
                    auto_config=data.get("auto_config", False)
                )
                
            else:
                utils.log("WARNING", f"Comando desconocido: {command}")
                
        except json.JSONDecodeError:
            utils.log("ERROR", "Comando con formato JSON inválido")
        except Exception as e:
            utils.log("ERROR", f"Error procesando comando: {e}")
    
    async def _update_config(self, new_config):
        """Actualiza la configuración con nuevos valores"""
        # Usar el módulo de configuración para actualizar valores
        changes = config.update_config(new_config)
        
        if changes:
            utils.log("INFO", f"Configuración actualizada: {', '.join([f'{k} = {v}' for k, v in changes.items()])}")
            self._config_updated = True
            
            # Publicar la nueva configuración
            await self.publish_config()
            
            # Si cambiaron parámetros de UDP, sugerir reinicio
            if "UDP_HOST" in changes or "UDP_PORT" in changes:
                utils.log("WARNING", "Parámetros UDP cambiados, se requiere reinicio de UDP")
                
                # Si tenemos acceso al transporte UDP, reiniciarlo
                if self._udp_transport:
                    await self._restart_udp(config.UDP_HOST, config.UDP_PORT)
    
    async def _restart_udp(self, host=None, port=None):
        """Reinicia la conexión UDP con nuevos parámetros"""
        if not self._udp_transport:
            utils.log("ERROR", "No se puede reiniciar UDP sin conexión establecida")
            return
            
        try:
            # Usar valores actuales si no se especifican
            host = host or config.UDP_HOST
            port = port or config.UDP_PORT
            
            # Cerrar la conexión existente
            self._udp_transport.close()
            utils.log("INFO", "Conexión UDP cerrada para reinicio")
            
            # Permitir que el sistema libere el socket
            await asyncio.sleep(0.5)
            
            # Crear nueva conexión UDP
            loop = asyncio.get_running_loop()
            transport, protocol = await loop.create_datagram_endpoint(
                lambda: self._udp_protocol.__class__(self._udp_protocol.queue),
                local_addr=(host, port),
                family=socket.AF_INET
            )
            
            # Actualizar referencias
            self._udp_transport = transport
            self._udp_protocol = protocol
            
            # Actualizar estadísticas
            stats.set_udp_connection(transport, protocol, host, port)
            
            utils.log("INFO", f"Conexión UDP reiniciada en {host}:{port}")
            
            # Publicar estado actualizado
            await self.publish_status()
            
        except Exception as e:
            utils.log("ERROR", f"Error reiniciando conexión UDP: {e}")
    
    async def _scan_network(self, port=None, cidr=24, duration=30, auto_config=False):
        """
        Escanea la red para encontrar transmisores UDP activos
        
        Args:
            port: Puerto UDP a escanear (por defecto usa config.UDP_PORT)
            cidr: Máscara de subred en formato CIDR (ej: 24 para /24)
            duration: Duración del monitoreo activo en segundos
            auto_config: Si es True, configura automáticamente el primer transmisor activo encontrado
        """
        utils.log("INFO", f"Iniciando escaneo de red para puerto UDP {port or config.UDP_PORT}")
        
        # Publicar estado de inicio de escaneo
        scan_status = {
            "scan_status": "running",
            "scan_start_time": time.time(),
            "scan_port": port or config.UDP_PORT,
            "scan_cidr": cidr,
            "scan_duration": duration
        }
        await self._client.set(f"{config.STATUS_KEY}:scan", json.dumps(scan_status))
        
        try:
            # Ejecutar el escaneo
            results = await udp_scanner.scan_subnet(
                port=port, 
                cidr=cidr, 
                duration=duration
            )
            
            # Guardar resultados en Redis
            scan_status = {
                "scan_status": "completed",
                "scan_end_time": time.time(),
                "scan_results": results
            }
            await self._client.set(f"{config.STATUS_KEY}:scan", json.dumps(scan_status))
            
            utils.log("INFO", f"Escaneo completado: {len(results['active_transmitters'])} transmisores encontrados")
            
            # Auto-configuración si se solicitó
            if auto_config and results['active_transmitters']:
                # Seleccionar el transmisor con más paquetes detectados
                best_transmitter = max(results['active_transmitters'], key=lambda x: x['count'])
                ip = best_transmitter['ip']
                
                utils.log("INFO", f"Auto-configurando para recibir desde {ip}:{port or config.UDP_PORT}")
                
                # Actualizar la configuración
                new_config = {
                    "udp_host": ip,
                    "udp_port": port or config.UDP_PORT
                }
                
                # Aplicar la nueva configuración
                await self._update_config(new_config)
                
                # Reiniciar la conexión UDP
                await self._restart_udp(ip, port or config.UDP_PORT)
            
        except Exception as e:
            utils.log("ERROR", f"Error durante el escaneo de red: {e}")
            
            # Guardar error en Redis
            scan_status = {
                "scan_status": "error",
                "scan_error": str(e),
                "scan_end_time": time.time()
            }
            await self._client.set(f"{config.STATUS_KEY}:scan", json.dumps(scan_status))
