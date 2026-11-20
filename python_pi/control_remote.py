#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Script de prueba para el control remoto del ingestor UDP
Permite enviar comandos al ingestor mediante Redis PubSub
"""

import argparse
import json
import sys
import os
import redis
import time

# Intentar cargar variables de entorno desde .env
try:
    import dotenv
    dotenv.load_dotenv()
    print("[config] Cargando variables desde archivo .env")
except ImportError:
    print("[config] dotenv no instalado, usando variables de entorno")
except Exception as e:
    print(f"[config] Error cargando .env: {e}")

# Configuración
REDIS_URL = os.getenv("REDIS_URL", "redis://:Rd%242025%21NodeCG%23Secure%4077X9P%26Ultra%2AStrong@66.42.90.210:6379")
DEVICE_ID = os.getenv("DEVICE_ID", "mylaps-ingestor")  # Debe coincidir con el ingestor
CONTROL_CHANNEL = f"control:{DEVICE_ID}"
STATUS_KEY = f"status:{DEVICE_ID}"
CONFIG_KEY = f"config:{DEVICE_ID}"

def get_redis_client():
    """Conecta a Redis y retorna el cliente"""
    try:
        client = redis.Redis.from_url(REDIS_URL, decode_responses=True)
        client.ping()  # Probar conexión
        return client
    except Exception as e:
        print(f"Error conectando a Redis: {e}")
        sys.exit(1)

def print_status(client):
    """Imprime el estado actual del ingestor"""
    try:
        # Solicitar actualización de estado
        client.publish(CONTROL_CHANNEL, json.dumps({"command": "get_status"}))
        
        # Dar tiempo a que se actualice el estado
        time.sleep(0.5)
        
        # Obtener y mostrar el estado
        status = client.get(STATUS_KEY)
        if status:
            status_data = json.loads(status)
            print("\n=== ESTADO DEL INGESTOR ===")
            print(f"Device ID: {status_data.get('device_id')}")
            print(f"Estado: {status_data.get('status')}")
            print(f"Uptime: {status_data.get('uptime')}")
            
            # Modo de operación
            mode = "Simulador" if status_data.get('simulator', {}).get('active', False) else "UDP"
            print(f"\nModo: {mode}")
            
            if mode == "UDP":
                udp = status_data.get('udp', {})
                print(f"UDP: {udp.get('host')}:{udp.get('port')}")
                print(f"Mensajes recibidos: {udp.get('messages_received', 0)}")
            else:
                sim = status_data.get('simulator', {})
                print(f"Archivo: {sim.get('file_path')}")
                print(f"Líneas leídas: {sim.get('lines_read', 0)}")
                print(f"Delay: {sim.get('delay_ms')} ms")
                print(f"Loop: {'Sí' if sim.get('loop') else 'No'}")
            
            redis_info = status_data.get('redis', {})
            print(f"\nRedis Stream: {redis_info.get('stream_key')}")
            print(f"Batches enviados: {redis_info.get('batches_sent', 0)}")
            print(f"Mensajes enviados: {redis_info.get('messages_sent', 0)}")
            print(f"Errores: {redis_info.get('errors', 0)}")
            
            last_msg = status_data.get('last_message', {})
            if last_msg.get('time'):
                print(f"\nÚltimo mensaje: {last_msg.get('time')} (hace {last_msg.get('age_seconds', 0):.1f}s)")
                print(f"Contenido: {last_msg.get('content', '')}")
            
            msg_types = status_data.get('message_types', {})
            if msg_types:
                print("\nTipos de mensajes:")
                for t, count in msg_types.items():
                    print(f"  {t}: {count}")
        else:
            print("No se pudo obtener el estado del ingestor")
    except Exception as e:
        print(f"Error obteniendo estado: {e}")

def print_config(client):
    """Imprime la configuración actual del ingestor"""
    try:
        # Solicitar actualización de configuración
        client.publish(CONTROL_CHANNEL, json.dumps({"command": "get_config"}))
        
        # Dar tiempo a que se actualice
        time.sleep(0.5)
        
        # Obtener y mostrar configuración
        config = client.get(CONFIG_KEY)
        if config:
            config_data = json.loads(config)
            print("\n=== CONFIGURACIÓN DEL INGESTOR ===")
            for key, value in config_data.items():
                print(f"{key}: {value}")
        else:
            print("No se pudo obtener la configuración del ingestor")
    except Exception as e:
        print(f"Error obteniendo configuración: {e}")

def update_config(client, **kwargs):
    """Actualiza la configuración del ingestor"""
    try:
        # Preparar comando
        command = {
            "command": "update_config",
            "config": kwargs
        }
        
        # Enviar comando
        client.publish(CONTROL_CHANNEL, json.dumps(command))
        print(f"Configuración actualizada: {kwargs}")
    except Exception as e:
        print(f"Error actualizando configuración: {e}")

def restart_udp(client, host=None, port=None):
    """Reinicia el servidor UDP"""
    try:
        # Preparar comando
        command = {
            "command": "restart_udp"
        }
        
        if host:
            command["host"] = host
        if port:
            command["port"] = int(port)
        
        # Enviar comando
        client.publish(CONTROL_CHANNEL, json.dumps(command))
        
        host_str = f" en {host}:{port}" if host and port else ""
        print(f"Reiniciando servidor UDP{host_str}...")
    except Exception as e:
        print(f"Error reiniciando servidor UDP: {e}")

def restart_simulator(client, file_path=None, delay_ms=None, loop=None):
    """Reinicia el simulador"""
    try:
        # Preparar comando
        command = {
            "command": "restart_simulator"
        }
        
        if file_path:
            command["file_path"] = file_path
        if delay_ms is not None:
            command["delay_ms"] = int(delay_ms)
        if loop is not None:
            command["loop"] = loop
        
        # Enviar comando
        client.publish(CONTROL_CHANNEL, json.dumps(command))
        
        file_str = f" con archivo {file_path}" if file_path else ""
        print(f"Reiniciando simulador{file_str}...")
    except Exception as e:
        print(f"Error reiniciando simulador: {e}")

def reset_stats(client):
    """Reinicia las estadísticas del ingestor"""
    try:
        # Enviar comando
        client.publish(CONTROL_CHANNEL, json.dumps({"command": "reset_stats"}))
        print("Estadísticas reiniciadas")
    except Exception as e:
        print(f"Error reiniciando estadísticas: {e}")

def main():
    """Función principal"""
    parser = argparse.ArgumentParser(description="Control remoto para el ingestor UDP/Simulador")
    subparsers = parser.add_subparsers(dest="command", help="Comando a ejecutar")
    
    # Comando status
    status_parser = subparsers.add_parser("status", help="Obtener estado del ingestor")
    
    # Comando config
    config_parser = subparsers.add_parser("config", help="Obtener o actualizar configuración")
    config_parser.add_argument("--update", action="store_true", help="Actualizar configuración")
    config_parser.add_argument("--use-simulator", dest="use_simulator", 
                               choices=["true", "false"], help="Usar simulador en vez de UDP")
    config_parser.add_argument("--simulator-file", help="Ruta al archivo de datos para simulación")
    config_parser.add_argument("--simulator-delay-ms", type=int, help="Retraso entre líneas en milisegundos")
    config_parser.add_argument("--simulator-loop", dest="simulator_loop",
                               choices=["true", "false"], help="Si el simulador debe repetir el archivo")
    config_parser.add_argument("--udp-host", help="Host UDP")
    config_parser.add_argument("--udp-port", type=int, help="Puerto UDP")
    config_parser.add_argument("--stream-key", help="Clave del stream Redis")
    config_parser.add_argument("--stream-maxlen", type=int, help="Longitud máxima del stream")
    config_parser.add_argument("--batch-size", type=int, help="Tamaño del lote")
    config_parser.add_argument("--flush-ms", type=int, help="Intervalo de flush (ms)")
    config_parser.add_argument("--log-level", choices=["DEBUG", "INFO", "WARNING", "ERROR"], help="Nivel de logging")
    
    # Comando restart-udp
    restart_parser = subparsers.add_parser("restart-udp", help="Reiniciar servidor UDP")
    restart_parser.add_argument("--host", help="Host UDP")
    restart_parser.add_argument("--port", type=int, help="Puerto UDP")
    
    # Comando restart-simulator
    restart_sim_parser = subparsers.add_parser("restart-simulator", help="Reiniciar simulador")
    restart_sim_parser.add_argument("--file", help="Ruta al archivo de datos")
    restart_sim_parser.add_argument("--delay", type=int, help="Retraso entre líneas en milisegundos")
    restart_sim_parser.add_argument("--loop", choices=["true", "false"], help="Si debe repetir el archivo")
    
    # Comando reset-stats
    subparsers.add_parser("reset-stats", help="Reiniciar estadísticas")
    
    # Parsear argumentos
    args = parser.parse_args()
    
    if not args.command:
        parser.print_help()
        sys.exit(1)
    
    # Conectar a Redis
    client = get_redis_client()
    
    # Ejecutar comando
    if args.command == "status":
        print_status(client)
    
    elif args.command == "config":
        if args.update:
            config_update = {}
            if hasattr(args, 'use_simulator') and args.use_simulator is not None:
                config_update["use_simulator"] = args.use_simulator == "true"
            if args.simulator_file:
                config_update["simulator_file"] = args.simulator_file
            if args.simulator_delay_ms is not None:
                config_update["simulator_delay_ms"] = args.simulator_delay_ms
            if hasattr(args, 'simulator_loop') and args.simulator_loop is not None:
                config_update["simulator_loop"] = args.simulator_loop == "true"
            if args.udp_host:
                config_update["udp_host"] = args.udp_host
            if args.udp_port:
                config_update["udp_port"] = args.udp_port
            if args.stream_key:
                config_update["stream_key"] = args.stream_key
            if args.stream_maxlen:
                config_update["stream_maxlen"] = args.stream_maxlen
            if args.batch_size:
                config_update["batch_size"] = args.batch_size
            if args.flush_ms:
                config_update["flush_ms"] = args.flush_ms
            if args.log_level:
                config_update["log_level"] = args.log_level
                
            if config_update:
                update_config(client, **config_update)
            else:
                print("No se especificaron valores para actualizar")
        else:
            print_config(client)
    
    elif args.command == "restart-udp":
        restart_udp(client, args.host, args.port)
    
    elif args.command == "restart-simulator":
        loop = None
        if hasattr(args, 'loop') and args.loop is not None:
            loop = args.loop == "true"
        restart_simulator(client, args.file, args.delay, loop)
    
    elif args.command == "reset-stats":
        reset_stats(client)

if __name__ == "__main__":
    main()
