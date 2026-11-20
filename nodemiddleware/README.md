# MYLAPS Middleware - Modular Architecture

## 📁 Estructura del Proyecto

```
mylaps-middleware/
├── app.js                  # Punto de entrada principal (modular)
├── index.js               # Versión monolítica (legacy)
├── package.json           # Dependencias y scripts
├── ecosystem.config.js    # Configuración PM2
├── .env                   # Variables de entorno
├── src/                   # Código fuente modular
│   ├── config/
│   │   └── index.js       # Configuración centralizada
│   ├── services/
│   │   ├── RedisService.js    # Servicio Redis
│   │   └── MySQLService.js    # Servicio MySQL
│   ├── processors/
│   │   ├── PositionProcessor.js     # Procesador de posiciones
│   │   ├── LapProcessor.js          # Procesador de vueltas
│   │   └── LeaderboardProcessor.js  # Procesador de leaderboard
│   ├── models/
│   │   └── Driver.js      # Modelo de datos del piloto
│   ├── utils/
│   │   ├── TimeUtils.js   # Utilidades de tiempo
│   │   └── Logger.js      # Sistema de logging
│   └── MylapsMiddleware.js # Clase principal del middleware
└── logs/                  # Archivos de log
```

## 🚀 Características de la Arquitectura Modular

### ✅ Ventajas sobre la versión monolítica:

1. **Separación de responsabilidades**: Cada módulo tiene una función específica
2. **Facilidad de mantenimiento**: Cambios aislados por módulo
3. **Testabilidad**: Cada componente se puede probar independientemente
4. **Escalabilidad**: Fácil agregar nuevos procesadores o servicios
5. **Reutilización**: Módulos pueden ser reutilizados en otros proyectos
6. **Logging estructurado**: Sistema de logging consistente

### 🏗️ Componentes Principales:

#### Services (Servicios)
- **RedisService**: Gestión de conexiones y operaciones Redis
- **MySQLService**: Gestión de conexiones y operaciones MySQL

#### Processors (Procesadores)
- **PositionProcessor**: Procesa datos de posición de pilotos
- **LapProcessor**: Procesa datos de vueltas
- **LeaderboardProcessor**: Genera y mantiene el leaderboard

#### Models (Modelos)
- **Driver**: Modelo de datos unificado para pilotos

#### Utils (Utilidades)
- **TimeUtils**: Funciones para manejo de tiempos
- **Logger**: Sistema de logging centralizado

## 🔧 Uso

### Iniciar middleware modular:
```bash
pm2 start ecosystem.config.js --only mylaps-middleware
```

### Iniciar versión legacy (respaldo):
```bash
pm2 start ecosystem.config.js --only mylaps-middleware-legacy
```

### Scripts disponibles:
```bash
npm start          # Inicia versión modular
npm run start:legacy  # Inicia versión monolítica
npm run dev        # Desarrollo con versión modular
npm run dev:legacy # Desarrollo con versión monolítica
```

## 📊 Arquitectura Redis-First

El middleware está diseñado para ser **Redis-first**:

- ✅ **Redis**: Datos en tiempo real, alta velocidad
- ✅ **MySQL**: Datos históricos, redundancia
- ✅ **Sin memoria local**: Resistente a caídas
- ✅ **Stream processing**: Procesamiento en tiempo real

## 🔄 Flujo de Datos

```
UDP Data → Python Handler → Redis Stream → Node Middleware → Redis + MySQL
                                              ↓
                                         Leaderboard
                                         (Redis-based)
```

## 🛠️ Configuración

Todas las configuraciones están centralizadas en `src/config/index.js` y utilizan variables de entorno del archivo `.env`.

## 📝 Logs

El sistema de logging proporciona diferentes niveles:
- ℹ️ Info
- ✅ Success  
- ⚠️ Warning
- ❌ Error
- 🐛 Debug
- 🌊 Stream
- 📍 Position
- 🏁 Lap
- 🏆 Leaderboard
- 🚀 Startup
- 🔄 Shutdown

## 🔄 Migración

La versión monolítica (`index.js`) se mantiene como respaldo durante la transición. Una vez validada la versión modular, se puede remover.

## 🚀 Próximos Pasos

1. Validar funcionamiento de la versión modular
2. Migrar configuración PM2 a versión modular
3. Agregar tests unitarios por módulo
4. Implementar métricas y monitoring
5. Considerar microservicios para mayor escalabilidad

## 📊 Tipos de mensajes soportados

### LAP_DATA
```json
{
  "type": "LAP_DATA",
  "transponder": "133",
  "lap_number": 8,
  "lap_time": "00:01:27.595",
  "position": 1
}
```

### POSITION_DATA
```json
{
  "type": "POSITION_DATA",
  "transponder": "133",
  "lap_number": 15,
  "race_time": "00:23:22.808",
  "position": 3
}
```

## 🗃️ Tablas MySQL

El middleware inserta datos en estas tablas:

- `lap_times`: Tiempos de vuelta
- `driver_positions`: Posiciones de pilotos
- `drivers`: Información de pilotos (auto-creados por transponder)
- `sessions`: Sesiones de carrera (auto-creadas)

## 🔄 Funcionamiento

1. Se conecta al Redis Stream como consumidor de grupo
2. Lee mensajes del stream de forma continua
3. Procesa cada mensaje según su tipo
4. Hace lookup del `driver_id` y `session_id`
5. Inserta los datos en la tabla correspondiente
6. Confirma el mensaje con `XACK`

## 🛠️ Manejo de errores

- Reconexión automática a Redis y MySQL
- Logging detallado de errores
- Graceful shutdown con señales SIGINT/SIGTERM
