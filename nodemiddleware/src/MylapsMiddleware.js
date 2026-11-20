/**
 * MylapsMiddleware.js
 * Middleware principal para procesar datos de MYLAPS
 * NUEVA ARQUITECTURA SIMPLIFICADA: Parser → Service (V4)
 */
const config = require('./config');
const RedisService = require('./services/RedisService');
const MySQLService = require('./services/MySQLService');

// Nueva arquitectura V4 simplificada: MessageProcessor directo
const MessageProcessor = require('./services/MessageProcessor');

// Utilidades
const Logger = require('./utils/Logger');
const ServiceRegistry = require('./utils/ServiceRegistry');

class MylapsMiddleware {
  constructor() {
    this.logger = new Logger('MIDDLEWARE');
    this.isRunning = false;
    
    // ID de evento por defecto
    this.eventId = 'default';
    
    // Última actualización del leaderboard
    this.lastLeaderboardUpdate = null;
  }

  /**
   * Inicializa todos los servicios y conexiones
   */
  async init() {
    try {
      this.logger.startup('Initializing MYLAPS Middleware...');

      // Inicializar servicios de datos
      await this.initializeDataServices();
      
      // Inicializar servicios de negocio
      await this.initializeBusinessServices();
      
      // Inicializar MessageProcessor y ServiceRegistry
      await this.initializeMessageProcessor();

      this.logger.startup('MYLAPS Middleware initialized successfully');
      return true;

    } catch (error) {
      this.logger.error('Failed to initialize MYLAPS Middleware', error);
      return false;
    }
  }

  /**
   * Inicializa servicios de datos (Redis, MySQL)
   */
  async initializeDataServices() {
    // Inicializar Redis
    this.redisService = new RedisService();
    const redisConnected = await this.redisService.connect();
    if (!redisConnected) {
      throw new Error('Failed to connect to Redis');
    }
    
    // Inicializar MySQL (opcional)
    this.mysqlService = new MySQLService();
    await this.mysqlService.connect();
    
    return true;
  }

  /**
   * Inicializa servicios de negocio
   * NUEVA ARQUITECTURA SIMPLIFICADA: Servicios se inicializan a través de ServiceRegistry
   */
  async initializeBusinessServices() {
    // Obtener cliente Redis
    const redisClient = this.redisService.getClient();
    
    // ARQUITECTURA SIMPLIFICADA: Ya no inicializamos EventStreamService ni StreamConsumerService
    // Los servicios se manejan directamente a través del ServiceRegistry
    
    this.logger.info('🔄 Arquitectura simplificada: Event streams eliminados');
    
    return true;
  }

  /**
   * Inicializa MessageProcessor y ServiceRegistry
   * NUEVA ARQUITECTURA: MessageProcessor con ServiceRegistry
   */
  async initializeMessageProcessor() {
    const redisClient = this.redisService.getClient();
    
    // Crear logger específico para MessageProcessor
    const mpLogger = new Logger('MESSAGE_PROCESSOR');
    
    // NUEVA ARQUITECTURA: ServiceRegistry y MessageProcessor simplificado
    // Primero inicializamos ServiceRegistry
    this.serviceRegistry = new ServiceRegistry(redisClient, mpLogger, this.eventId);
    
    // Luego inicializamos MessageProcessor pasándole el ServiceRegistry
    this.messageProcessor = new MessageProcessor(redisClient, mpLogger, this.eventId, this.serviceRegistry);
    
    this.logger.info('🔄 V4 ARQUITECTURA: Parser → Service inicializada (compartiendo ServiceRegistry)');
    
    return true;
  }

  /**
   * Inicia el middleware
   */
  async start() {
    if (this.isRunning) {
      this.logger.warning('Middleware is already running');
      return;
    }

    this.isRunning = true;
    this.logger.startup('Starting MYLAPS middleware...');
    this.logger.info(`Listening to stream: ${config.redis.stream}`);
    this.logger.info(`Consumer group: ${config.redis.group}`);
    this.logger.info(`Consumer name: ${config.redis.consumer}`);

    // Configurar grupo de consumidores de Redis
    this.logger.info('🔄 Configurando consumer group...');
    const consumerSetupResult = await this.redisService.setupConsumerGroup();
    
    // Verificar que el consumer group se ha configurado correctamente
    if (!consumerSetupResult) {
      this.logger.error('⚠️ Error al configurar el consumer group');
    }

    this.logger.info('🚀 Procesamiento de mensajes con arquitectura simplificada');

    // Bucle principal de procesamiento (legacy)
    while (this.isRunning) {
      try {
        await this.processStreamMessages();
      } catch (error) {
        this.logger.error('Error in main processing loop', error);
        // Esperar un poco antes de reintentar
        await this.sleep(1000);
      }
    }
  }

  /**
   * Procesa mensajes de los streams de Redis
   */
  async processStreamMessages() {
    try {
      const result = await this.redisService.readFromStream();
      
      if (!result || result.length === 0) {
        return; // No hay mensajes
      }

      for (const streamResult of result) {
        const [streamName, messages] = streamResult;
        
        for (const [messageId, fields] of messages) {
          try {
            await this.processMessage(messageId, fields);
          } catch (error) {
            this.logger.error(`Error processing message ${messageId}`, error);
            // Continuar con el ACK incluso si hay error para no reprocesar el mensaje
          } finally {
            // Siempre hacer ACK del mensaje, incluso si hubo error
            try {
              await this.redisService.acknowledgeMessage(messageId);
            } catch (ackError) {
              this.logger.error(`Error acknowledging message ${messageId}`, ackError);
            }
          }
        }
      }
    } catch (error) {
      this.logger.error('Error processing stream messages', error);
    }
  }

  /**
   * Procesa un mensaje específico con NUEVA ARQUITECTURA DUAL
   * @param {string} messageId - ID del mensaje
   * @param {Array} fields - Campos del mensaje en formato [key1, value1, key2, value2, ...]
   */
  async processMessage(messageId, fields) {
    // NUEVA ARQUITECTURA: Dos funciones separadas que corren en paralelo
    
    // Extraer datos RAW del mensaje
    const rawData = this.extractRawData(fields);
    
    if (!rawData || typeof rawData !== 'string') {
      this.logger.warning(`🚫 No valid RAW data found in message ${messageId}`);
      return;
    }

    try {
      // EJECUTAR LAS DOS FUNCIONES EN PARALELO
      const [independentParserResult, atomizerResult] = await Promise.allSettled([
        this.processWithIndependentParsers(messageId, rawData),
        this.processWithAtomizers(messageId, rawData)
      ]);

      // Log de resultados
      this.logger.debug(`✅ Dual processing complete: ${messageId} (IndependentParsers: ${independentParserResult.status}, Atomizers: ${atomizerResult.status})`);
      
    } catch (error) {
      this.logger.error(`❌ Error in dual processing ${messageId}:`, error);
    }
  }

  /**
   * FUNCIÓN 1: Procesa mensaje con parsers independientes (NUEVA ARQUITECTURA)
   * @param {string} messageId - ID del mensaje
   * @param {string} rawData - Datos raw del mensaje
   */
  async processWithIndependentParsers(messageId, rawData) {
    try {
      // Usar ParserRegistry para procesamiento especializado
      const result = await this.messageProcessor.parserRegistry.parseMessage(rawData);
      
      if (!result) {
        this.logger.debug(`🚫 [IndependentParsers] No parser available for message: ${rawData.substring(0, 50)}...`);
        return false;
      }

      this.logger.debug(`✅ [IndependentParsers] Processed ${result.messageType} successfully`);
      return true;

    } catch (error) {
      this.logger.error(`❌ [IndependentParsers] Error processing ${messageId}:`, error);
      return false;
    }
  }

  /**
   * FUNCIÓN 2: Procesa mensaje con atomizers (PROCESAMIENTO PARALELO)
   * @param {string} messageId - ID del mensaje
   * @param {string} rawData - Datos raw del mensaje
   */
  async processWithAtomizers(messageId, rawData) {
    try {
      if (!this.messageProcessor.atomizersEnabled || !this.messageProcessor.atomizerRegistry) {
        return false;
      }

      // Identificar tipo de mensaje
      const messageType = this.messageProcessor.identifyMessageType(rawData);
      if (!messageType) {
        this.logger.debug(`⚛️ [Atomizers] No message type identified for: ${rawData.substring(0, 20)}...`);
        return false;
      }

      // Usar ParserRegistry también para atomizers (consistencia)
      const parsedData = await this.messageProcessor.parserRegistry.parseMessage(rawData);
      
      if (!parsedData) {
        this.logger.debug(`⚛️ [Atomizers] Could not parse data for atomizers: ${rawData.substring(0, 20)}...`);
        return false;
      }

      // Ejecutar atomizers con datos parseados
      const atomizerResult = await this.messageProcessor.atomizerRegistry.atomize(parsedData);
      
      if (atomizerResult.success && atomizerResult.atomizersRun > 0) {
        this.logger.debug(`✅ [Atomizers] Processed ${messageType}: ${atomizerResult.successCount}/${atomizerResult.atomizersRun} success`);
        return true;
      }

      return false;

    } catch (error) {
      this.logger.error(`❌ [Atomizers] Error processing ${messageId}:`, error);
      return false;
    }
  }

  /**
   * Extrae datos RAW de los fields del stream
   * @param {Array} fields - Campos del mensaje en formato [key1, value1, key2, value2, ...]
   * @returns {string|null} - Datos raw o null
   */
  extractRawData(fields) {
    if (typeof fields === 'string') {
      return fields;
    } else if (Array.isArray(fields)) {
      // Convertir campos a objeto
      const streamData = {};
      for (let i = 0; i < fields.length; i += 2) {
        streamData[fields[i]] = fields[i + 1];
      }
      
      // Buscar datos raw válidos
      const rawData = streamData.raw_data || streamData.data || fields[1];
      
      // Validar que sea string
      if (typeof rawData === 'string') {
        return rawData;
      }
      
      // Si no es string, buscar el primer valor string en los campos
      for (let i = 1; i < fields.length; i += 2) {
        if (typeof fields[i] === 'string' && fields[i].startsWith('$')) {
          return fields[i];
        }
      }
      
      return null; // No se encontró ningún dato raw válido
    } else {
      const rawData = fields.raw_data || fields.data;
      return typeof rawData === 'string' ? rawData : null;
    }
  }

  /**
   * Actualiza el leaderboard después de un cambio
   * NUEVA ARQUITECTURA: Usa NewLeaderboardService a través de ServiceRegistry
   */
  async updateLeaderboard() {
    try {
      if (!this.lastLeaderboardUpdate || 
          Date.now() - this.lastLeaderboardUpdate > 30000) {
        
        this.lastLeaderboardUpdate = Date.now();
        
        // Obtener servicio de leaderboard a través de ServiceRegistry
        if (this.serviceRegistry) {
          const newLeaderboardService = this.serviceRegistry.getNewLeaderboardService();
          const standings = await newLeaderboardService.getLeaderboard(3);
          
          if (standings && standings.length > 0) {
            this.logger.debug('🏆 Top 3 actual: ' + 
              standings.map(d => `${d.position}. ${d.name}`).join(', '));
          }
        }
      }
    } catch (error) {
      this.logger.error('Error updating leaderboard', error);
    }
  }

  /**
   * Detiene el middleware
   */
  async stop() {
    this.logger.shutdown('Stopping MYLAPS middleware...');
    this.isRunning = false;

    try {
      // Mostrar leaderboard final usando la nueva arquitectura
      if (this.serviceRegistry) {
        const newLeaderboardService = this.serviceRegistry.getNewLeaderboardService();
        const standings = await newLeaderboardService.getLeaderboard(10);
        
        if (standings && standings.length > 0) {
          this.logger.info('🏆 Leaderboard final (NUEVA ARQUITECTURA V4):');
          standings.forEach((driver, index) => {
            this.logger.info(`P${driver.position}. ${driver.name} - ${driver.laps} vueltas - Mejor tiempo: ${driver.best_ms ? driver.best_ms + 'ms' : 'N/A'}`);
          });
        }
      }
    } catch (error) {
      this.logger.error('Error showing final leaderboard:', error);
    }

    await this.mysqlService.disconnect();
    await this.redisService.disconnect();
    
    this.logger.shutdown('MYLAPS middleware stopped');
  }

  /**
   * Espera un tiempo específico
   * @param {number} ms - Milisegundos a esperar
   * @returns {Promise} - Promesa que se resuelve después del tiempo especificado
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Getters para acceso externo
  getRedisService() { return this.redisService; }
  getMySQLService() { return this.mysqlService; }
  getMessageProcessor() { return this.messageProcessor; }
  getServiceRegistry() { return this.serviceRegistry; }
}

module.exports = MylapsMiddleware;
