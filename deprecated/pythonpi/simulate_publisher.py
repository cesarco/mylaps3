import asyncio
import random
from redis import asyncio as aioredis

REDIS_STREAM = "mylaps:stream"

def get_lap():
    drivers = ["D01", "D02", "D03"]
    return {
        "driver_id": random.choice(drivers),
        "session_id": "session_001",
        "lap_number": str(random.randint(1, 50)),
        "lap_time": str(round(random.uniform(60, 90), 3))
    }

async def publish():
    redis = aioredis.Redis()
    while True:
        lap = get_lap()
        await redis.xadd(REDIS_STREAM, lap)
        print(f"📤 Publicado: {lap}")
        await asyncio.sleep(2)

if __name__ == "__main__":
    asyncio.run(publish())
