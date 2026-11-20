import asyncio
from redis import asyncio as aioredis
import os
import dotenv

dotenv.load_dotenv()

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
REDIS_STREAM = os.getenv("REDIS_STREAM", "mylaps:stream")
GROUP_NAME = os.getenv("REDIS_GROUP", "mylaps-middleware-group")
CONSUMER_NAME = os.getenv("REDIS_CONSUMER", "recovery-consumer")

async def recover():
    redis = aioredis.from_url(REDIS_URL, decode_responses=True)
    print("🔄 Iniciando recuperación de mensajes pendientes...")

    while True:
        try:
            pending = await redis.xpending_range(
                REDIS_STREAM, GROUP_NAME, min="-", max="+", count=10
            )
            for p in pending:
                msg_id = p[0]
                await redis.xclaim(
                    REDIS_STREAM, GROUP_NAME, CONSUMER_NAME,
                    min_idle_time=60000, message_ids=[msg_id]
                )
                print(f"🔁 Reclamado {msg_id} para reprocesar")
        except Exception as e:
            print(f"❌ Error en recovery_worker: {e}")
        
        await asyncio.sleep(10)

if __name__ == "__main__":
    asyncio.run(recover())
