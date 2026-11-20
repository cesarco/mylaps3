const fs = require('fs').promises;
const path = require('path');
const config = require('../config');
const Logger = require('./Logger');

class DataSimulator {
  constructor(redisService) {
    this.redisService = redisService;
    this.logger = new Logger('SIMULATOR');
    this.isRunning = false;
    this.intervalId = null;
  }

  async start() {
    if (!config.simulator.enabled) {
      this.logger.info('Simulator is disabled');
      return;
    }

    this.logger.info('🎮 Starting MYLAPS RAW data simulator...');

    try {
      // MODIFICADO: Limpiar Redis selectivamente para preservar el consumer group
      this.logger.info('🧹 Cleaning Redis data (preserving consumer group)...');
      await this.clearRedisDataSafely();
      this.logger.info('✅ Redis selectively cleared (consumer group preserved)');
      
      // Cargar datos del archivo configurado
      const data = await this.loadDataFile();
      if (data.length === 0) {
        this.logger.warning('No se encontraron datos para simular');
        return;
      }

      this.logger.info(`📁 Loaded ${data.length} lines from ${config.simulator.dataFile}`);
      
      // Simular flujo de datos enviando RAW data (como Python handler en modo RAW)
      this.simulateDataFlow(data);
      
    } catch (error) {
      this.logger.error('Error starting simulation:', error);
    }
  }

  async loadDataFile() {
    try {
      let dataFile = config.simulator.dataFile;
      
      // Si es una clave de archivo predefinido, usar la ruta correspondiente
      if (config.simulator.dataFiles[dataFile]) {
        dataFile = config.simulator.dataFiles[dataFile];
        this.logger.info(`📋 Using predefined data file: ${dataFile}`);
      }
      
      // Determinar la ruta del archivo
      const dataPath = path.isAbsolute(dataFile) 
        ? dataFile 
        : path.join(__dirname, '../../', dataFile);
        
      this.logger.info(`📂 Loading simulation data from: ${dataPath}`);
      
      const content = await fs.readFile(dataPath, 'utf-8');
      const lines = content.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);

      return lines;
    } catch (error) {
      this.logger.error(`Error loading data file ${config.simulator.dataFile}:`, error);
      
      // Fallback: intentar cargar el archivo por defecto
      if (config.simulator.dataFile !== 'data.txt') {
        this.logger.info('🔄 Attempting to load default data.txt file...');
        try {
          const fallbackPath = path.join(__dirname, '../../data.txt');
          const content = await fs.readFile(fallbackPath, 'utf-8');
          const lines = content.split('\n')
            .map(line => line.trim())
            .filter(line => line.length > 0);
          this.logger.info(`✅ Loaded fallback file with ${lines.length} lines`);
          return lines;
        } catch (fallbackError) {
          this.logger.error('Fallback file also failed:', fallbackError);
        }
      }
      
      return [];
    }
  }

  async simulateDataFlow(lines, flushAll = false) {
    this.logger.info(`🚀 Starting RAW MYLAPS simulation (delay: ${config.simulator.speed}ms)`);
    this.isRunning = true;

    // ✨ Solo limpiamos Redis si se solicita explícitamente (método start ya limpia por defecto)
    if (flushAll) {
      this.logger.info('🧹 Additional Redis cleaning requested...');
      // Usar la nueva función de limpieza segura
      await this.clearRedisDataSafely();
    }
    
    // Agregar un retraso para permitir que el consumer group se configure correctamente
    const setupDelay = 1000; // Incrementamos a 1 segundo para dar más margen
    this.logger.info(`⏳ Esperando ${setupDelay}ms para asegurar que el consumer group esté configurado...`);
    await new Promise(resolve => setTimeout(resolve, setupDelay));
    
    // Verificar explícitamente que el stream y consumer group existan antes de continuar
    try {
      const streamExists = await this.redisService.client.exists(config.redis.stream);
      if (!streamExists) {
        this.logger.warning('⚠️ Stream no encontrado después del retraso. Intentando crear uno...');
        await this.redisService.client.xadd(config.redis.stream, '*', 'init', 'true');
        this.logger.info('✅ Stream creado manualmente desde el simulador');
      }
      
      // Verificar que el consumer group exista
      try {
        await this.redisService.client.xinfo('GROUPS', config.redis.stream);
        this.logger.info('✅ Consumer group verificado, listo para enviar mensajes');
      } catch (groupError) {
        this.logger.warning('⚠️ No se pudo verificar el consumer group. Es posible que necesites reiniciar la aplicación.');
        // Intentar volver a crear el grupo desde aquí
        try {
          await this.redisService.client.xgroup('CREATE', config.redis.stream, config.redis.group, '0', 'MKSTREAM');
          this.logger.info('✅ Consumer group creado desde el simulador');
        } catch (createError) {
          // Ignorar error BUSYGROUP
          if (!createError.message.includes('BUSYGROUP')) {
            this.logger.error('❌ Error al crear consumer group:', createError);
          }
        }
      }
    } catch (error) {
      this.logger.error('❌ Error al verificar stream/consumer group:', error);
    }
    
    this.logger.info('✅ Listo para enviar mensajes');

    let index = 0;
    let sentCount = 0;
    let lastTimestamp = Date.now();
    
    // Función para enviar un mensaje a Redis (sin esperar confirmación)
    const sendMessage = (lineIndex) => {
      const rawLine = lines[lineIndex];
      
      // Enviar directamente como RAW data sin wrapper
      const rawMessage = {
        raw_data: rawLine,
        timestamp: new Date().toISOString()
      };

      // Enviar a Redis stream sin await (asíncrono)
      this.redisService.client.xadd(
        config.redis.stream,
        '*',
        ...this.objectToRedisFields(rawMessage)
      ).then(() => {
        const now = Date.now();
        const actualDelay = now - lastTimestamp;
        
        // Solo logear si verbose está habilitado
        if (config.simulator.verbose) {
          this.logger.info(`📤 Sent RAW [${lineIndex+1}/${lines.length}]: ${rawLine.substring(0, 80)}... (actual delay: ${actualDelay}ms)`);
        }
        sentCount++;
        lastTimestamp = now;
      }).catch((error) => {
        this.logger.error(`Error sending message ${lineIndex}:`, error);
      });
    };
    
    // Función que programa el envío del siguiente mensaje
    const scheduleNextMessage = () => {
      if (!this.isRunning || index >= lines.length) {
        this.logger.info(`✅ RAW MYLAPS simulation completed - Sent: ${sentCount}/${lines.length}`);
        return;
      }

      // Enviar mensaje actual
      sendMessage(index);
      
      // Incrementar índice para el próximo mensaje
      index++;
      lastTimestamp = Date.now();
      
      // Programar el siguiente mensaje con delay fijo
      if (this.isRunning && index < lines.length) {
        this.intervalId = setTimeout(scheduleNextMessage, config.simulator.speed);
      }
    };

    // Iniciar la simulación inmediatamente
    scheduleNextMessage();
  }

  objectToRedisFields(obj) {
    const fields = [];
    for (const [key, value] of Object.entries(obj)) {
      if (value !== undefined && value !== null) {
        fields.push(key, String(value));
      }
    }
    return fields;
  }

  /**
   * Limpia datos de Redis para una simulación nueva
   * @param {boolean} flushAll - Si es true, elimina todas las claves de Redis
   * @deprecated Use clearRedisDataSafely instead
   */
  async clearRedisData(flushAll = false) {
    try {
      if (flushAll) {
        this.logger.info('🧹 Flushing ALL Redis data (FLUSH ALL)...');
        // Eliminar todas las claves de la base de datos actual
        await this.redisService.client.flushdb();
        this.logger.info('✅ Redis completely cleared (FLUSH ALL)');
        return;
      }

      this.logger.info('🧹 Clearing Redis data for fresh simulation...');
      
      // Limpiar la key session (estructura plana y con prefijo)
      await this.redisService.client.del('session');
      await this.redisService.client.del('default:session');
      
      // Limpiar leaderboard y otros datos relacionados
      await this.redisService.client.del('leaderboard:session:default:drivers');
      await this.redisService.client.del('leaderboard:session:default:positions');
      
      // Obtener y eliminar keys de drivers
      const driverKeys = await this.redisService.client.keys('*driver*');
      if (driverKeys.length > 0) {
        await this.redisService.client.del(...driverKeys);
        this.logger.info(`✅ Cleared ${driverKeys.length} driver keys`);
      }
      
      // Obtener y eliminar keys de laps
      const lapKeys = await this.redisService.client.keys('*lap*');
      if (lapKeys.length > 0) {
        await this.redisService.client.del(...lapKeys);
        this.logger.info(`✅ Cleared ${lapKeys.length} lap keys`);
      }
      
      // Obtener y eliminar keys de leaderboard
      const leaderboardKeys = await this.redisService.client.keys('*leaderboard*');
      if (leaderboardKeys.length > 0) {
        await this.redisService.client.del(...leaderboardKeys);
        this.logger.info(`✅ Cleared ${leaderboardKeys.length} leaderboard keys`);
      }
      
      this.logger.info('✅ Redis data cleared for simulation');
    } catch (error) {
      this.logger.error('❌ Error clearing Redis data:', error.message);
    }
  }
  
  /**
   * Limpia datos de Redis de forma segura, preservando el consumer group
   * Este método limpia los datos de la sesión pero mantiene la configuración del consumer group
   */
  async clearRedisDataSafely() {
    try {
      this.logger.info('🧹 Clearing Redis data for fresh simulation (preserving consumer group)...');
      
      // Primero, verificar si existe el stream (lo necesitaremos para preservarlo)
      const streamKey = config.redis.stream;
      const streamExists = await this.redisService.client.exists(streamKey);
      
      // Si existe el stream, debemos preservar sus metadatos (grupos de consumidores)
      let streamInfo = null;
      if (streamExists) {
        try {
          // Guardar información del consumer group antes de limpiar
          const groupInfo = await this.redisService.client.xinfo('GROUPS', streamKey);
          this.logger.info(`⚙️ Preserving ${groupInfo.length} consumer groups from stream: ${streamKey}`);
          streamInfo = {
            groups: groupInfo
          };
          
          // Mantener el stream pero eliminar sus mensajes (solo quedará el consumer group)
          await this.redisService.client.xtrim(streamKey, 'MAXLEN', '0');
          this.logger.info('✅ Stream messages cleared but stream and consumer groups preserved');
          
          // Agregar un mensaje dummy para asegurarse de que el stream siga existiendo
          await this.redisService.client.xadd(streamKey, '*', 'init', 'true');
          this.logger.info('✅ Added dummy message to preserved stream');
        } catch (error) {
          this.logger.error('⚠️ Error preserving consumer group:', error);
        }
      }
      
      // Obtener todas las claves excepto el stream que queremos preservar
      const allKeys = await this.redisService.client.keys('*');
      const keysToDelete = allKeys.filter(key => key !== streamKey);
      
      // Eliminar todas las demás claves si hay alguna
      if (keysToDelete.length > 0) {
        await this.redisService.client.del(...keysToDelete);
        this.logger.info(`✅ Cleared ${keysToDelete.length} keys from Redis`);
      } else {
        this.logger.info('ℹ️ No additional keys to clear');
      }
      
      // Limpiar específicamente las claves principales de la sesión
      const sessionKey = config.mylaps.defaultSessionKey;
      
      // Limpiar claves específicas por patrones más detallados
      const patternsToClear = [
        `${sessionKey}:*`,        // Todas las claves con prefijo de sesión
        'driver:*',               // Datos de conductores
        'drivers:*',              // Otra estructura de conductores
        'leaderboard:*',          // Datos de leaderboard
        'default:leaderboard:*',  // Datos de leaderboard con prefijo
        'lap:*',                  // Datos de vueltas
        'session:*'               // Datos de sesión
      ];
      
      // Eliminar las claves por cada patrón
      for (const pattern of patternsToClear) {
        const keys = await this.redisService.client.keys(pattern);
        if (keys.length > 0) {
          await this.redisService.client.del(...keys);
          this.logger.info(`✅ Cleared ${keys.length} keys matching: ${pattern}`);
        }
      }
      
      this.logger.info('✅ Redis data cleared for simulation (consumer group preserved)');
      return true;
    } catch (error) {
      this.logger.error('❌ Error safely clearing Redis data:', error.message);
      return false;
    }
  }

  stop() {
    this.logger.info('🛑 Stopping RAW MYLAPS simulator...');
    this.isRunning = false;
    
    if (this.intervalId) {
      clearTimeout(this.intervalId);
      this.intervalId = null;
    }
  }
}

module.exports = DataSimulator;
