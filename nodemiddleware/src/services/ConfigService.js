/**
 * ConfigService.js
 * Servicio para gestión de configuración compatible con el sistema Go
 */
const fs = require('fs').promises;
const path = require('path');
const Redis = require('ioredis');
const Logger = require('../utils/Logger');

class ConfigService {
  constructor() {
    this.logger = new Logger('CONFIG_SERVICE');
    this.redisClient = null;
    this.configFile = '.env';
    this.lastLocalUpdate = null;
    this.lastRemoteUpdate = null;

    // Configuración por defecto compatible con Go
    this.defaultConfig = {
      // UDP Configuration
      UDP_LISTEN: ':5403',
      UDP_HOST: '0.0.0.0',
      UDP_PORT: '5403',

      // Redis Configuration
      REDIS_URL: 'redis://localhost:6379/0',
      REDIS_HOST: 'localhost',
      REDIS_PORT: '6379',
      REDIS_PASSWORD: '',
      REDIS_DATABASE: '0',

      // Stream Keys
      RAW_STREAM_KEY: 'rmon:raw',
      CONFIG_STREAM_KEY: 'rmon:config',

      // Consumer Configuration
      CONSUMER_GROUP: 'mylaps-forwarder',
      CONSUMER_NAME: 'middleware-1',

      // Processing Configuration
      BATCH_SIZE: '100',
      BATCH_INTERVAL_MS: '50',
      MAX_QUEUE_SIZE: '10000',
      MAX_RETRIES: '10',
      INITIAL_BACKOFF_MS: '100',
      MAX_BACKOFF_MS: '5000',

      // File Storage Configuration
      ENABLE_RAW_FILE_STORAGE: 'true',
      RAW_FILE_DIR: './logs',
      RAW_FILE_MAX_SIZE: '104857600', // 100MB in bytes
      RAW_FILE_MAX_AGE: '24', // 24 hours

      // Advanced Configuration
      ENABLE_STREAM_ACK: 'true'
    };

    this.initializeRedis();
  }

  /**
   * Inicializar conexión Redis
   */
  async initializeRedis() {
    try {
      // Cargar configuración actual para obtener parámetros de Redis
      const currentConfig = await this.loadConfigFromFile();

      const redisConfig = {
        host: currentConfig.REDIS_HOST || 'localhost',
        port: parseInt(currentConfig.REDIS_PORT) || 6379,
        password: currentConfig.REDIS_PASSWORD || undefined,
        db: parseInt(currentConfig.REDIS_DATABASE) || 0,
        retryDelayOnFailover: 100,
        maxRetriesPerRequest: 3,
        lazyConnect: true
      };

      this.redisClient = new Redis(redisConfig);

      this.redisClient.on('connect', () => {
        this.logger.info('Conectado a Redis para configuración');
      });

      this.redisClient.on('error', (error) => {
        this.logger.error('Error de conexión Redis:', error);
      });

    } catch (error) {
      this.logger.error('Error inicializando Redis:', error);
    }
  }

  /**
   * Obtener configuración actual
   */
  async getConfig() {
    try {
      // Cargar desde archivo .env
      const fileConfig = await this.loadConfigFromFile();

      // Convertir formato de archivo a formato API
      const apiConfig = this.convertFileConfigToApiConfig(fileConfig);

      return apiConfig;
    } catch (error) {
      this.logger.error('Error obteniendo configuración:', error);
      throw error;
    }
  }

  /**
   * Actualizar configuración local
   */
  async updateConfig(newConfig) {
    try {
      // Validar configuración
      const validation = this.validateConfig(newConfig);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.errors.join(', ')
        };
      }

      // Convertir formato API a formato de archivo
      const fileConfig = this.convertApiConfigToFileConfig(newConfig);

      // Guardar en archivo .env
      await this.saveConfigToFile(fileConfig);

      // Actualizar timestamp
      this.lastLocalUpdate = new Date();

      this.logger.info('Configuración actualizada localmente');

      return {
        success: true,
        config: newConfig
      };
    } catch (error) {
      this.logger.error('Error actualizando configuración:', error);
      return {
        success: false,
        error: `Error interno: ${error.message}`
      };
    }
  }

  /**
   * Publicar configuración a Redis stream
   */
  async publishConfig(configToPublish) {
    try {
      if (!this.redisClient) {
        throw new Error('Cliente Redis no disponible');
      }

      // Validar configuración antes de publicar
      const validation = this.validateConfig(configToPublish);
      if (!validation.valid) {
        return {
          success: false,
          error: validation.errors.join(', ')
        };
      }

      // Obtener stream key desde configuración actual
      const currentConfig = await this.loadConfigFromFile();
      const streamKey = currentConfig.CONFIG_STREAM_KEY || 'rmon:config';

      // Convertir configuración a formato JSON para Redis
      const configJson = JSON.stringify(this.convertApiConfigToRedisFormat(configToPublish));

      // Publicar a Redis stream
      const messageId = await this.redisClient.xadd(
        streamKey,
        '*',
        'config',
        configJson,
        'ts',
        Date.now().toString()
      );

      this.logger.info(`Configuración publicada a stream ${streamKey} con ID ${messageId}`);

      return {
        success: true,
        streamKey: streamKey,
        messageId: messageId
      };
    } catch (error) {
      this.logger.error('Error publicando configuración:', error);
      return {
        success: false,
        error: `Error publicando: ${error.message}`
      };
    }
  }

  /**
   * Restaurar configuración por defecto
   */
  async resetConfig() {
    try {
      // Guardar configuración por defecto
      await this.saveConfigToFile(this.defaultConfig);

      // Actualizar timestamp
      this.lastLocalUpdate = new Date();

      this.logger.info('Configuración restaurada a valores por defecto');

      return {
        success: true,
        config: this.convertFileConfigToApiConfig(this.defaultConfig)
      };
    } catch (error) {
      this.logger.error('Error restaurando configuración:', error);
      return {
        success: false,
        error: `Error interno: ${error.message}`
      };
    }
  }

  /**
   * Obtener estado de sincronización
   */
  async getSyncStatus() {
    try {
      const redisConnected = this.redisClient && this.redisClient.status === 'ready';

      return {
        redisConnected: redisConnected,
        lastLocalUpdate: this.lastLocalUpdate ? this.lastLocalUpdate.toISOString() : null,
        lastRemoteUpdate: this.lastRemoteUpdate ? this.lastRemoteUpdate.toISOString() : null,
        configFile: this.configFile,
        configFileExists: await this.configFileExists()
      };
    } catch (error) {
      this.logger.error('Error obteniendo estado de sincronización:', error);
      throw error;
    }
  }

  /**
   * Cargar configuración desde archivo .env
   */
  async loadConfigFromFile() {
    try {
      const envPath = path.resolve(this.configFile);
      const envContent = await fs.readFile(envPath, 'utf-8');

      // Parsear contenido del archivo .env
      const config = { ...this.defaultConfig };
      const lines = envContent.split('\n');

      for (const line of lines) {
        const trimmedLine = line.trim();
        if (trimmedLine && !trimmedLine.startsWith('#')) {
          const [key, ...valueParts] = trimmedLine.split('=');
          if (key && valueParts.length > 0) {
            const value = valueParts.join('=').replace(/^["']|["']$/g, ''); // Remover comillas
            config[key.trim()] = value;
          }
        }
      }

      return config;
    } catch (error) {
      this.logger.warn(`Archivo ${this.configFile} no encontrado o inválido, usando configuración por defecto`);
      return { ...this.defaultConfig };
    }
  }

  /**
   * Guardar configuración en archivo .env
   */
  async saveConfigToFile(config) {
    try {
      const envPath = path.resolve(this.configFile);
      let content = '# MyLaps Middleware Configuration (Updated from Web UI)\n\n';

      // Agregar cada configuración con comentarios descriptivos
      content += '# UDP Configuration\n';
      content += `UDP_LISTEN=${config.UDP_LISTEN}\n`;
      content += `UDP_HOST=${config.UDP_HOST}\n`;
      content += `UDP_PORT=${config.UDP_PORT}\n\n`;

      content += '# Redis Configuration\n';
      content += `REDIS_URL=${config.REDIS_URL}\n`;
      content += `REDIS_HOST=${config.REDIS_HOST}\n`;
      content += `REDIS_PORT=${config.REDIS_PORT}\n`;
      if (config.REDIS_PASSWORD) {
        content += `REDIS_PASSWORD=${config.REDIS_PASSWORD}\n`;
      }
      content += `REDIS_DATABASE=${config.REDIS_DATABASE}\n\n`;

      content += '# Stream Keys\n';
      content += `RAW_STREAM_KEY=${config.RAW_STREAM_KEY}\n`;
      content += `CONFIG_STREAM_KEY=${config.CONFIG_STREAM_KEY}\n\n`;

      content += '# Consumer Configuration\n';
      content += `CONSUMER_GROUP=${config.CONSUMER_GROUP}\n`;
      content += `CONSUMER_NAME=${config.CONSUMER_NAME}\n\n`;

      content += '# Processing Configuration\n';
      content += `BATCH_SIZE=${config.BATCH_SIZE}\n`;
      content += `BATCH_INTERVAL_MS=${config.BATCH_INTERVAL_MS}\n`;
      content += `MAX_QUEUE_SIZE=${config.MAX_QUEUE_SIZE}\n`;
      content += `MAX_RETRIES=${config.MAX_RETRIES}\n`;
      content += `INITIAL_BACKOFF_MS=${config.INITIAL_BACKOFF_MS}\n`;
      content += `MAX_BACKOFF_MS=${config.MAX_BACKOFF_MS}\n\n`;

      content += '# File Storage Configuration\n';
      content += `ENABLE_RAW_FILE_STORAGE=${config.ENABLE_RAW_FILE_STORAGE}\n`;
      content += `RAW_FILE_DIR=${config.RAW_FILE_DIR}\n`;
      content += `RAW_FILE_MAX_SIZE=${config.RAW_FILE_MAX_SIZE}\n`;
      content += `RAW_FILE_MAX_AGE=${config.RAW_FILE_MAX_AGE}\n\n`;

      content += '# Advanced Configuration\n';
      content += `ENABLE_STREAM_ACK=${config.ENABLE_STREAM_ACK}\n`;

      await fs.writeFile(envPath, content, 'utf-8');
      this.logger.info(`Configuración guardada en ${envPath}`);
    } catch (error) {
      this.logger.error('Error guardando configuración:', error);
      throw error;
    }
  }

  /**
   * Verificar si el archivo de configuración existe
   */
  async configFileExists() {
    try {
      await fs.access(path.resolve(this.configFile));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Convertir configuración de archivo a formato API
   */
  convertFileConfigToApiConfig(fileConfig) {
    return {
      udpHost: fileConfig.UDP_HOST || '0.0.0.0',
      udpPort: parseInt(fileConfig.UDP_PORT) || 5403,
      redisHost: fileConfig.REDIS_HOST || 'localhost',
      redisPort: parseInt(fileConfig.REDIS_PORT) || 6379,
      redisPassword: fileConfig.REDIS_PASSWORD || '',
      redisDatabase: parseInt(fileConfig.REDIS_DATABASE) || 0,
      rawStreamKey: fileConfig.RAW_STREAM_KEY || 'rmon:raw',
      configStreamKey: fileConfig.CONFIG_STREAM_KEY || 'rmon:config',
      consumerGroup: fileConfig.CONSUMER_GROUP || 'mylaps-forwarder',
      consumerName: fileConfig.CONSUMER_NAME || 'middleware-1',
      batchSize: parseInt(fileConfig.BATCH_SIZE) || 100,
      batchInterval: parseInt(fileConfig.BATCH_INTERVAL_MS) || 50,
      maxQueueSize: parseInt(fileConfig.MAX_QUEUE_SIZE) || 10000,
      maxRetries: parseInt(fileConfig.MAX_RETRIES) || 10,
      initialBackoff: parseInt(fileConfig.INITIAL_BACKOFF_MS) || 100,
      maxBackoff: parseInt(fileConfig.MAX_BACKOFF_MS) || 5000,
      enableRawFileStorage: fileConfig.ENABLE_RAW_FILE_STORAGE === 'true',
      rawFileDir: fileConfig.RAW_FILE_DIR || './logs',
      rawFileMaxSize: parseInt(fileConfig.RAW_FILE_MAX_SIZE) || 104857600,
      rawFileMaxAge: parseInt(fileConfig.RAW_FILE_MAX_AGE) || 24,
      enableStreamAck: fileConfig.ENABLE_STREAM_ACK === 'true'
    };
  }

  /**
   * Convertir configuración API a formato de archivo
   */
  convertApiConfigToFileConfig(apiConfig) {
    // Construir UDP_LISTEN desde host y port
    const udpListen = apiConfig.udpHost === '0.0.0.0' || apiConfig.udpHost === '' ?
      `:${apiConfig.udpPort}` : `${apiConfig.udpHost}:${apiConfig.udpPort}`;

    // Construir REDIS_URL
    const redisUrl = `redis://${apiConfig.redisHost}:${apiConfig.redisPort}/${apiConfig.redisDatabase}`;

    return {
      UDP_LISTEN: udpListen,
      UDP_HOST: apiConfig.udpHost || '0.0.0.0',
      UDP_PORT: apiConfig.udpPort.toString(),
      REDIS_URL: redisUrl,
      REDIS_HOST: apiConfig.redisHost,
      REDIS_PORT: apiConfig.redisPort.toString(),
      REDIS_PASSWORD: apiConfig.redisPassword || '',
      REDIS_DATABASE: apiConfig.redisDatabase.toString(),
      RAW_STREAM_KEY: apiConfig.rawStreamKey,
      CONFIG_STREAM_KEY: apiConfig.configStreamKey,
      CONSUMER_GROUP: apiConfig.consumerGroup,
      CONSUMER_NAME: apiConfig.consumerName,
      BATCH_SIZE: apiConfig.batchSize.toString(),
      BATCH_INTERVAL_MS: apiConfig.batchInterval.toString(),
      MAX_QUEUE_SIZE: apiConfig.maxQueueSize.toString(),
      MAX_RETRIES: apiConfig.maxRetries.toString(),
      INITIAL_BACKOFF_MS: apiConfig.initialBackoff.toString(),
      MAX_BACKOFF_MS: apiConfig.maxBackoff.toString(),
      ENABLE_RAW_FILE_STORAGE: apiConfig.enableRawFileStorage.toString(),
      RAW_FILE_DIR: apiConfig.rawFileDir,
      RAW_FILE_MAX_SIZE: apiConfig.rawFileMaxSize.toString(),
      RAW_FILE_MAX_AGE: apiConfig.rawFileMaxAge.toString(),
      ENABLE_STREAM_ACK: apiConfig.enableStreamAck.toString()
    };
  }

  /**
   * Convertir configuración API a formato Redis
   */
  convertApiConfigToRedisFormat(apiConfig) {
    return {
      udpListen: apiConfig.udpHost === '0.0.0.0' || apiConfig.udpHost === '' ?
        `:${apiConfig.udpPort}` : `${apiConfig.udpHost}:${apiConfig.udpPort}`,
      redisURL: `redis://${apiConfig.redisHost}:${apiConfig.redisPort}/${apiConfig.redisDatabase}`,
      rawStreamKey: apiConfig.rawStreamKey,
      configStreamKey: apiConfig.configStreamKey,
      consumerGroup: apiConfig.consumerGroup,
      consumerName: apiConfig.consumerName,
      enableRawFileStorage: apiConfig.enableRawFileStorage,
      rawFileDir: apiConfig.rawFileDir,
      rawFileMaxSize: apiConfig.rawFileMaxSize,
      rawFileMaxAge: apiConfig.rawFileMaxAge,
      batchSize: apiConfig.batchSize,
      batchIntervalMS: apiConfig.batchInterval,
      maxQueueSize: apiConfig.maxQueueSize,
      maxRetries: apiConfig.maxRetries,
      initialBackoffMS: apiConfig.initialBackoff,
      maxBackoffMS: apiConfig.maxBackoff,
      enableStreamAck: apiConfig.enableStreamAck
    };
  }

  /**
   * Validar configuración
   */
  validateConfig(config) {
    const errors = [];

    // Validar UDP
    if (config.udpPort < 1 || config.udpPort > 65535) {
      errors.push('Puerto UDP debe estar entre 1 y 65535');
    }

    // Validar Redis
    if (config.redisPort < 1 || config.redisPort > 65535) {
      errors.push('Puerto Redis debe estar entre 1 y 65535');
    }
    if (config.redisDatabase < 0 || config.redisDatabase > 15) {
      errors.push('Base de datos Redis debe estar entre 0 y 15');
    }

    // Validar procesamiento
    if (config.batchSize < 1 || config.batchSize > 1000) {
      errors.push('Tamaño del lote debe estar entre 1 y 1000');
    }
    if (config.batchInterval < 10 || config.batchInterval > 1000) {
      errors.push('Intervalo del lote debe estar entre 10 y 1000 ms');
    }
    if (config.maxQueueSize < 100 || config.maxQueueSize > 100000) {
      errors.push('Tamaño máximo de cola debe estar entre 100 y 100000');
    }
    if (config.maxRetries < 0 || config.maxRetries > 100) {
      errors.push('Máximo reintentos debe estar entre 0 y 100');
    }

    // Validar almacenamiento
    if (config.rawFileMaxSize < 1024 * 1024 || config.rawFileMaxSize > 1024 * 1024 * 1024) {
      errors.push('Tamaño máximo de archivo debe estar entre 1MB y 1GB');
    }
    if (config.rawFileMaxAge < 1 || config.rawFileMaxAge > 168) {
      errors.push('Edad máxima de archivo debe estar entre 1 y 168 horas');
    }

    return {
      valid: errors.length === 0,
      errors: errors
    };
  }

  /**
   * Cerrar conexiones
   */
  async close() {
    if (this.redisClient) {
      await this.redisClient.quit();
    }
  }
}

module.exports = ConfigService;