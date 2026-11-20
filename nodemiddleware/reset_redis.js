/**
 * reset_redis.js
 * Script para limpiar todas las claves de Redis y reiniciar el estado
 */

require('dotenv').config();
const Redis = require('ioredis');

// Configuración de Redis desde .env
const config = {
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD,
  lazyConnect: true
};

// Crear conexión a Redis
const redis = new Redis(config);

async function resetRedis() {
  try {
    console.log('🔄 Iniciando reset completo de Redis...');
    
    // Conectar a Redis
    await redis.connect();
    console.log('✅ Conectado a Redis');
    
    // Usar FLUSHDB para borrar todas las claves de la base de datos actual
    await redis.flushdb();
    
    console.log('✅ Reset completo: todas las claves fueron eliminadas.');
    
  } catch (error) {
    console.error('❌ Error durante el reset:', error);
  } finally {
    // Cerrar conexión
    await redis.quit();
    console.log('👋 Conexión a Redis cerrada');
  }
}

// Ejecutar reset
resetRedis();
