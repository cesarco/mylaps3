/**
 * UdpIngestorService.js
 * Servicio para controlar remotamente los ingestores UDP de Python a través de Redis
 */
const Redis = require('ioredis');
const Logger = require('../utils/Logger');
const config = require('../config');

class UdpIngestorService {
  constructor() {
    this.logger = new Logger('UDP-Ingestor');
    this.redis = null;
    this.pubRedis = null; // Instancia separada para publicación
    this.connected = false;
  }

  /**
   * Inicializa conexión a Redis
   */
  async connect() {
    try {
      if (this.connected) return true;

      this.logger.info('Conectando a Redis para control de ingestores UDP...');
      
      // Conexión principal para operaciones generales
      this.redis = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        retryStrategy: (times) => {
          const delay = Math.min(times * 100, 3000);
          return delay;
        }
      });

      // Conexión separada para PubSub (recomendado por Redis)
      this.pubRedis = new Redis({
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password,
        retryStrategy: (times) => {
          const delay = Math.min(times * 100, 3000);
          return delay;
        }
      });

      // Esperar a que ambas conexiones estén listas
      await Promise.all([
        new Promise(resolve => this.redis.once('ready', resolve)),
        new Promise(resolve => this.pubRedis.once('ready', resolve))
      ]);

      this.connected = true;
      this.logger.info('Conexión a Redis establecida para control de ingestores UDP');
      return true;
    } catch (error) {
      this.logger.error('Error conectando a Redis', error);
      this.connected = false;
      return false;
    }
  }

  /**
   * Cierra la conexión a Redis
   */
  async disconnect() {
    if (this.redis) {
      this.logger.info('Cerrando conexión a Redis...');
      await this.redis.quit();
      await this.pubRedis.quit();
      this.connected = false;
      this.logger.info('Conexión a Redis cerrada');
    }
  }

  /**
   * Obtiene la lista de dispositivos ingestores disponibles
   */
  async getDevices() {
    if (!this.connected) await this.connect();

    try {
      // Buscar claves de estado que sigan el patrón "status:*"
      const keys = await this.redis.keys('status:*');
      
      if (!keys.length) {
        return [];
      }

      // Para cada dispositivo, obtener su estado y configuración
      const devices = await Promise.all(keys.map(async (key) => {
        const deviceId = key.split(':')[1];
        
        // Obtener estado y configuración en paralelo
        const [status, config] = await Promise.all([
          this.redis.hgetall(key),
          this.redis.hgetall(`config:${deviceId}`)
        ]);

        return {
          deviceId,
          status: status || { status: 'unknown' },
          config: config || {},
          controlChannel: `control:${deviceId}`
        };
      }));

      return devices;
    } catch (error) {
      this.logger.error('Error obteniendo dispositivos ingestores', error);
      throw error;
    }
  }

  /**
   * Obtiene el estado actual de un dispositivo ingestor específico
   */
  async getDeviceStatus(deviceId) {
    if (!this.connected) await this.connect();

    try {
      // Obtener datos de estado y configuración en paralelo
      const [status, config] = await Promise.all([
        this.redis.hgetall(`status:${deviceId}`),
        this.redis.hgetall(`config:${deviceId}`)
      ]);

      if (!status || Object.keys(status).length === 0) {
        return { error: `Dispositivo ${deviceId} no encontrado` };
      }

      // Convertir campos numéricos
      const parsedConfig = { ...config };
      if (parsedConfig.udp_port) parsedConfig.udp_port = parseInt(parsedConfig.udp_port);
      if (parsedConfig.batch_size) parsedConfig.batch_size = parseInt(parsedConfig.batch_size);
      if (parsedConfig.flush_ms) parsedConfig.flush_ms = parseInt(parsedConfig.flush_ms);
      if (parsedConfig.stream_maxlen) parsedConfig.stream_maxlen = parseInt(parsedConfig.stream_maxlen);
      
      // Convertir campos booleanos
      if (parsedConfig.use_simulator !== undefined) {
        parsedConfig.use_simulator = parsedConfig.use_simulator.toLowerCase() === 'true';
      }
      if (parsedConfig.simulator_loop !== undefined) {
        parsedConfig.simulator_loop = parsedConfig.simulator_loop.toLowerCase() === 'true';
      }

      return {
        deviceId,
        status,
        config: parsedConfig,
        controlChannel: `control:${deviceId}`
      };
    } catch (error) {
      this.logger.error(`Error obteniendo estado del dispositivo ${deviceId}`, error);
      throw error;
    }
  }

  /**
   * Envía un comando al dispositivo ingestor
   * @param {string} deviceId ID del dispositivo
   * @param {string} command Comando a enviar
   * @param {object} params Parámetros adicionales del comando
   */
  async sendCommand(deviceId, command, params = {}) {
    if (!this.connected) await this.connect();

    try {
      const message = JSON.stringify({
        command,
        params,
        timestamp: Date.now()
      });

      // Publicar mensaje en el canal de control del dispositivo
      const channel = `control:${deviceId}`;
      this.logger.info(`Enviando comando ${command} al dispositivo ${deviceId}`);
      
      await this.pubRedis.publish(channel, message);
      return { success: true, message: `Comando ${command} enviado` };
    } catch (error) {
      this.logger.error(`Error enviando comando a dispositivo ${deviceId}`, error);
      throw error;
    }
  }

  /**
   * Inicia un escaneo de red para encontrar transmisores UDP
   * @param {string} deviceId ID del dispositivo que realizará el escaneo
   * @param {object} options Opciones de escaneo
   * @returns {object} Resultado de la operación
   */
  async scanNetwork(deviceId, options = {}) {
    if (!this.connected) await this.connect();
    
    try {
      // Validar y asignar valores predeterminados
      const scanOptions = {
        port: options.port || 5403, // Puerto predeterminado de RMonitor
        cidr: options.cidr || 24,   // Máscara de subred predeterminada /24
        duration: options.duration || 30, // Duración del escaneo en segundos
        auto_config: options.auto_config === true
      };
      
      // Validar rangos
      if (scanOptions.port < 1 || scanOptions.port > 65535) {
        throw new Error('Puerto inválido');
      }
      
      if (scanOptions.cidr < 8 || scanOptions.cidr > 30) {
        throw new Error('Máscara CIDR inválida (debe estar entre 8 y 30)');
      }
      
      if (scanOptions.duration < 5 || scanOptions.duration > 120) {
        throw new Error('Duración inválida (debe estar entre 5 y 120 segundos)');
      }
      
      this.logger.info(`Iniciando escaneo de red con dispositivo ${deviceId}`, scanOptions);
      
      // Enviar comando al dispositivo
      await this.sendCommand(deviceId, 'scan_network', scanOptions);
      
      return {
        success: true,
        message: `Escaneo de red iniciado con dispositivo ${deviceId}`,
        scanOptions
      };
    } catch (error) {
      this.logger.error(`Error al iniciar escaneo de red con dispositivo ${deviceId}`, error);
      throw error;
    }
  }
  
  /**
   * Obtiene el estado actual de un escaneo de red
   * @param {string} deviceId ID del dispositivo que está realizando el escaneo
   * @returns {object} Estado del escaneo o null si no hay escaneo en progreso
   */
  async getScanStatus(deviceId) {
    if (!this.connected) await this.connect();
    
    try {
      const scanStatus = await this.redis.get(`status:${deviceId}:scan`);
      
      if (!scanStatus) {
        return null;
      }
      
      return JSON.parse(scanStatus);
    } catch (error) {
      this.logger.error(`Error al obtener estado de escaneo del dispositivo ${deviceId}`, error);
      throw error;
    }
  }
  
  /**
   * Actualiza la configuración de un dispositivo ingestor
   */
  async updateDeviceConfig(deviceId, newConfig) {
    if (!this.connected) await this.connect();

    try {
      // Validar parámetros
      const validatedConfig = {};
      
      // Validar parámetros UDP
      if (newConfig.udp_host !== undefined) {
        // Validación básica de formato IP
        const ipRegex = /^(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])$|^0\.0\.0\.0$/;
        if (ipRegex.test(newConfig.udp_host) || newConfig.udp_host === 'localhost') {
          validatedConfig.udp_host = newConfig.udp_host;
        } else {
          throw new Error('Formato de IP inválido');
        }
      }

      if (newConfig.udp_port !== undefined) {
        const port = parseInt(newConfig.udp_port);
        if (isNaN(port) || port < 1 || port > 65535) {
          throw new Error('Puerto UDP inválido');
        }
        validatedConfig.udp_port = port;
      }

      // Validar parámetros de Stream
      if (newConfig.stream_key !== undefined) {
        validatedConfig.stream_key = newConfig.stream_key;
      }

      if (newConfig.stream_maxlen !== undefined) {
        const maxlen = parseInt(newConfig.stream_maxlen);
        if (isNaN(maxlen) || maxlen < 100) {
          throw new Error('Stream maxlen inválido');
        }
        validatedConfig.stream_maxlen = maxlen;
      }

      // Validar parámetros de lote
      if (newConfig.batch_size !== undefined) {
        const batchSize = parseInt(newConfig.batch_size);
        if (isNaN(batchSize) || batchSize < 1) {
          throw new Error('Batch size inválido');
        }
        validatedConfig.batch_size = batchSize;
      }

      if (newConfig.flush_ms !== undefined) {
        const flushMs = parseInt(newConfig.flush_ms);
        if (isNaN(flushMs) || flushMs < 10) {
          throw new Error('Flush ms inválido');
        }
        validatedConfig.flush_ms = flushMs;
      }

      // Validar parámetros del simulador
      if (newConfig.use_simulator !== undefined) {
        validatedConfig.use_simulator = newConfig.use_simulator === true || 
                                        newConfig.use_simulator === 'true';
      }

      if (newConfig.simulator_file !== undefined) {
        validatedConfig.simulator_file = newConfig.simulator_file;
      }

      if (newConfig.simulator_delay_ms !== undefined) {
        const delay = parseInt(newConfig.simulator_delay_ms);
        if (isNaN(delay) || delay < 1) {
          throw new Error('Simulator delay inválido');
        }
        validatedConfig.simulator_delay_ms = delay;
      }

      if (newConfig.simulator_loop !== undefined) {
        validatedConfig.simulator_loop = newConfig.simulator_loop === true || 
                                        newConfig.simulator_loop === 'true';
      }

      // Enviar comando de actualización de configuración
      return await this.sendCommand(deviceId, 'update_config', validatedConfig);
    } catch (error) {
      this.logger.error(`Error actualizando configuración del dispositivo ${deviceId}`, error);
      throw error;
    }
  }

  /**
   * Reinicia un dispositivo ingestor
   */
  async restartDevice(deviceId) {
    return await this.sendCommand(deviceId, 'restart');
  }

  /**
   * Detiene un dispositivo ingestor
   */
  async stopDevice(deviceId) {
    return await this.sendCommand(deviceId, 'stop');
  }

  /**
   * Inicia un dispositivo ingestor
   */
  async startDevice(deviceId) {
    return await this.sendCommand(deviceId, 'start');
  }

  /**
   * Obtiene los últimos datos recibidos en un Redis Stream
   * @param {string} streamKey Clave del stream a leer
   * @param {number} count Número de elementos a obtener
   * @returns {Array} Últimos mensajes del stream
   */
  async getStreamData(streamKey, count = 20) {
    if (!this.connected) await this.connect();

    try {
      this.logger.info(`Leyendo ${count} mensajes del stream ${streamKey}`);
      
      // Leer los últimos datos del stream
      const data = await this.redis.xrevrange(streamKey, '+', '-', 'COUNT', count);
      
      // Dar formato a los resultados
      const formattedData = data.map(item => {
        const [id, fields] = item;
        
        // Transformar el array de campos en un objeto
        const messageData = {};
        for (let i = 0; i < fields.length; i += 2) {
          messageData[fields[i]] = fields[i + 1];
        }
        
        return {
          id,
          timestamp: id.split('-')[0], // El timestamp está en la primera parte del ID
          ...messageData
        };
      });
      
      return formattedData;
    } catch (error) {
      this.logger.error(`Error obteniendo datos del stream ${streamKey}`, error);
      throw error;
    }
  }
  
  /**
   * Obtiene el stream configurado para un dispositivo específico
   * @param {string} deviceId ID del dispositivo
   * @returns {string|null} Clave del stream configurado o null si no se encuentra
   */
  async getDeviceStreamKey(deviceId) {
    if (!this.connected) await this.connect();
    
    try {
      const config = await this.redis.hgetall(`config:${deviceId}`);
      return config.stream_key || null;
    } catch (error) {
      this.logger.error(`Error obteniendo stream key para el dispositivo ${deviceId}`, error);
      throw error;
    }
  }
}

module.exports = UdpIngestorService;