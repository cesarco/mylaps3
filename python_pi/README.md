# Ingestor Modular para RMonitor/Orbits

Este proyecto contiene un ingestor modular para recibir datos de RMonitor/Orbits
desde UDP o desde archivo (simulador) y enviarlos a Redis Streams. Además, 
soporta control remoto vía Redis PubSub.

## Estructura del Proyecto

```
python_pi/
├── main.py                 # Punto de entrada principal
├── run_ingestor.sh         # Script de ejecución
├── control_remote.py       # Utilidad de control remoto
├── .env.example            # Ejemplo de configuración
├── mylaps/                 # Paquete Python
│   ├── __init__.py         # Definición del paquete
│   ├── config.py           # Configuración y variables de entorno
│   ├── utils.py            # Funciones de utilidad
│   ├── stats.py            # Clase para estadísticas
│   ├── udp_listener.py     # Manejo de conexiones UDP
│   ├── redis_writer.py     # Escritura a Redis con batching
│   ├── remote_control.py   # Control remoto vía Redis PubSub
│   └── simulator.py        # Simulador basado en archivos
```

## Instalación

```bash
# Instalar dependencias
pip install redis>=5.0.0 python-dotenv

# Configuración
cp .env.example .env
# Editar .env con los valores deseados
```

## Ejecución

```bash
# Usando el script de ejecución
./run_ingestor.sh

# O manualmente
python3 main.py
```

### Modos de ejecución

El ingestor puede funcionar en dos modos diferentes:

1. **Modo UDP**: Recibe datos en tiempo real desde una conexión UDP (modo por defecto)
2. **Modo Simulador**: Lee datos desde un archivo de texto, simulando una conexión UDP

Para elegir el modo, configura la variable `USE_SIMULATOR` en el archivo `.env`:

```
# Para usar el simulador:
USE_SIMULATOR=true
SIMULATOR_FILE=./data/data.txt
SIMULATOR_DELAY_MS=100
SIMULATOR_LOOP=true

# Para usar UDP (por defecto):
USE_SIMULATOR=false
```

## Control Remoto

El ingestor soporta control remoto mediante Redis PubSub, lo que permite:

1. Obtener estadísticas de funcionamiento
2. Cambiar configuración en tiempo real
3. Reiniciar la conexión UDP o el simulador
4. Reiniciar las estadísticas

Se incluye un script `control_remote.py` para interactuar con el ingestor:

```bash
# Ver estado actual
./control_remote.py status

# Ver configuración
./control_remote.py config

# Cambiar configuración para UDP
./control_remote.py config --update --udp-port 5404 --log-level DEBUG

# Cambiar configuración para el simulador
./control_remote.py config --update --simulator-file "./data/test_data.txt" --simulator-delay-ms 50

# Cambiar entre UDP y simulador
./control_remote.py config --update --use-simulator true  # Activar simulador
./control_remote.py config --update --use-simulator false  # Activar UDP

# Reiniciar servidor UDP
./control_remote.py restart-udp

# Reiniciar simulador
./control_remote.py restart-simulator --file "./data/other_data.txt" --delay 200 --loop true

# Reiniciar estadísticas
./control_remote.py reset-stats
```

## Arquitectura

- **UDP Listener**: Recibe datagramas UDP y los convierte en líneas de texto.
- **Simulator**: Lee líneas desde un archivo de texto, simulando una conexión UDP.
- **Redis Writer**: Escribe líneas en Redis Streams usando batching para mejor rendimiento.
- **Remote Control**: Permite control remoto vía Redis PubSub.
- **Stats**: Mantiene estadísticas de rendimiento y estado.
- **Config**: Gestiona la configuración mediante variables de entorno y archivo .env.
- **Utils**: Funciones de utilidad comunes.

## Rendimiento

El ingestor está optimizado para alto rendimiento mediante:

- Batching de escrituras a Redis
- Flush periódico por intervalo de tiempo
- Cola asíncrona entre recepción UDP y escritura Redis

## Variables de Entorno

Ver `.env.example` para todas las variables de entorno disponibles.
