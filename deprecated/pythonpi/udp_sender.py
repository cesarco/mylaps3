import socket
import time
import re
import os

UDP_IP = os.getenv("UDP_IP", "0.0.0.0")
UDP_PORT = int(os.getenv("UDP_PORT", "5000"))
DATOS_FILE = os.getenv("DATOS_FILE", "datos.txt")

sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
print(f"🚀 Enviando mensajes UDP a {UDP_IP}:{UDP_PORT}...")

pattern = re.compile(r'(\$[A-Z]+,.*)')

with open(DATOS_FILE, "r", encoding="utf-8") as f:
    for line in f:
        match = pattern.search(line)
        if match:
            msg = match.group(1).encode("utf-8")
            sock.sendto(msg, (UDP_IP, UDP_PORT))
            print(f"Enviado: {msg}")
            # time.sleep(0.2)  # Delay eliminado para envío inmediato

sock.close()
print("✅ Todos los mensajes enviados.")