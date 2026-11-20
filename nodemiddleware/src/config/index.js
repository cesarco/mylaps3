require('dotenv').config();

/**
 * TODO: REFACTORING - NodeCG Notifications
 * Las notificaciones individuales de NodeCG en los servicios (notifyNodeCG) deben eliminarse,
 * ya que ahora implementamos un sistema centralizado de notificaciones en RedisService
 * que automáticamente publica eventos en los canales de NodeCG cuando hay cambios en Redis.
 * 
 * Archivos que contienen estos métodos y deben refactorizarse:
 * - src/services/NewLeaderboardService.js
 * - src/services/MessageProcessor.js
 * - src/services/LapService.js
 * - src/services/DriverService.js
 * 
 * TODO: LEADERBOARD POSITIONING LOGIC
 * IMPORTANTE: Las mejores vueltas ($H) NO deben afectar las posiciones del leaderboard.
 * Las posiciones solo deben determinarse por:
 * 1. Mensajes que traigan posición explícita
 * 2. Cálculo basado en tiempo total de carrera (totalracetime) y número de vueltas
 * 
 * Las mejores vueltas solo actualizan los datos de timing en el driver state.
 */

const config = {
  redis: {
    host: process.env.REDIS_HOST || '66.42.90.210',
    port: parseInt(process.env.REDIS_PORT) || 6379,
    password: process.env.REDIS_PASSWORD || 'Rd$2025!NodeCG#Secure@77X9P&Ultra*Strong',
    stream: process.env.REDIS_STREAM || 'mylaps:stream',
    group: process.env.REDIS_GROUP || 'mylaps-middleware-group',
    consumer: process.env.REDIS_CONSUMER || 'middleware-consumer',
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: true
  },
  
  mysql: {
    enabled: process.env.MYSQL_ENABLED === 'true', // Debe ser explícitamente 'true' para habilitar
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'mylaps_user',
    password: process.env.DB_PASS || 'mylaps_pass',
    database: process.env.DB_NAME || 'mylaps_data',
    connectionLimit: 10
  },
  
  server: {
    port: parseInt(process.env.PORT) || 6000
  },
  
  // Configuración de notificaciones NodeCG
  nodecg: {
    // Configuración de notificaciones automáticas
    notifications: {
      // Intervalo mínimo entre notificaciones (en ms)
      minInterval: parseInt(process.env.NODECG_MIN_INTERVAL) || 250,
      
      // Número mínimo de operaciones antes de enviar notificación
      operationsThreshold: parseInt(process.env.NODECG_OPS_THRESHOLD) || 3,
      
      // Canales de notificación
      channels: {
        general: 'nodecg:update',
        leaderboard: 'nodecg:update:leaderboard',
        driver: 'nodecg:update:driver',
        bestlap: 'nodecg:update:bestlap',
        passing: 'nodecg:update:passing',
        flag: 'nodecg:update:flag'
      }
    }
  },
  
  mylaps: {
    // Configuración según especificación Redis_RMonitor_Middleware.md
    defaultSessionKey: process.env.SESSION_KEY || 'default',
    
    // Estructura de keys según especificación Redis_RMonitor_Middleware.md
    keyPatterns: {
      // LEADERBOARD DENTRO DE LA SESIÓN
      leaderboardDriver: '{S}:leaderboard:{pos}', // Dentro de la sesión
      leaderboardRanking: '{S}:leaderboard:ranking', // ZSET para ordenamiento
      
      // KEYS PRINCIPALES - SISTEMA ORIGINAL
      driverCatalog: '{S}:driver:{rid}:catalog',
      driverState: '{S}:driver:{rid}:state',
      classInfo: '{S}:class:{cid}',
      runInfo: '{S}:run',
      eventInfo: '{S}:event',
      globalState: '{S}:state',
      posStandings: '{S}:pos',
      bestStandings: '{S}:best',
      classPos: '{S}:class:{cid}:pos',
      classBest: '{S}:class:{cid}:best',
      passStream: '{S}:x:pass',
      correctionStream: '{S}:x:cor',
      lineStream: '{S}:x:line',
      ridMapping: '{S}:rid'
    },
    
    // Configuraciones de streams y timeouts
    streamReadTimeout: 10, // Reducido para respuesta más rápida
    streamReadCount: 50   // Reducido para procesar más frecuentemente
  }
};

module.exports = config;
