# API para control del simulador MyLaps

Esta API permite controlar el middleware MyLaps y el simulador de datos desde una interfaz HTTP externa.

## Instalación

Instala las dependencias necesarias:

```bash
npm install
```

## Iniciar la API

```bash
npm run api
```

Por defecto, el servidor se ejecutará en el puerto 3001. Puedes cambiar el puerto estableciendo la variable de entorno `API_PORT`.

## Endpoints disponibles

### Estado del middleware

```
GET /status
```

Devuelve el estado actual del middleware y el simulador.

### Inicializar el middleware

```
POST /init
```

Inicializa el middleware y prepara el entorno para la simulación.

### Iniciar el middleware

```
POST /start
```

Inicia el middleware y el simulador por defecto.

### Detener el middleware

```
POST /stop
```

Detiene el middleware y el simulador.

### Ejecutar simulación con archivo específico

```
POST /simulate
```

Cuerpo de la petición:
```json
{
  "dataFile": "data/data.txt",
  "speed": 10,
  "flushAll": true
}
```

- `dataFile`: Ruta al archivo de datos para la simulación
- `speed` (opcional): Velocidad de simulación en milisegundos
- `flushAll` (opcional): Por defecto es `true`. Si es `true`, elimina todas las claves de Redis antes de iniciar la simulación. Puedes establecerlo a `false` si no quieres borrar los datos existentes

### Listar archivos de datos disponibles

```
GET /data-files
```

Devuelve la lista de archivos de datos disponibles para simulación.

## Ejemplos de uso con curl

Inicializar el middleware:
```bash
curl -X POST http://localhost:3001/init
```

Iniciar el middleware:
```bash
curl -X POST http://localhost:3001/start
```

Ejecutar una simulación con un archivo específico:
```bash
curl -X POST http://localhost:3001/simulate \
  -H "Content-Type: application/json" \
  -d '{"dataFile": "data/data.txt", "speed": 10, "flushAll": true}'
```

Detener el middleware:
```bash
curl -X POST http://localhost:3001/stop
```

Verificar el estado:
```bash
curl http://localhost:3001/status
```

Listar archivos de datos disponibles:
```bash
curl http://localhost:3001/data-files
```
