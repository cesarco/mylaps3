/**
 * MessageProcessor.js (SIMPLIFICADO + ATOMIZERS)
 * ARQUITECTURA HÍBRIDA: DirectFlow Parser → Service + Parallel Atomizers
 * Esta versión mantiene el procesamiento directo y agrega atomizers en paralelo
 */
const Logger = require('../utils/Logger');
const DebugLogger = require('../utils/DebugLogger');
const ServiceRegistry = require('../utils/ServiceRegistry');
const AtomizerRegistry = require('../atomizers/AtomizerRegistry');
const ParserRegistry = require('../utils/ParserRegistry');

class MessageProcessor {
  constructor(redisClient, logger = console, sessionKey = 'default', serviceRegistry = null) {
    this.redis = redisClient;
    this.logger = logger;
    this.sessionKey = sessionKey;
    
    // Inicializar DebugLogger para capturar warnings y undefined fields
    this.debugLogger = new DebugLogger('logs');
    
    if (!redisClient) {
      throw new Error('MessageProcessor requires a valid Redis client');
    }
    
    // Usar el ServiceRegistry proporcionado o crear uno nuevo si no se proporciona
    this.serviceRegistry = serviceRegistry || new ServiceRegistry(redisClient, logger, sessionKey, this.debugLogger);
    
    // Si se proporcionó un serviceRegistry, agregamos el debugLogger
    if (serviceRegistry && !serviceRegistry.debugLogger) {
      serviceRegistry.debugLogger = this.debugLogger;
    }
    
    // Verificar que serviceRegistry sea válido
    if (!this.serviceRegistry) {
      throw new Error('Failed to initialize ServiceRegistry');
    }
    
    // Inicializar ParserRegistry (NUEVA ARQUITECTURA)
    this.parserRegistry = new ParserRegistry(this.serviceRegistry, logger);
    
    // Inicializar AtomizerRegistry (sistema paralelo) con DebugLogger
    try {
      this.atomizerRegistry = new AtomizerRegistry(this.serviceRegistry, logger, this.debugLogger);
      this.atomizersEnabled = true;
    } catch (error) {
      this.logger.error('Failed to initialize AtomizerRegistry:', error);
      this.atomizersEnabled = false;
    }
    
    this.logger.info(`🚀 MessageProcessor V4+ initialized for session '${this.sessionKey}' - HYBRID ARCHITECTURE`);
    this.logger.info(`ℹ️  Using ${serviceRegistry ? 'provided' : 'new'} ServiceRegistry instance`);
    this.logger.info(`⚛️  Atomizers: ${this.atomizersEnabled ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * MÉTODO SIMPLIFICADO - AHORA SOLO PARA COMPATIBILIDAD CON TESTS
   * El procesamiento real se hace en MylapsMiddleware con las dos funciones separadas:
   * - processWithIndependentParsers()
   * - processWithAtomizers()
   * 
   * @param {string} messageId - ID del mensaje
   * @param {Array|string} messageData - Datos del mensaje (raw o fields)
   */
  async processMessage(messageId, messageData) {
    this.logger.warning(`⚠️ [DEPRECATED] MessageProcessor.processMessage() is deprecated. Use MylapsMiddleware dual functions instead.`);
    
    try {
      // Extraer datos RAW para compatibilidad con tests
      let rawData;
      
      if (typeof messageData === 'string') {
        rawData = messageData;
      } else if (Array.isArray(messageData)) {
        const streamData = {};
        for (let i = 0; i < messageData.length; i += 2) {
          streamData[messageData[i]] = messageData[i + 1];
        }
        rawData = streamData.raw_data || streamData.data || messageData[1];
      } else {
        rawData = messageData.raw_data || messageData.data;
      }
      
      if (!rawData || typeof rawData !== 'string') {
        this.logger.warning(`🚫 No valid RAW data found in message ${messageId}`);
        return false;
      }

      // Usar solo parsers independientes para compatibilidad
      const result = await this.parserRegistry.parseMessage(rawData);
      return !!result;

    } catch (error) {
      this.logger.error(`❌ Error processing message ${messageId}:`, error);
      return false;
    }
  }

  /**
   * MÉTODOS ELIMINADOS - MIGRADOS A MylapsMiddleware:
   * - processLegacyPath() → processWithIndependentParsers()
   * - processAtomizersPath() → processWithAtomizers()
   * 
   * Esta nueva arquitectura permite mayor control y separación de responsabilidades.
   */

  /**
   * Identifica el tipo de mensaje basado en el contenido raw
   * @param {string} rawData - Datos raw
   * @returns {string|null} - Tipo de mensaje o null
   * @deprecated Use ParserRegistry.extractMessageType() instead
   */
  identifyMessageType(rawData) {
    return this.parserRegistry.extractMessageType(rawData);
  }

  /**
   * Limpia las comillas de un string
   * @param {string} str - String con comillas
   * @returns {string} - String sin comillas
   */
  /**
   * Limpia comillas de un string de manera robusta
   * @param {string|number} str - String a limpiar
   * @returns {string} - String limpio
   */
  cleanQuotes(str) {
    if (str === null || str === undefined) {
      return '';
    }
    if (typeof str === 'string') {
      return str.replace(/^"(.*)"$/, '$1').replace(/"/g, '');
    }
    return String(str);
  }

  /**
   * Extrae un número de manera robusta (con o sin comillas)
   * @param {string|number} value - Valor a convertir
   * @returns {number} - Número parseado
   */
  parseNumber(value) {
    if (value === null || value === undefined || value === '') {
      return 0;
    }
    
    // Si ya es un número, lo devolvemos
    if (typeof value === 'number') {
      return value;
    }
    
    // Si es string, limpiamos comillas y parseamos
    const cleaned = this.cleanQuotes(value);
    const parsed = parseInt(cleaned) || 0;
    return parsed;
  }

  /**
   * Extrae un string de manera robusta (con o sin comillas)
   * @param {string|number} value - Valor a extraer
   * @returns {string} - String limpio
   */
  parseString(value) {
    if (value === null || value === undefined) {
      return '';
    }
    return this.cleanQuotes(value);
  }

  /**
   * Convierte tiempo en formato string a milisegundos
   * @param {string} timeStr - Tiempo en formato HH:MM:SS.mmm o similar
   * @returns {number} - Tiempo en milisegundos
   */
  parseTimeToMilliseconds(timeStr) {
    try {
      if (!timeStr || typeof timeStr !== 'string') return 0;
      
      // Si ya es un número, asumir que está en ms
      if (!isNaN(timeStr)) {
        return parseInt(timeStr);
      }
      
      // Parsear formato HH:MM:SS.mmm
      const parts = timeStr.split(':');
      if (parts.length === 3) {
        const hours = parseInt(parts[0]) || 0;
        const minutes = parseInt(parts[1]) || 0;
        const secondsParts = parts[2].split('.');
        const seconds = parseInt(secondsParts[0]) || 0;
        const milliseconds = parseInt(secondsParts[1]) || 0;
        
        return (hours * 3600 + minutes * 60 + seconds) * 1000 + milliseconds;
      }
      
      // Parsear formato MM:SS.mmm
      if (parts.length === 2) {
        const minutes = parseInt(parts[0]) || 0;
        const secondsParts = parts[1].split('.');
        const seconds = parseInt(secondsParts[0]) || 0;
        const milliseconds = parseInt(secondsParts[1]) || 0;
        
        return (minutes * 60 + seconds) * 1000 + milliseconds;
      }
      
      return 0;
      
    } catch (error) {
      this.logger.error(`❌ [MessageProcessor] Error parsing time ${timeStr}:`, error);
      return 0;
    }
  }

  /**
   * Parsea datos raw en formato simplificado para atomizers
   * @param {string} rawData - Datos raw
   * @param {string} messageType - Tipo de mensaje
   * @returns {Object} - Datos parseados
   */
  /**
   * ESTE MÉTODO FUE MIGRADO A PARSERS INDEPENDIENTES
   * Ahora cada parser especializado maneja su propio parsing y validación
   * Ver: /src/parsers/*.js y ParserRegistry.js
   */
  parseDataForAtomizers(rawData, messageType) {
    this.logger.warning(`⚠️ [DEPRECATED] parseDataForAtomizers called. Use ParserRegistry instead.`);
    return {
      messageType,
      rawData,
      timestamp: new Date().toISOString(),
      sessionKey: this.sessionKey,
      deprecated: true
    };
  }

  /**
   * Trigger actualización del leaderboard
   */
  async triggerLeaderboardUpdate() {
    try {
      if (this.updateLeaderboardCallback) {
        await this.updateLeaderboardCallback();
      }
    } catch (error) {
      this.logger.error('Error triggering leaderboard update:', error);
    }
  }

  /**
   * Notificar a NodeCG que debe recargar datos
   * @param {string} dataType - Tipo de dato actualizado (opcional)
   */
  async notifyNodeCG(dataType = 'general') {
    try {
      const channel = `nodecg:update:${dataType}`;
      await this.redis.publish(channel, 'reload');
      // Log de notificación eliminado
    } catch (error) {
      this.logger.error('Error notifying NodeCG:', error);
    }
  }

  /**
   * Obtiene un driver por registration
   * @param {string} registration - Registration del driver
   * @returns {Object|null} - Datos del driver o null
   */
  async getDriver(registration) {
    return await this.redis.hgetall(`drivers:${registration}`);
  }

  /**
   * Obtiene vueltas de un driver
   * @param {string} registration - Registration del driver
   * @returns {Array} - Lista de vueltas
   */
  async getDriverLaps(registration) {
    return await this.redis.lrange(`driver:${registration}:laps`, 0, -1);
  }

  /**
   * Obtiene el leaderboard actual
   * @param {number} limit - Límite de resultados
   * @returns {Array} - Leaderboard ordenado
   */
  async getLeaderboard(limit = 20) {
    return await this.redis.zrevrange('leaderboard:position', 0, limit - 1, 'WITHSCORES');
  }

  /**
   * Obtiene estadísticas del sistema (incluyendo atomizers)
   * @returns {Object} - Estadísticas
   */
  async getSystemStats() {
    const stats = {
      architecture: 'hybrid_legacy_atomizers',
      coordinator: 'removed', // Arquitectura V4 ya no usa coordinadores
      session: this.sessionKey,
      last_processing_time: new Date().toISOString(),
      atomizers: {
        enabled: this.atomizersEnabled,
        available: false
      }
    };

    // Añadir estadísticas de atomizers si están disponibles
    if (this.atomizersEnabled && this.atomizerRegistry) {
      stats.atomizers = {
        enabled: true,
        available: true,
        ...this.atomizerRegistry.getStats()
      };
    }

    return stats;
  }

  /**
   * Habilita o deshabilita el sistema de atomizers
   * @param {boolean} enabled - true para habilitar, false para deshabilitar
   */
  setAtomizersEnabled(enabled) {
    this.atomizersEnabled = enabled;
    if (this.atomizerRegistry) {
      this.atomizerRegistry.setEnabled(enabled);
    }
    this.logger.info(`⚛️ [MessageProcessor] Atomizers ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Obtiene estadísticas detalladas de atomizers
   * @returns {Object|null} - Estadísticas de atomizers o null si no están disponibles
   */
  getAtomizerStats() {
    if (!this.atomizersEnabled || !this.atomizerRegistry) {
      return null;
    }
    return this.atomizerRegistry.getStats();
  }
}

module.exports = MessageProcessor;
