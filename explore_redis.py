#!/usr/bin/env python3
import redis
import json
from collections import defaultdict

# Configuración de Redis desde config/index.js
REDIS_HOST = '66.42.90.210'
REDIS_PORT = 6379
REDIS_PASSWORD = 'Rd$2025!NodeCG#Secure@77X9P&Ultra*Strong'
SESSION_KEY = 'default'  # Valor por defecto de la sesión

# Conectar a Redis
print(f"Conectando a Redis en {REDIS_HOST}:{REDIS_PORT}...")
try:
    r = redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        password=REDIS_PASSWORD,
        decode_responses=True  # Para recibir strings en lugar de bytes
    )
    # Verificar conexión
    pong = r.ping()
    print(f"Conexión a Redis {'establecida' if pong else 'fallida'}")
except Exception as e:
    print(f"Error al conectar con Redis: {e}")
    exit(1)

# Explorar todas las claves disponibles
def explore_redis_keys():
    print("\n=== Explorando claves de Redis ===")
    
    # Obtenemos todas las claves que comienzan con la sesión actual
    all_keys = r.keys(f"{SESSION_KEY}:*")
    print(f"Total de claves encontradas: {len(all_keys)}")
    
    # Agrupar claves por tipo (driver, leaderboard, etc)
    key_types = defaultdict(list)
    for key in all_keys:
        parts = key.split(':')
        if len(parts) > 1:
            key_type = parts[1]  # El tipo está después de la sesión
            key_types[key_type].append(key)
    
    # Mostrar cuántas claves hay de cada tipo
    for key_type, keys in key_types.items():
        print(f"Tipo '{key_type}': {len(keys)} claves")
    
    return key_types

# Examinar datos de drivers
def examine_drivers(key_types):
    print("\n=== Examinando datos de drivers ===")
    
    if 'driver' not in key_types:
        print("No se encontraron datos de drivers")
        return
    
    # Obtener una muestra de drivers para explorar estructura
    driver_keys = key_types['driver']
    state_keys = [k for k in driver_keys if k.endswith(':state')]
    catalog_keys = [k for k in driver_keys if k.endswith(':catalog')]
    
    print(f"Encontrados {len(state_keys)} estados de driver y {len(catalog_keys)} catálogos")
    
    # Examinar el primero para ver la estructura
    if state_keys:
        sample_state_key = state_keys[0]
        print(f"\nEjemplo de estado de driver ({sample_state_key}):")
        state_data = r.hgetall(sample_state_key)
        for k, v in state_data.items():
            print(f"  {k}: {v}")
    
    if catalog_keys:
        sample_catalog_key = catalog_keys[0]
        print(f"\nEjemplo de catálogo de driver ({sample_catalog_key}):")
        catalog_data = r.hgetall(sample_catalog_key)
        for k, v in catalog_data.items():
            print(f"  {k}: {v}")

# Examinar datos del leaderboard
def examine_leaderboard(key_types):
    print("\n=== Examinando datos del leaderboard ===")
    
    if 'leaderboard' not in key_types:
        print("No se encontraron datos de leaderboard")
        return
    
    leaderboard_keys = key_types['leaderboard']
    print(f"Encontradas {len(leaderboard_keys)} claves de leaderboard")
    
    # Ver qué posiciones están definidas
    position_keys = [k for k in leaderboard_keys if not k.endswith(':ranking')]
    ranking_keys = [k for k in leaderboard_keys if k.endswith(':ranking')]
    
    print(f"Posiciones definidas: {len(position_keys)}")
    print(f"Rankings definidos: {len(ranking_keys)}")
    
    # Mostrar una muestra del leaderboard
    if position_keys:
        print("\nPrimeras 3 posiciones del leaderboard:")
        for i, key in enumerate(sorted(position_keys)[:3]):
            print(f"\nPosición {i+1} ({key}):")
            pos_data = r.hgetall(key)
            for k, v in pos_data.items():
                print(f"  {k}: {v}")

# Verificar la asignación de IDs (RIDs)
def examine_rid_mapping(key_types):
    print("\n=== Examinando mapeo de RIDs ===")
    
    rid_keys = key_types.get('rid', [])
    if not rid_keys:
        print("No se encontraron mapeos de RID")
        return
    
    print(f"Encontradas {len(rid_keys)} claves de mapeo RID")
    
    # Mostrar el mapeo de RID a número de piloto
    for key in rid_keys:
        print(f"\nMapeo RID ({key}):")
        mapping_data = r.hgetall(key)
        for k, v in mapping_data.items():
            print(f"  RID {k} -> {v}")

# Examinar datos de la carrera
def examine_race_data(key_types):
    print("\n=== Examinando datos de carrera ===")
    
    # Buscar información del evento
    event_keys = [k for k in key_types.get('event', [])]
    run_keys = [k for k in key_types.get('run', [])]
    
    if event_keys:
        print("\nDatos del evento:")
        for key in event_keys:
            event_data = r.hgetall(key)
            for k, v in event_data.items():
                print(f"  {k}: {v}")
    
    if run_keys:
        print("\nDatos de la carrera:")
        for key in run_keys:
            run_data = r.hgetall(key)
            for k, v in run_data.items():
                print(f"  {k}: {v}")

# Función principal
def main():
    print("=== Exploración de datos en Redis ===")
    
    # Explorar las claves disponibles
    key_types = explore_redis_keys()
    
    # Examinar la estructura de diferentes tipos de datos
    examine_drivers(key_types)
    examine_leaderboard(key_types)
    examine_rid_mapping(key_types)
    examine_race_data(key_types)
    
    print("\nProceso de exploración completado!")

if __name__ == "__main__":
    main()