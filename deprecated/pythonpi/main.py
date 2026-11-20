import asyncio
import os
import json
from redis import asyncio as aioredis
from dotenv import load_dotenv

load_dotenv()

REDIS_STREAM = "mylaps:stream"
GROUP_NAME = "mylaps-group"
CONSUMER_NAME = "main-consumer"

async def process():
    """
    Procesa mensajes desde Redis Stream y los mantiene en Redis como estado actual.
    La persistencia en MySQL ahora se maneja por el middleware Node.js.
    """
    redis = aioredis.Redis()
    try:
        await redis.xgroup_create(name=REDIS_STREAM, groupname=GROUP_NAME, id="$", mkstream=True)
    except Exception as e:
        if "BUSYGROUP" in str(e):
            print("Grupo de consumidores ya existe, continuando...")
        else:
            raise
    print("👂 Escuchando stream...")

    while True:
        try:
            resp = await redis.xreadgroup(GROUP_NAME, CONSUMER_NAME, streams={REDIS_STREAM: ">"}, count=1, block=5000)
            if not resp:
                continue

            for stream, messages in resp:
                for msg_id, msg_data in messages:
                    data = {k.decode(): v.decode() for k, v in msg_data.items()}
                    print(f"📥 Recibido: {data}")

                    # Guardar en Redis como estado actual
                    await redis.hset(f"driver_state:{data.get('driver_id', data.get('transponder', 'unknown'))}", mapping=data)

                    # Confirmar el mensaje
                    await redis.xack(REDIS_STREAM, GROUP_NAME, msg_id)
                    print(f"✅ ACK {msg_id}")
                    
        except Exception as err:
            print(f"🚨 Error en loop principal: {err}")

if __name__ == "__main__":
    asyncio.run(process())
