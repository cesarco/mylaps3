/**
 * Herramienta para diagnosticar problemas de notificaciones NodeCG
 * Este script envía manualmente notificaciones a través de Redis para verificar
 * que los clientes NodeCG puedan recibirlas correctamente.
 */

const Redis = require('ioredis');

// Configuración de Redis (debe coincidir con la configuración del middleware y del bundle NodeCG)
const redisConfig = {
  host: '66.42.90.210',  // Usar el mismo host que el middleware
  port: 11060,           // Usar el mismo puerto que el middleware
  password: '6Uql23p4wPfYt0rvqPRMrP3S5ZaGbswPv0nDVjINv0VyWG2tDLrN47GpAo8zAaDd', // Usar la misma contraseña
  retryStrategy: (times) => Math.min(times * 50, 2000) // Estrategia de reconexión
};

async function testNodeCGNotifications() {
  try {
    // Crear cliente Redis
    const redis = new Redis(redisConfig);
    console.log('✅ Conectado a Redis');
    
    // Lista de canales a probar
    const channels = [
      'nodecg:update',
      'nodecg:update:leaderboard',
      'nodecg:update:driver',
      'nodecg:update:bestlap'
    ];
    
    console.log('🔍 Comenzando prueba de notificaciones NodeCG...');
    
    // Enviar un mensaje a cada canal con 2 segundos de intervalo
    for (const channel of channels) {
      console.log(`📢 Enviando notificación a ${channel}...`);
      
      // Mensaje de prueba con timestamp para facilitar la verificación
      const message = JSON.stringify({
        action: 'test',
        timestamp: new Date().toISOString(),
        message: 'Esta es una notificación de prueba'
      });
      
      await redis.publish(channel, message);
      console.log(`✅ Mensaje enviado a ${channel}`);
      
      // Esperar 2 segundos entre mensajes
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    console.log('\n✅ Prueba completada');
    console.log('ℹ️  Si los suscriptores de NodeCG están configurados correctamente,');
    console.log('   deberían haber recibido notificaciones en al menos uno de estos canales.');
    
    // Cerrar la conexión
    await redis.quit();
    console.log('✅ Conexión a Redis cerrada');
    
  } catch (error) {
    console.error('❌ Error durante la prueba:', error);
  }
}

// Ejecutar la prueba
testNodeCGNotifications();

/**
 * INSTRUCCIONES PARA EL DESARROLLADOR DE NODECG:
 * 
 * 1. Asegúrese de que su bundle de NodeCG esté ejecutándose y conectado a Redis
 * 2. Ejecute este script: node tools/test_nodecg_notifications.js
 * 3. Verifique si su bundle de NodeCG recibe las notificaciones
 * 4. Si no recibe notificaciones, verifique que esté suscrito a los canales correctos
 * 
 * Ejemplo de código de suscripción para NodeCG:
 * 
 * // Método recomendado - suscribirse a canales específicos
 * await subscriber.subscribe('nodecg:update:leaderboard', (message) => {
 *   console.log('🔔 Leaderboard updated:', message);
 *   // Actualizar replicant o UI
 * });
 * 
 * // Método alternativo - suscribirse al canal general
 * await subscriber.subscribe('nodecg:update', (message) => {
 *   console.log('🔔 General update:', message);
 *   // Actualizar todos los datos
 * });
 */
