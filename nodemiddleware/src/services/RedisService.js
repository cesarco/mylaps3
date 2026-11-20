const Redis = require('ioredis');
const config = require('../config');

/**
 * Servicio básico para conexión y operaciones fundamentales en Redis
 * Esta versión elimina la lógica antigua de procesamiento de datos
 * y solo mantiene la funcionalidad básica de conexión
 */
class RedisService {
  constructor() {
    this.client = null;
    this.isConnected = false;
  }

  /**
   * Conectar a Redis
   */
  async connect() {
    try {
      // Conectar cliente Redis normal
      const originalClient = new Redis(config.redis);
      
      // Crear un proxy para el cliente Redis que enviará notificaciones automáticas
      this.client = this.createAutoNotifyProxy(originalClient);
      
      // La conexión se establece automáticamente al instanciar el cliente
      this.isConnected = true;
      console.log('✅ Connected to Redis');
      console.log(`ℹ️ NodeCG notification system active (threshold: ${config.nodecg.notifications.operationsThreshold} operations, interval: ${config.nodecg.notifications.minInterval}ms)`);
      
      // Enviar una notificación inicial para confirmar que todo está funcionando
      await this.forceNotification();
      
      return true;
    } catch (error) {
      console.error('❌ Failed to connect to Redis:', error.message);
      this.isConnected = false;
      return false;
    }
  }
  
  /**
   * Crear un proxy sobre el cliente Redis que envía notificaciones automáticamente después de cada operación de escritura
   * @param {Redis} originalClient - Cliente Redis original
   * @returns {Proxy} - Cliente Redis con notificaciones automáticas
   */
  createAutoNotifyProxy(originalClient) {
    const self = this;
    // Control de frecuencia de notificaciones usando valores de configuración
    let lastNotificationTime = 0;
    let operationsCounter = 0;
    const minNotificationInterval = config.nodecg.notifications.minInterval;
    const operationsThreshold = config.nodecg.notifications.operationsThreshold;
    
    const writeMethods = [
      'set', 'hset', 'hmset', 'hsetnx', 'setnx', 'setex', 'psetex',
      'incr', 'incrby', 'incrbyfloat', 'decr', 'decrby',
      'lpush', 'lpushx', 'rpush', 'rpushx', 'linsert',
      'sadd', 'zadd', 'hincrby', 'hincrbyfloat',
      'publish', 'xadd', 'del'
    ];
    
    // Función auxiliar para enviar notificación si corresponde
    const sendNotificationIfNeeded = async () => {
      const now = Date.now();
      operationsCounter++;
      
      // Enviar notificación si pasó suficiente tiempo y hay suficientes operaciones
      if (operationsCounter >= operationsThreshold && 
          now - lastNotificationTime >= minNotificationInterval) {
        try {
          // Obtener canales de notificación desde configuración
          const channels = config.nodecg.notifications.channels;
          
          // Enviar notificaciones a todos los canales configurados
          await originalClient.publish(channels.general, 'reload');
          await originalClient.publish(channels.leaderboard, 'reload');
          await originalClient.publish(channels.driver, 'reload');
          await originalClient.publish(channels.bestlap, 'reload');
          
          console.log(`🔔 Auto-notification sent to NodeCG (${operationsCounter} operations, threshold: ${operationsThreshold})`);
          lastNotificationTime = now;
          operationsCounter = 0;
        } catch (error) {
          console.error('❌ Failed to publish auto-notification:', error.message);
        }
      }
    };
    
    // Crear un proxy para interceptar las llamadas a métodos
    return new Proxy(originalClient, {
      get(target, prop) {
        // Obtener el método original
        const originalMethod = target[prop];
        
        // Si no es una función o no es un método de escritura, devolver tal cual
        if (typeof originalMethod !== 'function' || !writeMethods.includes(prop)) {
          return originalMethod;
        }
        
        // Crear un wrapper para el método
        return async function(...args) {
          try {
            // Llamar al método original
            const result = await originalMethod.apply(target, args);
            
            // Solo enviar notificación si no es una llamada al propio método publish a canales de NodeCG
            // Esto evita bucles infinitos de notificaciones
            const nodecgChannels = Object.values(config.nodecg.notifications.channels);
            if (prop !== 'publish' || 
                !(nodecgChannels.includes(args[0]))) {
              
              // Cada operación de escritura incrementa el contador y verifica si corresponde notificar
              await sendNotificationIfNeeded();
              
              // Los métodos críticos (que modifican el estado del leaderboard) 
              // fuerzan una notificación inmediata independientemente del umbral
              const criticalMethods = ['hset', 'zadd', 'set'];
              const criticalKeywords = ['leaderboard', 'pos', 'state', 'driver'];
              
              // Verificar si es un método crítico y si involucra claves críticas
              if (criticalMethods.includes(prop) && 
                  args.length > 0 && 
                  typeof args[0] === 'string' &&
                  criticalKeywords.some(keyword => args[0].includes(keyword))) {
                
                // Solo para las operaciones más críticas, como actualizar posiciones o estados de driver
                await self.forceNotification();
              }
            }
            
            return result;
          } catch (error) {
            console.error(`❌ Error en operación Redis ${prop}:`, error);
            throw error;
          }
        };
      }
    });
  }

  /**
   * Desconectar de Redis
   */
  async disconnect() {
    if (this.client && this.isConnected) {
      await this.client.disconnect();
      this.isConnected = false;
      console.log('✅ Redis connection closed');
    }
  }

  /**
   * Configurar grupo de consumidores para stream principal
   */
  async setupConsumerGroup() {
    try {
      // Intentar varias veces para garantizar que el grupo se configure correctamente
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          // Verificar si el stream existe, si no, crearlo con un mensaje dummy
          const streamExists = await this.client.exists(config.redis.stream);
          if (!streamExists) {
            console.log(`ℹ️  Stream '${config.redis.stream}' does not exist. Creating it... (attempt ${attempt})}`);
            await this.client.xadd(config.redis.stream, '*', 'init', 'true');
            console.log(`✅ Stream '${config.redis.stream}' created with initialization message`);
          }
          
          // Ahora creamos el grupo de consumidores
          try {
            await this.client.xgroup('CREATE', config.redis.stream, config.redis.group, '0', 'MKSTREAM');
            console.log(`✅ Consumer group '${config.redis.group}' created successfully`);
            return true;
          } catch (groupError) {
            if (groupError.message.includes('BUSYGROUP')) {
              console.log(`ℹ️  Consumer group '${config.redis.group}' already exists`);
              return true;
            } else {
              throw groupError;
            }
          }
        } catch (attemptError) {
          if (attempt < 3) {
            console.log(`⚠️ Attempt ${attempt} failed, retrying in 200ms...`);
            await new Promise(resolve => setTimeout(resolve, 200));
          } else {
            throw attemptError;
          }
        }
      }
      
      return true;
    } catch (error) {
      console.error('❌ Failed to setup consumer group after multiple attempts:', error.message);
      throw error;
    }
  }

  /**
   * Leer del stream principal
   */
  async readFromStream() {
    try {
      const result = await this.client.xreadgroup(
        'GROUP', config.redis.group, config.redis.consumer,
        'COUNT', config.mylaps.streamReadCount,
        'BLOCK', config.mylaps.streamReadTimeout,
        'STREAMS', config.redis.stream, '>'
      );
      return result;
    } catch (error) {
      if (error.message.includes('timeout')) {
        return null; // Normal timeout, no messages
      }
      
      // Si el error es porque no existe el grupo o el stream, intentamos recrearlos
      if (error.message.includes('NOGROUP')) {
        console.log('⚠️ Stream or consumer group not found, attempting to recreate...');
        try {
          await this.setupConsumerGroup();
          console.log('✅ Consumer group recreated successfully');
          
          // Intentamos leer de nuevo después de recrear el grupo
          const retryResult = await this.client.xreadgroup(
            'GROUP', config.redis.group, config.redis.consumer,
            'COUNT', config.mylaps.streamReadCount,
            'BLOCK', config.mylaps.streamReadTimeout,
            'STREAMS', config.redis.stream, '>'
          );
          return retryResult;
        } catch (setupError) {
          console.error('❌ Failed to recreate consumer group:', setupError.message);
          return null;
        }
      }
      
      // Para otros errores, seguimos lanzando la excepción
      throw error;
    }
  }

  /**
   * Confirmar procesamiento de un mensaje del stream
   */
  async acknowledgeMessage(messageId) {
    await this.client.xack(config.redis.stream, config.redis.group, messageId);
  }

  /**
   * Obtener cliente Redis
   */
  getClient() {
    return this.client;
  }

  /**
   * Publicar notificación simple para NodeCG
   * Esta versión fuerza el envío inmediato sin importar el umbral de operaciones
   * @param {string} channel - Canal de publicación (ej: 'nodecg:update')
   * @param {string} message - Mensaje simple (ej: 'reload')
   */
  async publishNotification(channel, message = 'reload') {
    try {
      if (this.client && this.isConnected) {
        await this.client.publish(channel, message);
        console.log(`🔔 Published notification to ${channel}: ${message}`);
      }
    } catch (error) {
      console.error(`❌ Failed to publish to ${channel}:`, error.message);
    }
  }
  
  /**
   * Método de ayuda para notificar después de operaciones críticas
   * Este método debe llamarse después de cualquier operación que modifique
   * datos importantes que necesiten ser reflejados inmediatamente en NodeCG
   * @param {string} dataType - Tipo de dato actualizado (leaderboard, driver, etc.)
   * @param {boolean} forceAll - Si es true, notifica a todos los canales
   */
  async notifyAfterUpdate(dataType = 'leaderboard', forceAll = false) {
    try {
      const channels = config.nodecg.notifications.channels;
      
      // Enviar notificación general siempre
      await this.publishNotification(channels.general, 'reload');
      
      if (forceAll) {
        // Si se solicita, notificar a todos los canales
        await this.forceNotification();
      } else if (dataType && channels[dataType]) {
        // Si no, notificar solo al canal específico correspondiente al tipo de datos
        await this.publishNotification(channels[dataType], 'reload');
      }
      
      console.log(`✅ Notified NodeCG after ${dataType} update`);
    } catch (error) {
      console.error('❌ Failed to notify after update:', error.message);
    }
  }
  
  /**
   * Forzar el envío de una notificación inmediatamente en todos los canales relevantes
   */
  async forceNotification() {
    try {
      // Obtener todos los canales configurados
      const channels = config.nodecg.notifications.channels;
      
      // Publicar en todos los canales para garantizar que todos los clientes reciban la actualización
      for (const [type, channel] of Object.entries(channels)) {
        await this.publishNotification(channel, 'reload');
      }
      
      console.log('🔔 Force notification sent to all NodeCG channels');
    } catch (error) {
      console.error('❌ Failed to force notification:', error.message);
    }
  }
}

module.exports = RedisService;
