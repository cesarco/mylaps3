# Guía de Integración NodeCG - 2023

## Introducción

Este documento proporciona instrucciones actualizadas para la integración correcta del middleware MYLAPS con bundles de NodeCG. Se enfoca específicamente en la configuración adecuada del sistema de notificaciones para mantener los datos sincronizados en tiempo real.

## Canales de Notificación

El middleware MYLAPS utiliza Redis Pub/Sub para enviar notificaciones cuando los datos cambian. Hay dos enfoques para suscribirse a estas notificaciones:

### Opción 1: Canal General (Recomendado para integración simple)

```javascript
// Suscribirse al canal general de actualizaciones
await subscriber.subscribe('nodecg:update', (message) => {
  console.log('🔔 Datos actualizados en Redis:', message);
  // Actualizar todos los datos (leaderboard, información de carrera, etc.)
  actualizarTodosLosDatos();
});
```

### Opción 2: Canales Específicos (Recomendado para rendimiento optimizado)

```javascript
// Suscribirse a canales específicos para cada tipo de dato
await subscriber.subscribe('nodecg:update:leaderboard', (message) => {
  console.log('🔔 Leaderboard actualizado:', message);
  actualizarLeaderboard();
});

await subscriber.subscribe('nodecg:update:driver', (message) => {
  console.log('🔔 Driver actualizado:', message);
  actualizarInfoDriver();
});

await subscriber.subscribe('nodecg:update:bestlap', (message) => {
  console.log('🔔 Mejor vuelta actualizada:', message);
  actualizarMejoresVueltas();
});
```

## Lista Completa de Canales

| Canal | Descripción | Uso |
|-------|-------------|-----|
| `nodecg:update` | Canal general | Actualización de cualquier tipo de dato |
| `nodecg:update:leaderboard` | Leaderboard específico | Actualización de posiciones |
| `nodecg:update:driver` | Driver específico | Actualización de información de piloto |
| `nodecg:update:bestlap` | Mejor vuelta | Nueva mejor vuelta registrada |
| `nodecg:update:passing` | Paso por meta | Nuevo passing registrado |
| `nodecg:update:flag` | Estado de bandera | Cambio en estado de bandera |

## Estructura de Datos

### Leaderboard

Para obtener el leaderboard completo:

```javascript
const redis = require('redis');
const client = redis.createClient(redisConfig);

async function getLeaderboard() {
  // Obtener posiciones desde el conjunto ordenado
  const positions = await client.zrange('default:leaderboard:ranking', 0, -1, 'WITHSCORES');
  
  const leaderboard = [];
  for (let i = 0; i < positions.length; i += 2) {
    const driverId = positions[i];
    const position = parseInt(positions[i + 1]);
    
    // Obtener datos completos del driver por posición
    const driverKey = `default:leaderboard:${position}`;
    const driverData = await client.hgetall(driverKey);
    
    if (driverData && Object.keys(driverData).length > 0) {
      // Convertir campos numéricos
      leaderboard.push({
        ...driverData,
        position: parseInt(position),
        laps: parseInt(driverData.laps) || 0,
        best_ms: parseInt(driverData.best_ms) || 0,
        best_lap: parseInt(driverData.best_lap) || 0,
        total_ms: parseInt(driverData.total_ms) || 0
      });
    }
  }
  
  return leaderboard;
}
```

### Driver Individual

```javascript
async function getDriver(position) {
  const driverKey = `default:leaderboard:${position}`;
  const driverData = await client.hgetall(driverKey);
  
  if (Object.keys(driverData).length === 0) {
    return null;
  }
  
  return {
    ...driverData,
    position: parseInt(position),
    laps: parseInt(driverData.laps) || 0,
    best_ms: parseInt(driverData.best_ms) || 0,
    best_lap: parseInt(driverData.best_lap) || 0,
    total_ms: parseInt(driverData.total_ms) || 0
  };
}
```

## Ejemplo Completo de Integración

```javascript
const redis = require('redis');
const nodecgAPIContext = require('./util/nodecg-api-context');

module.exports = async function(nodecg) {
  const nodecg = nodecgAPIContext.get();
  
  // Crear replicants
  const leaderboardRep = nodecg.Replicant('leaderboard', { defaultValue: [] });
  const raceStateRep = nodecg.Replicant('raceState', { defaultValue: {} });
  
  // Configuración Redis
  const redisConfig = {
    host: nodecg.bundleConfig.redis.host || '66.42.90.210',
    port: nodecg.bundleConfig.redis.port || 11060,
    password: nodecg.bundleConfig.redis.password
  };
  
  // Crear clientes Redis
  const redisClient = redis.createClient(redisConfig);
  const redisSubscriber = redis.createClient(redisConfig);
  
  await redisClient.connect();
  await redisSubscriber.connect();
  nodecg.log.info('✅ Conectado a Redis');
  
  // Función para obtener leaderboard desde Redis
  async function updateLeaderboard() {
    try {
      const positions = await redisClient.zrange('default:leaderboard:ranking', 0, -1, 'WITHSCORES');
      
      const leaderboard = [];
      for (let i = 0; i < positions.length; i += 2) {
        const driverId = positions[i];
        const position = parseInt(positions[i + 1]);
        
        const driverKey = `default:leaderboard:${position}`;
        const driverData = await redisClient.hgetall(driverKey);
        
        if (driverData && Object.keys(driverData).length > 0) {
          leaderboard.push({
            ...driverData,
            position: parseInt(position),
            laps: parseInt(driverData.laps) || 0,
            best_ms: parseInt(driverData.best_ms) || 0,
            best_lap: parseInt(driverData.best_lap) || 0,
            total_ms: parseInt(driverData.total_ms) || 0
          });
        }
      }
      
      leaderboardRep.value = leaderboard;
      nodecg.log.info('✅ Leaderboard actualizado con ' + leaderboard.length + ' drivers');
      
    } catch (error) {
      nodecg.log.error('❌ Error al actualizar leaderboard:', error);
    }
  }
  
  // Actualización inicial
  updateLeaderboard();
  
  // Actualización periódica como fallback (cada 5 segundos)
  setInterval(updateLeaderboard, 5000);
  
  // Suscribirse a notificaciones (canal general y específico)
  redisSubscriber.subscribe('nodecg:update', () => {
    nodecg.log.info('🔔 Recibida notificación general');
    updateLeaderboard();
  });
  
  redisSubscriber.subscribe('nodecg:update:leaderboard', () => {
    nodecg.log.info('🔔 Recibida notificación de leaderboard');
    updateLeaderboard();
  });
  
  // Cleanup
  nodecg.on('exit', async () => {
    await redisClient.quit();
    await redisSubscriber.quit();
    nodecg.log.info('✅ Conexiones a Redis cerradas');
  });
};
```

## Solución de Problemas

Si no está recibiendo notificaciones:

1. Verifique que está conectado al servidor Redis correcto (host, puerto, contraseña)
2. Pruebe con el script de diagnóstico `test_nodecg_notifications.js` incluido en el middleware
3. Asegúrese de estar suscrito a ambos canales (`nodecg:update` y `nodecg:update:leaderboard`)
4. Implemente la actualización periódica como respaldo

Si tiene otras preguntas o problemas, contacte al equipo de desarrollo del middleware.

---

## Cambios Recientes (2023)

- **2023-10-15**: Sistema de notificación mejorado que envía a canales múltiples para mayor compatibilidad
- **2023-10-01**: Nueva estructura de leaderboard con datos unificados por posición
- **2023-09-15**: Añadido canal específico para cada tipo de dato

---

## Contacto

Para soporte técnico o consultas:
- Email: support@ejemplo.com
- Discord: #mylaps-middleware-support
