#!/usr/bin/env python3
import redis

# Configuración de Redis desde config/index.js
REDIS_HOST = '66.42.90.210'
REDIS_PORT = 6379
REDIS_PASSWORD = 'Rd$2025!NodeCG#Secure@77X9P&Ultra*Strong'
SESSION_KEY = 'default'

# Conectar a Redis
print(f"Conectando a Redis en {REDIS_HOST}:{REDIS_PORT}...")
try:
    r = redis.Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        password=REDIS_PASSWORD,
        decode_responses=True
    )
    # Verificar conexión
    pong = r.ping()
    print(f"Conexión a Redis {'establecida' if pong else 'fallida'}")
except Exception as e:
    print(f"Error al conectar con Redis: {e}")
    exit(1)

# Obtener todas las claves de driver
driver_keys = r.keys(f"{SESSION_KEY}:driver:*")
print(f"Total de claves de driver: {len(driver_keys)}")

# Agrupar por tipos de claves
key_types = {}
for key in driver_keys:
    key_parts = key.split(":")
    if len(key_parts) >= 4:
        key_type = key_parts[-1]  # Último componente (state, catalog, etc)
        if key_type not in key_types:
            key_types[key_type] = []
        key_types[key_type].append(key)

# Mostrar cuántas claves hay de cada tipo
print("\nDistribución de claves por tipo:")
for key_type, keys in key_types.items():
    print(f"Tipo '{key_type}': {len(keys)} claves")

# Listar todos los RIDs únicos
rids = set()
for key in driver_keys:
    key_parts = key.split(":")
    if len(key_parts) >= 4:
        rid = key_parts[2]  # Componente RID (default:driver:RID:type)
        rids.add(rid)

print(f"\nTotal de RIDs únicos: {len(rids)}")
print("Lista de RIDs:")
for rid in sorted(rids, key=lambda x: int(x) if x.isdigit() else x):
    print(f"- RID {rid}")

# Verificar el mapeo de RID a número de piloto
rid_key = f"{SESSION_KEY}:rid"
if r.exists(rid_key):
    print("\nMapeo de RID a número de piloto:")
    mapping = r.hgetall(rid_key)
    for driver_num, rid in mapping.items():
        print(f"Piloto #{driver_num} -> RID {rid}")

# Examinar una muestra de estado de driver
if 'state' in key_types and key_types['state']:
    sample_key = key_types['state'][0]
    print(f"\nEjemplo de estado de driver ({sample_key}):")
    state_data = r.hgetall(sample_key)
    
    # Filtrar campos más importantes
    important_fields = ['number', 'registration', 'first_name', 'last_name', 'class', 'position', 'laps']
    print("Campos principales:")
    for field in important_fields:
        if field in state_data:
            print(f"  {field}: {state_data[field]}")