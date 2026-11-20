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

# Función para obtener el patrón de clave con la sesión
def get_key(pattern, **kwargs):
    pattern = pattern.replace('{S}', SESSION_KEY)
    for key, value in kwargs.items():
        pattern = pattern.replace(f'{{{key}}}', str(value))
    return pattern

# Obtener todos los drivers del estado actual
def get_all_drivers():
    print("Buscando drivers en Redis...")
    # Patrón para buscar todos los estados de drivers
    pattern = f"{SESSION_KEY}:driver:*:state"
    driver_keys = r.keys(pattern)
    
    if not driver_keys:
        print("No se encontraron datos de drivers en Redis")
        return []
    
    print(f"Se encontraron {len(driver_keys)} drivers")
    
    # Obtener detalles de cada driver
    drivers = []
    for key in driver_keys:
        rid = key.split(':')[2]  # Obtener el RID del patrón {S}:driver:{rid}:state
        driver_data = r.hgetall(key)
        if driver_data:
            driver_data['rid'] = rid
            driver_catalog_key = f"{SESSION_KEY}:driver:{rid}:catalog"
            catalog_data = r.hgetall(driver_catalog_key)
            if catalog_data:
                driver_data.update(catalog_data)
            drivers.append(driver_data)
    
    return drivers

# Reconstruir el leaderboard basado en los datos de los drivers
def reconstruct_leaderboard(drivers):
    if not drivers:
        print("No hay datos de drivers para reconstruir el leaderboard")
        return
    
    # Agrupar por clase
    drivers_by_class = defaultdict(list)
    for driver in drivers:
        class_id = driver.get('class', '1')  # Por defecto clase 1 si no se especifica
        drivers_by_class[class_id].append(driver)
    
    print(f"Drivers agrupados por {len(drivers_by_class)} clases")
    
    # Ordenar por posición dentro de cada clase
    for class_id, class_drivers in drivers_by_class.items():
        # Ordenar primero por laps (descendente) y luego por totalracetime (ascendente)
        class_drivers.sort(
            key=lambda x: (
                -int(x.get('laps', 0)), 
                float(x.get('totalracetime', float('inf')))
            )
        )
        
        print(f"\nClase {class_id} - Leaderboard:")
        print("Pos | Num | Nombre                | Apellido              | Vueltas | Tiempo Total")
        print("-" * 80)
        
        for pos, driver in enumerate(class_drivers, 1):
            driver_num = driver.get('num', 'N/A')
            firstname = driver.get('firstname', 'N/A')
            lastname = driver.get('lastname', 'N/A')
            laps = driver.get('laps', '0')
            total_time = driver.get('totalracetime', 'N/A')
            
            print(f"{pos:3} | {driver_num:3} | {firstname:20} | {lastname:20} | {laps:7} | {total_time}")
            
            # Actualizar la posición en Redis si es diferente
            if driver.get('position') != str(pos):
                leaderboard_key = get_key('{S}:leaderboard:{pos}', pos=pos)
                r.hset(leaderboard_key, mapping={
                    'num': driver_num,
                    'firstname': firstname,
                    'lastname': lastname,
                    'laps': laps,
                    'totalracetime': total_time,
                    'rid': driver.get('rid', ''),
                    'class': class_id
                })
                
                # También actualizamos la posición en el estado del driver
                driver_state_key = f"{SESSION_KEY}:driver:{driver.get('rid')}:state"
                r.hset(driver_state_key, 'position', pos)
                
                print(f"Actualizada posición de {firstname} {lastname} (#{driver_num}) a {pos}")

# Función principal
def main():
    print("=== Reconstrucción de Leaderboard desde datos Redis ===")
    drivers = get_all_drivers()
    reconstruct_leaderboard(drivers)
    print("\nProceso completado!")

if __name__ == "__main__":
    main()