"""
MyLaps Connection Handler Component (UDP Version)

Escucha datagramas UDP desde MyLaps Orbits, procesa los mensajes
y los publica en un stream de Redis.
"""

import asyncio
import socket
from datetime import datetime
from redis import asyncio as aioredis
import dotenv
import os

# Cargar variables de entorno
dotenv.load_dotenv()

REDIS_STREAM = os.getenv("REDIS_STREAM", "mylaps:stream")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
MYLAPS_IP = os.getenv("MYLAPS_IP", "0.0.0.0")   # IP local donde escuchar
MYLAPS_PORT = int(os.getenv("MYLAPS_PORT", "5000"))
BUFFER_SIZE = int(os.getenv("BUFFER_SIZE", "2048"))
# Nueva opción: RAW o PARSED
SEND_RAW_DATA = os.getenv("SEND_RAW_DATA", "false").lower() == "true"


class MyLapsHandler:
    def __init__(self, redis_url=REDIS_URL):
        self.socket = None
        self.connected = False
        self.redis = aioredis.from_url(redis_url, decode_responses=True)

    def connect_udp(self):
        """Crea un socket UDP y lo deja escuchando en el puerto indicado."""
        try:
            print(f"📡 [MyLaps] Escuchando UDP en {MYLAPS_IP}:{MYLAPS_PORT}")
            self.socket = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            self.socket.bind((MYLAPS_IP, MYLAPS_PORT))
            self.socket.settimeout(5)
            self.connected = True
            return True
        except Exception as e:
            print(f"❌ [MyLaps] Error al abrir socket UDP: {e}")
            self.connected = False
            return False

    def receive_data_udp(self):
        """Recibe datagramas UDP desde MyLaps."""
        if not self.socket:
            return None
        try:
            raw_data, addr = self.socket.recvfrom(BUFFER_SIZE)
            return raw_data
        except socket.timeout:
            return None
        except Exception as e:
            print(f"❌ [UDP] Error recibiendo: {e}")
            return None

    def process_data(self, raw_data: bytes):
        """Parsea los mensajes MyLaps ($H, $G, $F, $A, $B, $C, $E, $COMP, $J)"""
        try:
            message_type = "UNKNOWN"
            processed_data = {
                "type": message_type,
                "timestamp": datetime.now().isoformat(),
                "position": ""
            }

            # Decodificar mensaje
            try:
                decoded = raw_data.decode()
                parts = decoded.split(",")
            except:
                processed_data["raw_message"] = raw_data.decode("utf-8", errors="ignore")
                return processed_data

            # Procesar según tipo de mensaje
            if raw_data.startswith(b"$H,"):  # Lap Data
                message_type = "LAP_DATA"
                processed_data.update({
                    "type": message_type,
                    "position": parts[1],
                    "transponder": parts[2].strip('"'),
                    "lap_number": parts[3],
                    "lap_time": parts[4].strip('"')
                })

            elif raw_data.startswith(b"$G,"):  # Position Data
                message_type = "POSITION_DATA" 
                processed_data.update({
                    "type": message_type,
                    "position": parts[1],
                    "transponder": parts[2].strip('"'),
                    "total_laps": parts[3],
                    "total_time": parts[4].strip('"')
                })

            elif raw_data.startswith(b"$A,"):  # Driver Registration
                message_type = "DRIVER_REG"
                processed_data.update({
                    "type": message_type,
                    "transponder": parts[1].strip('"'),
                    "kart_number": parts[2].strip('"'),
                    "driver_id": parts[3],
                    "first_name": parts[4].strip('"'),
                    "last_name": parts[5].strip('"'),
                    "class_id": parts[7]
                })

            elif raw_data.startswith(b"$B,"):  # Session Info
                message_type = "SESSION_INFO"
                processed_data.update({
                    "type": message_type,
                    "session_id": parts[1],
                    "session_name": parts[2].strip('"')
                })

            elif raw_data.startswith(b"$C,"):  # Class Definition
                message_type = "CLASS_DEF"
                processed_data.update({
                    "type": message_type,
                    "class_id": parts[1],
                    "class_name": parts[2].strip('"')
                })

            elif raw_data.startswith(b"$E,"):  # Event Metadata
                message_type = "EVENT_META"
                processed_data.update({
                    "type": message_type,
                    "key": parts[1].strip('"'),
                    "value": parts[2].strip('"')
                })

            elif raw_data.startswith(b"$F,"):  # Flag Status
                message_type = "FLAG_STATUS"
                processed_data.update({
                    "type": message_type,
                    "flag_id": parts[1],
                    "time1": parts[2].strip('"'),
                    "time2": parts[3].strip('"'),
                    "time3": parts[4].strip('"'),
                    "status": parts[5].strip().strip('"') if len(parts) > 5 else ""
                })

            elif raw_data.startswith(b"$COMP,"):  # Competitor Info
                message_type = "COMPETITOR_INFO"
                processed_data.update({
                    "type": message_type,
                    "transponder": parts[1].strip('"'),
                    "kart_number": parts[2].strip('"'),
                    "class_id": parts[3],
                    "first_name": parts[4].strip('"'),
                    "last_name": parts[5].strip('"')
                })

            elif raw_data.startswith(b"$J,"):  # Recognized
                message_type = "RECOGNIZED"
                processed_data.update({
                    "type": message_type,
                    "transponder": parts[1].strip('"'),
                    "time1": parts[2].strip('"'),
                    "time2": parts[3].strip('"')
                })
            else:
                processed_data["raw_message"] = decoded

            return processed_data
        except Exception as e:
            print(f"❌ Error procesando datos: {e}")
            return None

    async def publish_to_redis(self, data, raw_data=None):
        """Publica el mensaje en Redis Stream (RAW o PARSED según configuración)."""
        if SEND_RAW_DATA and raw_data:
            # Enviar datos RAW con timestamp
            raw_message = {
                "type": "RAW_MYLAPS_DATA",
                "timestamp": datetime.now().isoformat(),
                "raw_data": raw_data.decode('utf-8', errors='ignore')
            }
            await self.redis.xadd(REDIS_STREAM, raw_message)
            print(f"➡️  [Redis] Published RAW: {raw_message['raw_data'][:50]}...")
        elif data:
            # Enviar datos PARSED (comportamiento original)
            await self.redis.xadd(REDIS_STREAM, data)
            print(f"➡️  [Redis] Published PARSED: {data}")

    async def run_udp(self):
        """Loop principal: recibe UDP, procesa y publica en Redis."""
        if not self.connect_udp():
            return
        print(f"🚀 [MyLaps] Iniciando loop UDP... (RAW mode: {SEND_RAW_DATA})")
        while self.connected:
            raw = self.receive_data_udp()
            if raw:
                if SEND_RAW_DATA:
                    # En modo RAW, enviar directamente
                    await self.publish_to_redis(None, raw)
                else:
                    # En modo PARSED, procesar primero
                    processed = self.process_data(raw)
                    if processed:
                        await self.publish_to_redis(processed)
            await asyncio.sleep(0.05)


async def main():
    handler = MyLapsHandler(redis_url=REDIS_URL)
    await handler.run_udp()


if __name__ == "__main__":
    asyncio.run(main())
