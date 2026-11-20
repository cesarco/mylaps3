import asyncio
import re
import sys
from redis import asyncio as aioredis

REDIS_STREAM = "mylaps:stream"

# Regex para extraer tipo y campos
DATA_REGEX = re.compile(r'\[(\w+)] (\$\w),(.*)')

# Función para parsear una línea
def parse_line(line):
    # Ignorar timestamp si existe
    if "] [" in line:
        line = line.split("] [", 1)[1]
        line = "[" + line  # restaurar el formato original
    match = DATA_REGEX.match(line)
    if not match:
        return None
    tipo, prefix, campos = match.groups()
    campos = [c.strip('"') for c in campos.split(',')]
    # Ejemplo para LAP_DATA
    if tipo == "LAP_DATA" and prefix == "$H":
        if len(campos) >= 5:
            # Formato real: ['$H', '1', '133', '8', '00:01:27.595']
            return {
                "type": tipo,
                "driver_id": campos[2],
                "lap_number": campos[3],
                "lap_time": campos[4]
            }
        elif len(campos) == 4:
            # Formato real: ['$H', '1', '133', '8', '00:01:27.595'] pero sin split del prefijo
            return {
                "type": tipo,
                "driver_id": campos[1],
                "lap_number": campos[2],
                "lap_time": campos[3]
            }
        else:
            print(f"⚠️ Línea ignorada por formato insuficiente: {campos}")
            return None
    # Puedes agregar más tipos aquí
    return None

async def main():
    redis = aioredis.Redis(host="66.42.90.210", port=6379)
    print("⏳ Esperando datos por stdin...")
    if not sys.stdin.isatty():
        print("🔄 Leyendo desde stdin...")
    else:
        print("⚠️ No se está leyendo desde stdin, asegúrate de redirigir la entrada correctamente.")
    print("🔄 Asegúrate de que el formato de entrada sea correcto.")
    while True:
        line = sys.stdin.readline()
        if not line:
            await asyncio.sleep(0.1)
            continue
        data = parse_line(line.strip())
        if data:
            await redis.xadd(REDIS_STREAM, data)
            print(f"📤 Publicado: {data}")

if __name__ == "__main__":
    asyncio.run(main())
