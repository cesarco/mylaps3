#!/usr/bin/env node

/**
 * Script para limpiar mensajes pendientes en Redis Stream
 * Hace ACK de todos los mensajes pendientes para evitar reprocesamiento
 */

const Redis = require('ioredis');
const config = require('./src/config');

async function cleanPendingMessages() {
  const redis = new Redis(config.redis);
  
  try {
    console.log('🧹 Limpiando mensajes pendientes...');
    
    // Obtener mensajes pendientes
    const pending = await redis.xpending(
      config.redis.stream, 
      config.redis.group, 
      '-', '+', 
      1000 // Obtener hasta 1000 mensajes pendientes
    );
    
    if (!pending || pending.length === 0) {
      console.log('✅ No hay mensajes pendientes');
      return;
    }
    
    console.log(`📊 Encontrados ${pending.length} mensajes pendientes`);
    
    // Hacer ACK de cada mensaje pendiente
    let ackedCount = 0;
    for (const pendingMsg of pending) {
      const messageId = pendingMsg[0];
      try {
        await redis.xack(config.redis.stream, config.redis.group, messageId);
        ackedCount++;
        
        if (ackedCount % 10 === 0) {
          console.log(`✅ ACK procesados: ${ackedCount}/${pending.length}`);
        }
      } catch (error) {
        console.error(`❌ Error haciendo ACK de ${messageId}:`, error.message);
      }
    }
    
    console.log(`✅ Limpieza completada: ${ackedCount} mensajes confirmados`);
    
    // Verificar que no quedan mensajes pendientes
    const remainingPending = await redis.xpending(config.redis.stream, config.redis.group);
    console.log(`📊 Mensajes pendientes restantes: ${remainingPending[0]}`);
    
  } catch (error) {
    console.error('❌ Error durante la limpieza:', error);
  } finally {
    await redis.disconnect();
    console.log('🔌 Desconectado de Redis');
  }
}

// Ejecutar si es llamado directamente
if (require.main === module) {
  cleanPendingMessages()
    .then(() => {
      console.log('🎉 Script de limpieza completado');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Script de limpieza falló:', error);
      process.exit(1);
    });
}

module.exports = { cleanPendingMessages };
