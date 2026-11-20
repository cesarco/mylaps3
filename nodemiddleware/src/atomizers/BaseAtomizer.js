/**
 * BaseAtomizer.js
 * Clase base para atomizers - servicios modulares que procesan mensajes específicos
 * y actualizan la estructura Redis OFICIAL según las instrucciones
 * 
 * ARQUITECTURA ATOMICA:
 * - Cada atomizer maneja UN tipo de mensaje específico
 * - Actualiza SOLO en la estructura Redis oficial (race:{S}:*)
 * - Usa AtomizerKeyGenerator INDEPENDIENTE del sistema legacy
 * - Trabaja en paralelo con los servicios legacy SIN AFECTARLOS
 * - Usa scripts Lua específicos para operaciones atómicas
 */

const AtomizerKeyGenerator = require('../utils/AtomizerKeyGenerator');
const fs = require('fs');
const path = require('path');

class BaseAtomizer {
  constructor(serviceRegistry, logger = console) {
    this.serviceRegistry = serviceRegistry;
    this.logger = logger;
    this.messageTypes = []; // Array de tipos de mensaje que maneja este atomizer
    
    // Servicios comunes que todos los atomizers necesitan
    this.driverService = serviceRegistry?.getDriverService();
    this.ridService = serviceRegistry?.getRidService();
    this.redis = serviceRegistry?.redis;
    
    // DebugLogger para logging de warnings y undefined fields
    this.debugLogger = serviceRegistry?.getDebugLogger();
    
    // AtomizerKeyGenerator INDEPENDIENTE para nueva arquitectura
    this.keyGen = new AtomizerKeyGenerator(serviceRegistry?.sessionKey || 'default');
    
    // DUAL WRITE: También necesitamos acceso al KeyGenerator legacy para escritura dual
    this.legacyKeyGen = serviceRegistry?.keyGen;
    
    // Cache para scripts Lua
    this.luaScripts = new Map();
    
    if (!this.redis) {
      throw new Error('BaseAtomizer requires Redis client from serviceRegistry');
    }
  }

  /**
   * Método principal que debe implementar cada atomizer
   * @param {Object} messageData - Datos del mensaje parseado
   * @returns {Promise<Object>} - Resultado de la operación
   */
  async atomize(messageData) {
    throw new Error('Method atomize() must be implemented by subclass');
  }

  /**
   * Verifica si este atomizer puede manejar el tipo de mensaje
   * @param {string} messageType - Tipo de mensaje ($A, $J, $H, etc.)
   * @returns {boolean}
   */
  canHandle(messageType) {
    return this.messageTypes.includes(messageType);
  }

  /**
   * Actualiza datos en driver:catalog usando AMBAS estructuras (vieja y nueva)
   * @param {string} rid - RID del driver
   * @param {Object} catalogData - Datos para el catálogo (first_name, last_name, etc.)
   * @returns {Promise<boolean>} - true si se actualizó, false si no
   */
  async updateDriverCatalog(rid, catalogData) {
    try {
      // Convertir datos a formato string para Redis
      const redisData = {};
      Object.entries(catalogData).forEach(([key, value]) => {
        redisData[key] = String(value);
      });
      
      // ESTRUCTURA NUEVA (race:default:driver:X:catalog) - usando AtomizerKeyGenerator
      const newCatalogKey = this.keyGen.driverCatalog(rid);
      await this.redis.hset(newCatalogKey, redisData);
      
      // ESTRUCTURA VIEJA (default:driver:X:catalog) - usando KeyGenerator legacy
      if (this.legacyKeyGen) {
        const oldCatalogKey = this.legacyKeyGen.driverCatalog(rid);
        await this.redis.hset(oldCatalogKey, redisData);
      }
      
      this.logger.debug(`🔄 [${this.constructor.name}] Updated catalog for RID ${rid} (BOTH structures)`, catalogData);
      return true;
      
    } catch (error) {
      this.logger.error(`❌ [${this.constructor.name}] Error updating catalog for RID ${rid}:`, error);
      return false;
    }
  }  /**
   * Actualiza datos en driver:state usando AMBAS estructuras (vieja y nueva)
   * @param {string} rid - RID del driver
   * @param {Object} stateData - Datos para el estado
   * @returns {Promise<boolean>} - true si se actualizó, false si no
   */
  async updateDriverState(rid, stateData) {
    try {
      // Convertir datos a formato string para Redis
      const redisData = {};
      Object.entries(stateData).forEach(([key, value]) => {
        redisData[key] = String(value);
      });
      
      // ESTRUCTURA NUEVA (race:default:driver:X:state) - usando AtomizerKeyGenerator
      const newStateKey = this.keyGen.driverState(rid);
      await this.redis.hset(newStateKey, redisData);
      
      // ESTRUCTURA VIEJA (default:driver:X:state) - usando KeyGenerator legacy
      if (this.legacyKeyGen) {
        const oldStateKey = this.legacyKeyGen.driverState(rid);
        await this.redis.hset(oldStateKey, redisData);
      }
      
      this.logger.debug(`🔄 [${this.constructor.name}] Updated state for RID ${rid} (BOTH structures)`, stateData);
      return true;
      
    } catch (error) {
      this.logger.error(`❌ [${this.constructor.name}] Error updating state for RID ${rid}:`, error);
      return false;
    }
  }

  /**
   * Actualiza standings por posición (AMBAS estructuras - vieja y nueva)
   * @param {string} rid - RID del driver
   * @param {number} position - Posición en la carrera
   * @returns {Promise<boolean>}
   */
  async updatePositionStandings(rid, position) {
    try {
      // Validar que position sea un número válido
      if (typeof position !== 'number' || isNaN(position) || position <= 0) {
        this.logger.error(`❌ [${this.constructor.name}] Invalid position value: ${position} (type: ${typeof position})`);
        return false;
      }
      
      // ESTRUCTURA NUEVA (race:default:pos) - usando AtomizerKeyGenerator
      const newPosKey = this.keyGen.posStandings();
      await this.redis.zadd(newPosKey, position, rid);
      
      // ESTRUCTURA VIEJA (default:pos) - usando KeyGenerator legacy
      if (this.legacyKeyGen) {
        const oldPosKey = this.legacyKeyGen.posStandings();
        await this.redis.zadd(oldPosKey, position, rid);
      }
      
      this.logger.debug(`🔄 [${this.constructor.name}] Updated position standings: RID ${rid} → P${position} (BOTH structures)`);
      return true;
      
    } catch (error) {
      this.logger.error(`❌ [${this.constructor.name}] Error updating position standings:`, error);
      return false;
    }
  }

  /**
   * Actualiza standings por mejor vuelta (AMBAS estructuras - vieja y nueva)
   * @param {string} rid - RID del driver
   * @param {number} bestTimeMs - Mejor tiempo en milisegundos
   * @returns {Promise<boolean>}
   */
  async updateBestStandings(rid, bestTimeMs) {
    try {
      // Validar que bestTimeMs sea un número válido
      if (typeof bestTimeMs !== 'number' || isNaN(bestTimeMs) || bestTimeMs <= 0) {
        this.logger.error(`❌ [${this.constructor.name}] Invalid best time value: ${bestTimeMs} (type: ${typeof bestTimeMs})`);
        return false;
      }
      
      // ESTRUCTURA NUEVA (race:default:best) - usando AtomizerKeyGenerator
      const newBestKey = this.keyGen.bestStandings();
      await this.redis.zadd(newBestKey, bestTimeMs, rid);
      
      // ESTRUCTURA VIEJA (default:best) - usando KeyGenerator legacy
      if (this.legacyKeyGen) {
        const oldBestKey = this.legacyKeyGen.bestStandings();
        await this.redis.zadd(oldBestKey, bestTimeMs, rid);
      }
      
      this.logger.debug(`🔄 [${this.constructor.name}] Updated best standings: RID ${rid} → ${bestTimeMs}ms (BOTH structures)`);
      return true;
      
    } catch (error) {
      this.logger.error(`❌ [${this.constructor.name}] Error updating best standings:`, error);
      return false;
    }
  }

  /**
   * Agrega una vuelta histórica (AMBAS estructuras - vieja y nueva)
   * @param {string} rid - RID del driver
   * @param {Object} lapData - Datos de la vuelta
   * @returns {Promise<boolean>}
   */
  async addHistoricalLap(rid, lapData) {
    try {
      // Convertir datos a formato string para Redis
      const redisLapData = {};
      Object.entries(lapData).forEach(([key, value]) => {
        redisLapData[key] = String(value);
      });
      
      // ESTRUCTURA NUEVA (race:default:driver:X:laps) - usando AtomizerKeyGenerator
      const newLapsKey = this.keyGen.driverLaps(rid);
      const lapNumber = lapData.lap_number || await this.redis.hlen(newLapsKey) + 1;
      await this.redis.hset(newLapsKey, lapNumber, JSON.stringify(redisLapData));
      
      // ESTRUCTURA VIEJA (default:driver:X:laps) - formato directo como en PassingsService
      const sessionKey = this.serviceRegistry?.sessionKey || 'default';
      const oldLapsKey = `${sessionKey}:driver:${rid}:laps`;
      await this.redis.hset(oldLapsKey, lapNumber, JSON.stringify(redisLapData));
      
      this.logger.debug(`🔄 [${this.constructor.name}] Added historical lap: RID ${rid} lap ${lapNumber} (BOTH structures)`);
      return true;
      
    } catch (error) {
      this.logger.error(`❌ [${this.constructor.name}] Error adding historical lap:`, error);
      return false;
    }
  }

  /**
   * Agrega evento a stream de passings (AMBAS estructuras - vieja y nueva)
   * @param {Object} passingData - Datos del passing
   * @returns {Promise<boolean>}
   */
  async addPassingEvent(passingData) {
    try {
      // Convertir datos para XADD - Redis XADD requiere pares field-value como argumentos separados
      const streamArgs = [];
      Object.entries(passingData).forEach(([key, value]) => {
        streamArgs.push(key, String(value));
      });
      
      // ESTRUCTURA NUEVA (race:default:x:pass) - usando AtomizerKeyGenerator
      const newPassStreamKey = this.keyGen.passStream();
      await this.redis.xadd(newPassStreamKey, '*', ...streamArgs);
      
      // ESTRUCTURA VIEJA (default:x:pass) - usando KeyGenerator legacy
      if (this.legacyKeyGen) {
        const oldPassStreamKey = this.legacyKeyGen.passStream();
        await this.redis.xadd(oldPassStreamKey, '*', ...streamArgs);
      }
      
      this.logger.debug(`🔄 [${this.constructor.name}] Added passing event (BOTH structures)`, passingData);
      return true;
      
    } catch (error) {
      this.logger.error(`❌ [${this.constructor.name}] Error adding passing event:`, error);
      return false;
    }
  }

  /**
   * Publica notificación en canales Pub/Sub (AMBAS estructuras - vieja y nueva)
   * @param {string} channel - Canal (flag, pos, best, pass, session, event, correction)
   * @param {Object} notification - Datos de notificación
   * @returns {Promise<boolean>}
   */
  async publishNotification(channel, notification) {
    try {
      let newChannelKey, oldChannelKey;
      
      switch (channel) {
        case 'flag':
          newChannelKey = this.keyGen.flagChannel();
          oldChannelKey = this.legacyKeyGen ? this.legacyKeyGen.flagChannel() : null;
          break;
        case 'pos':
          newChannelKey = this.keyGen.posChannel();
          oldChannelKey = this.legacyKeyGen ? this.legacyKeyGen.posChannel() : null;
          break;
        case 'best':
          newChannelKey = this.keyGen.bestChannel();
          oldChannelKey = this.legacyKeyGen ? this.legacyKeyGen.bestChannel() : null;
          break;
        case 'pass':
          newChannelKey = this.keyGen.passChannel();
          oldChannelKey = this.legacyKeyGen ? this.legacyKeyGen.passChannel() : null;
          break;
        case 'session':
          newChannelKey = this.keyGen.sessionChannel();
          oldChannelKey = this.legacyKeyGen ? this.legacyKeyGen.sessionChannel() : null;
          break;
        case 'event':
          newChannelKey = this.keyGen.eventChannel();
          oldChannelKey = this.legacyKeyGen ? this.legacyKeyGen.eventChannel() : null;
          break;
        case 'correction':
          newChannelKey = this.keyGen.correctionChannel();
          oldChannelKey = this.legacyKeyGen ? this.legacyKeyGen.correctionChannel() : null;
          break;
        default:
          this.logger.warning(`❌ [${this.constructor.name}] Unknown channel: ${channel}`);
          return false;
      }
      
      const message = JSON.stringify(notification);
      
      // Publicar en ESTRUCTURA NUEVA
      await this.redis.publish(newChannelKey, message);
      
      // Publicar en ESTRUCTURA VIEJA (si existe legacyKeyGen)
      if (oldChannelKey) {
        await this.redis.publish(oldChannelKey, message);
      }
      
      this.logger.debug(`🔄 [${this.constructor.name}] Published notification to ${channel} (BOTH structures)`, notification);
      return true;
      
    } catch (error) {
      this.logger.error(`❌ [${this.constructor.name}] Error publishing notification:`, error);
      return false;
    }
  }

  /**
   * Resuelve RID usando RidService (obliga a usar el servicio oficial)
   * @param {string} registration - Registration del driver
   * @returns {Promise<string|null>} - RID resuelto o null
   */
  async resolveRid(registration) {
    try {
      if (!this.ridService) {
        this.logger.error(`❌ [${this.constructor.name}] RidService not available`);
        return null;
      }
      
      const rid = await this.ridService.getOrCreateRid(registration);
      return rid;
      
    } catch (error) {
      this.logger.error(`❌ [${this.constructor.name}] Error resolving RID for ${registration}:`, error);
      return null;
    }
  }

  /**
   * Obtiene el nombre de los tipos de mensaje que maneja
   * @returns {Array<string>}
   */
  getMessageTypes() {
    return this.messageTypes;
  }

  /**
   * Logs para debugging del atomizer
   */
  logAtomizerInfo(operation, target, details = {}) {
    this.logger.info(`⚛️ [${this.constructor.name}] ${operation} for ${target}`, details);
  }

  /**
   * Carga un script Lua desde el directorio de atomizers
   * @param {string} scriptName - Nombre del script (sin extensión .lua)
   * @returns {Promise<string>} - SHA del script cargado
   */
  async loadLuaScript(scriptName) {
    try {
      // Verificar si ya está en cache
      if (this.luaScripts.has(scriptName)) {
        return this.luaScripts.get(scriptName);
      }

      // Cargar script desde archivo
      const scriptPath = path.join(__dirname, '../../lua/atomizers', `${scriptName}.lua`);
      
      if (!fs.existsSync(scriptPath)) {
        throw new Error(`Lua script not found: ${scriptPath}`);
      }

      const scriptContent = fs.readFileSync(scriptPath, 'utf8');
      
      // Cargar script en Redis y obtener SHA
      const sha = await this.redis.script('LOAD', scriptContent);
      
      // Guardar en cache
      this.luaScripts.set(scriptName, sha);
      
      this.logger.debug(`📜 [${this.constructor.name}] Loaded Lua script: ${scriptName} (SHA: ${sha.substring(0, 8)}...)`);
      
      return sha;

    } catch (error) {
      this.logger.error(`❌ [${this.constructor.name}] Error loading Lua script ${scriptName}:`, error);
      throw error;
    }
  }

  /**
   * Ejecuta un script Lua atomizer
   * @param {string} scriptName - Nombre del script
   * @param {Array} keys - Array de keys de Redis
   * @param {Array} args - Array de argumentos
   * @returns {Promise<Object>} - Resultado del script
   */
  async executeLuaScript(scriptName, keys = [], args = []) {
    try {
      // Cargar script si no está en cache
      const sha = await this.loadLuaScript(scriptName);
      
      // Ejecutar script
      const result = await this.redis.evalsha(sha, keys.length, ...keys, ...args);
      
      this.logger.debug(`📜 [${this.constructor.name}] Executed Lua script: ${scriptName}`, {
        keys: keys.length,
        args: args.length,
        success: result?.success || false
      });

      return result;

    } catch (error) {
      // Si el script no está cargado, intentar cargarlo de nuevo
      if (error.message.includes('NOSCRIPT')) {
        this.logger.debug(`📜 [${this.constructor.name}] Script not in Redis cache, reloading: ${scriptName}`);
        this.luaScripts.delete(scriptName); // Limpiar cache
        return await this.executeLuaScript(scriptName, keys, args); // Reintentar
      }

      this.logger.error(`❌ [${this.constructor.name}] Error executing Lua script ${scriptName}:`, error);
      throw error;
    }
  }
}

module.exports = BaseAtomizer;

module.exports = BaseAtomizer;
