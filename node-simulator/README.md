# MyLaps Simulator 🏁

Un simulador independiente con interfaz web para enviar datos de MyLaps a Redis, ideal para pruebas y desarrollo sin necesidad de hardware real.

## Características

- **Interfaz web moderna** - Control completo desde el navegador
- **Selección de archivos** - Elige cualquier archivo .txt de la carpeta data
- **Control en tiempo real** - Start, stop, y ajuste de velocidad
- **Reset de Redis** - Limpia todos los datos con un click
- **Monitoreo en vivo** - Ve el progreso y estadísticas en tiempo real
- **WebSockets** - Actualizaciones instantáneas del estado
- **Compatibilidad completa** - Usa la misma configuración de Redis que el middleware principal

## Instalación

1. Navega al directorio del simulador:
```bash
cd node-simulator
```

2. Instala las dependencias:
```bash
npm install
```

3. La configuración ya está lista en `.env` con los valores correctos del middleware principal

## Configuración

El archivo `.env` está configurado para usar la misma instancia de Redis que el middleware:

```env
REDIS_HOST=66.42.90.210                              # Servidor Redis remoto
REDIS_PORT=6379                                      # Puerto Redis
REDIS_PASSWORD=Rd$2025!NodeCG#Secure@77X9P&Ultra*Strong  # Password Redis
REDIS_DB=0                                           # Base de datos
REDIS_STREAM=mylaps:stream                           # Stream del middleware
REDIS_GROUP=mylaps-middleware-group                  # Grupo de consumidores
WEB_PORT=3001                                        # Puerto del simulador
SIMULATOR_SPEED=100                                  # Velocidad por defecto (ms)
DATA_FOLDER=../data                                  # Carpeta con archivos
```

## Uso

1. Inicia el simulador:
```bash
npm start
```

2. Abre tu navegador en:
```
http://localhost:3001
```

3. Desde la interfaz web:
   - **Selecciona un archivo** de datos (.txt) de la lista
   - **Ajusta la velocidad** de simulación (milisegundos entre mensajes)
   - **Inicia la simulación** con el botón ▶️ Start
   - **Monitorea el progreso** en tiempo real con la barra de progreso
   - **Detén** cuando sea necesario con ⏹️ Stop
   - **Resetea Redis** para limpiar todos los datos con 🧹 Reset Redis

## Archivos de Datos Disponibles

El simulador detecta automáticamente los archivos `.txt` en la carpeta `../data`:

- `data.txt` - Archivo principal de datos
- `data_with_timestamps.txt` - Datos con timestamps
- `test_pedro_laps.txt` - Datos de prueba de Pedro
- `test_rmonitor_pedro.txt` - Datos RMonitor de Pedro
- Y otros archivos `.txt` disponibles

### Formato esperado:
- Una línea por mensaje de MyLaps
- Líneas que empiecen con `#` son ignoradas (comentarios)
- Líneas vacías son ignoradas

### Ejemplo:
```
# Archivo de prueba MyLaps
$A0104 MYLAPS Timing & Scoring Software
$A0109 MYLAPS MyLaps X2
$B01 21/05/24 15:03:31.789
$C01 Demo Race
$E01001 1 19.504 16:01:37.911 10 10 0
$E01002 2 19.721 16:01:57.632 10 20 0
```

## Funcionalidades de la Interfaz

### 📊 Status Bar
- **Simulator Status**: RUNNING/STOPPED
- **Redis Connection**: CONNECTED/DISCONNECTED
- **Current File**: Archivo seleccionado
- **Messages Sent**: Mensajes enviados
- **Total Messages**: Total de mensajes del archivo
- **Current Speed**: Velocidad actual en ms

### 📈 Progress Bar
- Barra visual del progreso de simulación
- Porcentaje completado
- Estado actual de la simulación

### 📂 File Selection
- Lista de archivos disponibles con información
- Número de líneas y tamaño del archivo
- Selección fácil con dropdown

### ⚙️ Simulation Settings
- Control de velocidad (1-10000 ms)
- Aplicación inmediata de cambios

### 🎮 Simulation Controls
- **Start**: Inicia simulación con archivo seleccionado
- **Stop**: Detiene simulación actual
- **Reset Redis**: Limpia completamente Redis

### 📝 Live Logs
- Log en tiempo real de todas las acciones
- Timestamps para cada evento
- Scroll automático

## API REST

El simulador expone una API REST completa:

### Endpoints disponibles:

- `GET /api/files` - Lista archivos disponibles
- `GET /api/status` - Estado actual del simulador
- `POST /api/start` - Inicia simulación
- `POST /api/stop` - Detiene simulación
- `POST /api/reset-redis` - Resetea Redis
- `POST /api/speed` - Actualiza velocidad

## Integración con el Sistema Principal

Este simulador está completamente integrado con el middleware principal:

### Flujo de datos:
```
Archivo .txt → Simulador → Redis (mylaps:stream) → Middleware → Frontend
```

### Compatibilidad:
- ✅ Usa el mismo stream de Redis (`mylaps:stream`)
- ✅ Misma configuración de conexión
- ✅ Formato de datos idéntico al Python Ingestor
- ✅ Compatible con todos los consumidores existentes

## Desarrollo

Para desarrollo con auto-restart:
```bash
npm run dev
```

## Troubleshooting

### Error de conexión a Redis
- ✅ La configuración ya está correcta para el servidor remoto
- ✅ Las credenciales están configuradas
- Si hay problemas, verifica la conectividad de red

### No se encuentran archivos
- Verifica que la carpeta `../data` exista
- Asegúrate de tener archivos `.txt` en la carpeta
- Usa el botón "🔄 Refresh Files" para recargar

### El simulador no envía datos
- Verifica que el archivo seleccionado tenga contenido válido
- Revisa los logs en la interfaz web
- Comprueba que Redis esté aceptando conexiones

### El middleware no recibe datos
- Asegúrate de que el middleware esté ejecutándose
- Verifica que ambos usen el mismo stream (`mylaps:stream`)
- Revisa los logs del middleware

## Scripts Disponibles

- `npm start` - Inicia el simulador
- `npm run dev` - Inicia con nodemon (auto-restart)

## Tecnologías Utilizadas

- **Node.js** - Servidor backend
- **Express** - Framework web
- **Socket.IO** - WebSockets para tiempo real
- **ioredis** - Cliente de Redis (compatible con middleware)
- **HTML5/CSS3/JS** - Interfaz web moderna
- **dotenv** - Gestión de configuración

## Licencia

MIT
