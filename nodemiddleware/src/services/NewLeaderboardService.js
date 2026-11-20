/**
 * NewLeaderboardService.js
 * NUEVA ESTRUCTURA UNIFICADA DEL LEADERBOARD
 * Estructura: {S}:leaderboard:{position}: con datos unificados dentro de la sesión
 */
const KeyGenerator = require('../utils/KeyGenerator');
const RidService = require('./RidService');
const LoggerUtils = require('../utils/LoggerUtils');

class NewLeaderboardService {
  constructor(redisClient, logger = console, sessionKey = 'default') {
    this.redis = redisClient;
    this.logger = logger;
    this.sessionKey = sessionKey;
    this.keyGen = new KeyGenerator(sessionKey);
    this.ridService = new RidService(redisClient, sessionKey);
  }

  /**
   * MÉTODO SIMPLIFICADO: Solo actualiza leaderboard (no state)
   * Llamado por DriverService después de actualizar state
   * @param {Object} driverData - Datos completos del driver
   */
  async updateDriverLeaderboardOnly(driverData) {
    try {
      const { 
        position, 
        driverid, 
        registration,
        number, 
        first_name, 
        last_name, 
        nationality, 
        class_number,
        transponder_id,
        laps, 
        best_ms, 
        best_lap,
        total_ms,
        last_total_ms
      } = driverData;

      if (!position || !driverid) {
        throw new Error('Position and driverid are required');
      }

      // 1. Crear key unificada del leaderboard
      const driverKey = this.keyGen.leaderboardDriver(position);
      
      // 2. Datos unificados (catalog + state) para leaderboard
      const unifiedData = {
        // Info básica
        driverid,
        position: parseInt(position),
        registration: registration || driverid,
        number: number || registration || driverid,
        
        // Datos personales
        first_name: first_name || '',
        last_name: last_name || '',
        name: `${first_name || ''} ${last_name || ''}`.trim() || `Driver ${driverid}`,
        nationality: nationality || '',
        class: parseInt(class_number) || 0,
        transponder_id: parseInt(transponder_id) || 0,
        
        // Estado de carrera
        laps: parseInt(laps) || 0,
        best_ms: parseInt(best_ms) || 0,
        best_lap: parseInt(best_lap) || 0,
        total_ms: parseInt(total_ms) || 0,
        last_total_ms: parseInt(last_total_ms) || 0,
        
        // Metadatos
        updated_at_ms: Date.now(),
        updated_at_iso: new Date().toISOString()
      };

      // 3. Guardar datos unificados en leaderboard
      await this.redis.hset(driverKey, unifiedData);

      // 4. Actualizar ranking (ZSET para ordenamiento)
      const rankingKey = this.keyGen.leaderboardRanking();
      await this.redis.zadd(rankingKey, position, driverid);

      this.logger.info(`✅ Driver updated in leaderboard only: ${unifiedData.name} (${driverid}) - P${position}`);

      // Se eliminó la notificación directa a NodeCG
      // La notificación se maneja exclusivamente desde RedisService

      return { 
        success: true, 
        driverid, 
        position: parseInt(position),
        key: driverKey
      };

    } catch (error) {
      this.logger.error(`❌ Error updating driver in leaderboard only:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Registra un nuevo driver (desde $A o $COMP)
   * @param {Object} driverData - Datos del driver
   */
  async registerDriver(driverData) {
    try {
      const { registration, transponder_id, number, first_name, last_name, nationality, class_number } = driverData;

      // Usar registration como driverid para nueva estructura
      const driverid = registration;
      
      // Buscar si ya tiene posición asignada
      const rankingKey = this.keyGen.leaderboardRanking();
      let position = await this.redis.zscore(rankingKey, driverid);
      
      // Si es nuevo driver, asignar la siguiente posición disponible
      if (!position) {
        const currentCount = await this.redis.zcard(rankingKey);
        position = currentCount + 1; // Nueva posición al final
      }

      return await this.updateDriverLeaderboardOnly({
        position,
        driverid,
        registration,
        number,
        first_name,
        last_name,
        nationality,
        class_number,
        transponder_id,
        laps: 0,
        best_ms: 0,
        best_lap: 0,
        total_ms: 0,
        last_total_ms: 0
      });

    } catch (error) {
      this.logger.error(`❌ Error registering driver in new leaderboard:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Actualiza posición de un driver
   * @param {string} driverid - ID del driver
   * @param {number} newPosition - Nueva posición
   * @param {Object} additionalData - Datos adicionales para actualizar
   */
  async updatePosition(driverid, newPosition, additionalData = {}) {
    try {
      // 1. Obtener datos actuales del driver
      const currentDriver = await this.getDriver(driverid);
      if (!currentDriver) {
        // Si no existe el driver, intentar obtener datos completos del state primero
        let driverStateData = {};
        const rid = await this.ridService.getOrCreateRid(driverid);
        if (rid) {
          const stateKey = this.keyGen.driverState(rid);
          driverStateData = await this.redis.hgetall(stateKey);
        }
        
        // Si no hay datos en state, intentar obtener del catálogo como fallback
        let catalogData = {};
        if (rid && Object.keys(driverStateData).length === 0) {
          const catalogKey = this.keyGen.driverCatalog(rid);
          catalogData = await this.redis.hgetall(catalogKey);
        }
        
        // Crear driver con datos completos (prioridad: state > catalog > defaults)
        const newDriverData = {
          position: newPosition,
          driverid,
          registration: driverStateData.registration || catalogData.registration || driverid,
          number: driverStateData.number || catalogData.number || driverid,
          first_name: driverStateData.first_name || catalogData.first_name || '',
          last_name: driverStateData.last_name || catalogData.last_name || '',
          name: driverStateData.name || catalogData.name || `${driverStateData.first_name || ''} ${driverStateData.last_name || ''}`.trim() || `Driver ${driverid}`,
          nationality: driverStateData.nationality || catalogData.nationality || '',
          class_number: parseInt(driverStateData.class) || parseInt(catalogData.class) || 0,
          transponder_id: parseInt(driverStateData.transponder_id) || parseInt(catalogData.transponder_id) || 0,
          laps: parseInt(driverStateData.laps) || 0,
          best_ms: parseInt(driverStateData.best_ms) || 0,
          best_lap: parseInt(driverStateData.best_lap) || 0,
          total_ms: parseInt(driverStateData.total_ms) || 0,
          last_total_ms: parseInt(driverStateData.last_total_ms) || 0,
          ...additionalData // Permitir override con datos adicionales
        };
        
        this.logger.info(`✨ Creating new driver in leaderboard: ${driverid} at position ${newPosition} with complete data`);
        return await this.updateDriverLeaderboardOnly(newDriverData);
      }

      // 2. Remover de posición anterior si existe
      if (currentDriver.position && currentDriver.position !== newPosition) {
        const oldKey = this.keyGen.leaderboardDriver(currentDriver.position);
        await this.redis.del(oldKey);
      }

      // 3. Actualizar con nueva posición
      const updatedData = {
        ...currentDriver,
        ...additionalData,
        position: newPosition
      };

      return await this.updateDriverLeaderboardOnly(updatedData);

    } catch (error) {
      this.logger.error(`❌ Error updating position for ${driverid}:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtiene datos completos de un driver
   * @param {string} driverid - ID del driver
   */
  async getDriver(driverid) {
    try {
      // Buscar en ranking para obtener posición actual
      const rankingKey = this.keyGen.leaderboardRanking();
      const position = await this.redis.zscore(rankingKey, driverid);
      
      if (!position) {
        return null;
      }

      const driverKey = this.keyGen.leaderboardDriver(position);
      const driverData = await this.redis.hgetall(driverKey);
      
      if (!driverData || Object.keys(driverData).length === 0) {
        return null;
      }

      // Verificar que el driver en esa posición es el que buscamos
      if (driverData.driverid !== driverid) {
        return null;
      }

      // Convertir strings a números donde corresponda
      return {
        ...driverData,
        position: parseInt(driverData.position),
        class: parseInt(driverData.class) || 0,
        laps: parseInt(driverData.laps) || 0,
        best_ms: parseInt(driverData.best_ms) || 0,
        best_lap: parseInt(driverData.best_lap) || 0,
        total_ms: parseInt(driverData.total_ms) || 0,
        transponder_id: parseInt(driverData.transponder_id) || 0
      };

    } catch (error) {
      this.logger.error(`❌ Error getting driver ${driverid}:`, error);
      return null;
    }
  }

  /**
   * Obtiene el leaderboard completo ordenado
   * @param {number} limit - Límite de resultados
   */
  async getLeaderboard(limit = 50) {
    try {
      const rankingKey = this.keyGen.leaderboardRanking();
      const rankings = await this.redis.zrange(rankingKey, 0, limit - 1, 'WITHSCORES');
      
      const leaderboard = [];
      for (let i = 0; i < rankings.length; i += 2) {
        const driverid = rankings[i];
        const position = parseInt(rankings[i + 1]);
        
        // Obtener datos directamente por posición
        const driverKey = this.keyGen.leaderboardDriver(position);
        const driverData = await this.redis.hgetall(driverKey);
        
        if (driverData && Object.keys(driverData).length > 0) {
          // Convertir strings a números donde corresponda
          const processedData = {
            ...driverData,
            position: parseInt(driverData.position),
            class: parseInt(driverData.class) || 0,
            laps: parseInt(driverData.laps) || 0,
            best_ms: parseInt(driverData.best_ms) || 0,
            best_lap: parseInt(driverData.best_lap) || 0,
            total_ms: parseInt(driverData.total_ms) || 0,
            transponder_id: parseInt(driverData.transponder_id) || 0
          };
          
          leaderboard.push(processedData);
        }
      }

      // Ordenar por posición (por si acaso)
      leaderboard.sort((a, b) => a.position - b.position);
      
      return leaderboard;

    } catch (error) {
      this.logger.error(`❌ Error getting leaderboard:`, error);
      return [];
    }
  }

  /**
   * Lista todos los drivers por clase
   * @param {number} classId - ID de la clase
   */
  async getDriversByClass(classId) {
    try {
      const fullLeaderboard = await this.getLeaderboard(200); // Obtener más drivers
      return fullLeaderboard.filter(driver => driver.class === classId);
    } catch (error) {
      this.logger.error(`❌ Error getting drivers by class ${classId}:`, error);
      return [];
    }
  }

  /**
   * Este método ha sido eliminado.
   * Todas las notificaciones a NodeCG ahora se manejan exclusivamente 
   * a través de RedisService para centralizar y estandarizar el proceso.
   */

  /**
   * Obtiene datos del driver desde state (redundancia)
   * @param {string} driverid - ID del driver
   */
  async getDriverState(driverid) {
    try {
      const stateKey = this.keyGen.driverState(driverid);
      const stateData = await this.redis.hgetall(stateKey);
      
      if (Object.keys(stateData).length === 0) {
        return null;
      }

      // Convertir campos numéricos
      return {
        ...stateData,
        position: parseInt(stateData.position) || 0,
        laps: parseInt(stateData.laps) || 0,
        best_ms: parseInt(stateData.best_ms) || 0,
        best_lap: parseInt(stateData.best_lap) || 0,
        total_ms: parseInt(stateData.total_ms) || 0,
        last_total_ms: parseInt(stateData.last_total_ms) || 0,
        class: parseInt(stateData.class) || 0,
        transponder_id: parseInt(stateData.transponder_id) || 0,
        updated_at_ms: parseInt(stateData.updated_at_ms) || 0
      };
    } catch (error) {
      this.logger.error(`❌ Error getting driver state for ${driverid}:`, error);
      return null;
    }
  }

  /**
   * NUEVO: Actualiza un campo específico del leaderboard si el driver ya está posicionado
   * @param {string} driverid - ID del driver
   * @param {Object} fieldUpdates - Objeto con los campos a actualizar {fieldName: fieldValue}
   * @returns {Promise<Object>} - Resultado de la operación
   */
  async updateLeaderboardField(driverid, fieldUpdates) {
    try {
      // 1. Verificar si el driver ya está en el leaderboard
      const rankingKey = this.keyGen.leaderboardRanking();
      const currentPosition = await this.redis.zscore(rankingKey, driverid);
      
      if (!currentPosition) {
        // Driver no está en leaderboard, no hacer nada
        this.logger.debug(`🔄 Driver ${driverid} not in leaderboard, skipping field update`);
        return { success: true, updated: false, reason: 'driver_not_in_leaderboard' };
      }

      // 2. Obtener datos actuales del driver en leaderboard
      const driverKey = this.keyGen.leaderboardDriver(currentPosition);
      const currentData = await this.redis.hgetall(driverKey);
      
      if (!currentData || Object.keys(currentData).length === 0) {
        this.logger.warn(`⚠️ Driver ${driverid} has position but no leaderboard data`);
        return { success: false, error: 'no_leaderboard_data' };
      }

      // 3. Actualizar solo los campos especificados
      const updates = {};
      Object.entries(fieldUpdates).forEach(([field, value]) => {
        updates[field] = String(value);
      });
      
      // Agregar metadatos de actualización
      updates.updated_at_ms = String(Date.now());
      updates.updated_at_iso = new Date().toISOString();

      // 4. Aplicar actualizaciones
      await this.redis.hset(driverKey, updates);

      this.logger.info(`✅ Leaderboard field updated for ${driverid} at P${currentPosition}: ${Object.keys(fieldUpdates).join(', ')}`);

      // Se eliminó la notificación directa a NodeCG
      // La notificación se maneja exclusivamente desde RedisService

      return { 
        success: true, 
        updated: true, 
        position: parseInt(currentPosition),
        fields: Object.keys(fieldUpdates),
        driverid 
      };

    } catch (error) {
      this.logger.error(`❌ Error updating leaderboard field for ${driverid}:`, error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = NewLeaderboardService;
