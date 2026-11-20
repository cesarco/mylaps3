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

# Obtener mapeo de RID a número de piloto
def get_rid_mapping():
    mapping = {}
    rid_key = f"{SESSION_KEY}:rid"
    
    # Verificar si existe la clave
    if r.exists(rid_key):
        # Obtener el mapeo
        mapping_data = r.hgetall(rid_key)
        
        # La clave es el número real del piloto y el valor es el RID interno
        # Necesitamos invertir esto para tener RID -> número de piloto
        inverted_mapping = {}
        for driver_num, rid in mapping_data.items():
            inverted_mapping[rid] = driver_num
        
        print(f"Encontrado mapeo de {len(mapping_data)} pilotos")
        return inverted_mapping
    else:
        print("No se encontró mapeo de RID")
        return {}

# Obtener todos los datos de los pilotos
def get_all_drivers():
    print("\nObteniendo datos de pilotos...")
    
    # Obtener mapeo de RID
    rid_mapping = get_rid_mapping()
    
    # Buscar todos los estados de pilotos
    driver_state_keys = r.keys(f"{SESSION_KEY}:driver:*:state")
    
    if not driver_state_keys:
        print("No se encontraron estados de pilotos")
        return []
    
    print(f"Encontrados {len(driver_state_keys)} pilotos con estado")
    
    # Recopilar datos de cada piloto
    drivers = []
    for key in driver_state_keys:
        # Extraer el RID del patrón {SESSION}:driver:{RID}:state
        rid = key.split(':')[2]
        
        # Obtener datos del estado
        state_data = r.hgetall(key)
        
        if state_data:
            # Añadir RID
            state_data['rid'] = rid
            
            # Buscar datos del catálogo si existen
            catalog_key = f"{SESSION_KEY}:driver:{rid}:catalog"
            if r.exists(catalog_key):
                catalog_data = r.hgetall(catalog_key)
                # Combinar con datos de estado
                for k, v in catalog_data.items():
                    if k not in state_data or not state_data[k]:
                        state_data[k] = v
            
            # Añadir mapeo de RID a número real si está disponible
            if rid in rid_mapping:
                state_data['mapped_number'] = rid_mapping[rid]
                
            drivers.append(state_data)
    
    return drivers

# Reconstruir el leaderboard
def reconstruct_leaderboard(drivers):
    if not drivers:
        print("No hay datos de pilotos para reconstruir el leaderboard")
        return
    
    # Agrupar por clase
    drivers_by_class = defaultdict(list)
    for driver in drivers:
        class_id = driver.get('class', '1')
        drivers_by_class[class_id].append(driver)
    
    print(f"Pilotos agrupados en {len(drivers_by_class)} clases")
    
    # Ordenar por posición dentro de cada clase
    for class_id, class_drivers in drivers_by_class.items():
        # Ordenar primero por vueltas (descendente) y luego por tiempo total (ascendente)
        class_drivers.sort(
            key=lambda x: (
                -int(x.get('laps', 0)), 
                float(x.get('last_total_ms', float('inf')))
            )
        )
        
        print(f"\n=== Leaderboard para la Clase {class_id} ===")
        print(f"{'Pos':^5} | {'Num':^5} | {'Piloto':^30} | {'Vueltas':^10} | {'Mejor Vuelta':^15} | {'Tiempo Total':^15}")
        print("-" * 95)
        
        for pos, driver in enumerate(class_drivers, 1):
            # Obtener datos del piloto
            driver_num = driver.get('number', driver.get('registration', 'N/A'))
            first_name = driver.get('first_name', driver.get('firstname', ''))
            last_name = driver.get('last_name', driver.get('lastname', ''))
            name = f"{first_name} {last_name}".strip()
            if not name:
                name = driver.get('name', 'N/A')
                
            laps = driver.get('laps', '0')
            
            # Formatear tiempo de vuelta
            best_ms = int(driver.get('best_ms', 0))
            if best_ms > 0:
                mins = best_ms // 60000
                secs = (best_ms % 60000) // 1000
                ms = best_ms % 1000
                best_lap = f"{mins:02d}:{secs:02d}.{ms:03d}"
            else:
                best_lap = "N/A"
                
            # Formatear tiempo total
            last_total_ms = int(driver.get('last_total_ms', 0))
            if last_total_ms > 0:
                mins = last_total_ms // 60000
                secs = (last_total_ms % 60000) // 1000
                ms = last_total_ms % 1000
                total_time = f"{mins:02d}:{secs:02d}.{ms:03d}"
            else:
                total_time = "N/A"
            
            print(f"{pos:^5} | {driver_num:^5} | {name:^30} | {laps:^10} | {best_lap:^15} | {total_time:^15}")
            
            # Actualizar la posición en Redis si es diferente
            current_pos = driver.get('position')
            if current_pos != str(pos):
                print(f"Actualizando posición de {name} (#{driver_num}) de {current_pos} a {pos}")
                
                # Actualizar el estado del piloto
                driver_state_key = f"{SESSION_KEY}:driver:{driver['rid']}:state"
                r.hset(driver_state_key, 'position', str(pos))
                
                # Actualizar el leaderboard
                leaderboard_key = f"{SESSION_KEY}:leaderboard:{pos}"
                driver_data = {
                    'driverid': driver.get('driverid', driver.get('registration', '')),
                    'position': str(pos),
                    'registration': driver.get('registration', ''),
                    'number': driver.get('number', ''),
                    'first_name': first_name,
                    'last_name': last_name,
                    'name': name,
                    'class': class_id,
                    'laps': laps,
                    'best_ms': driver.get('best_ms', '0'),
                    'total_ms': driver.get('total_ms', '0'),
                    'last_total_ms': driver.get('last_total_ms', '0'),
                    'rid': driver['rid']
                }
                r.hset(leaderboard_key, mapping=driver_data)
            else:
                print(f"Posición de {name} (#{driver_num}) ya es {pos} - No se actualiza")

# Función principal
def main():
    print("=== Reconstrucción del Leaderboard basado en datos de Redis ===")
    
    # Obtener todos los datos de pilotos
    drivers = get_all_drivers()
    
    # Reconstruir el leaderboard
    reconstruct_leaderboard(drivers)
    
    print("\nProceso de reconstrucción completado!")

if __name__ == "__main__":
    main()