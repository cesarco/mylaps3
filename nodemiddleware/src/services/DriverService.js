/**
 * DriverService.js
 * Servicio especializado para manejo de pilotos
 * Implementa especificación Redis_RMonitor_Middleware.md para $A / $COMP
 */
const KeyGenerator = require('../utils/KeyGenerator');
const RidService = require('./RidService');
const TimeUtils = require('../utils/TimeUtils');

class DriverService {
  constructor(redisClient, logger = console, sessionKey = 'default', newLeaderboardService = null) {
    this.redis = redisClient;
    this.logger = logger;
    this.sessionKey = sessionKey;
    
    this.keyGen = new KeyGenerator(sessionKey);
    this.ridService = new RidService(redisClient, sessionKey);
    this.newLeaderboardService = newLeaderboardService;
  }

  /**
   * Registra un nuevo piloto según especificación
   * HSET race:{S}:driver:{rid}:catalog + HSET race:{S}:rid
   * @param {Object} driverData - Datos del piloto parseados
   * @param {boolean} checkExistingRid - Si debe verificar primero si ya existe un RID para este piloto
   */
  async registerDriver(driverData, checkExistingRid = false) {
    try {
      const { registration, transponder_id, number, first_name, last_name, nationality, class_number } = driverData;

      // Opcionalmente, verificar si ya existe un RID para este piloto
      let existingRid = null;
      if (checkExistingRid) {
        try {
          const ridMappingKey = this.keyGen.ridMapping();
          const oldRidMappingKey = `${this.sessionKey}:rid`;
          
          existingRid = await this.redis.hget(ridMappingKey, registration);
          if (!existingRid) {
            existingRid = await this.redis.hget(oldRidMappingKey, registration);
          }
        } catch (err) {
          this.logger.debug(`Error verificando RID existente: ${err.message}`);
        }
      }

      // Usar método centralizado para registrar driver completo
      const result = await this.updateDriverCentralized({
        driverid: registration,
        rid: existingRid ? parseInt(existingRid) : undefined,
        registration: registration,
        number: number || registration,
        first_name: first_name || '',
        last_name: last_name || '',
        nationality: nationality || '',
        class_number: parseInt(class_number) || 0,
        transponder_id: parseInt(transponder_id) || 0
      });

      if (!result.success) {
        throw new Error(result.error);
      }

      // Mapeo reg → rid en race:{S}:rid según especificación
      const ridMappingKey = this.keyGen.ridMapping();
      await this.redis.hset(ridMappingKey, registration, result.rid);

      const fullName = this.buildFullName(first_name, last_name, registration);
      
      // Registrar información del transponder (o su ausencia)
      if (transponder_id) {
        this.logger.info(`✅ Driver registered: ${fullName} (#${number}) - RID: ${result.rid}, Transponder: ${transponder_id}`);
      } else {
        this.logger.info(`✅ Driver registered: ${fullName} (#${number}) - RID: ${result.rid}, Transponder: undefined - Using COMP message format`);
        // Note: DebugLogger será manejado en nivel superior por MessageProcessor
      }

      // Notificar a NodeCG sobre nuevo piloto registrado
      await this.notifyNodeCG('driver');

      return { success: true, rid: result.rid, fullName };

    } catch (error) {
      this.logger.error(`❌ Error registering driver:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtiene un driver por RID
   * @param {string} rid - RID (ID interno) del piloto
   * @returns {Object} - Datos del piloto o null si no existe
   */
  async getDriverByRid(rid) {
    try {
      const catalogKey = this.keyGen.driverCatalog(rid);
      const driverData = await this.redis.hgetall(catalogKey);
      
      if (!driverData || Object.keys(driverData).length === 0) {
        return null;
      }
      
      return driverData;
    } catch (error) {
      this.logger.error(`❌ Error obteniendo piloto por RID ${rid}:`, error);
      return null;
    }
  }
  
  /**
   * Obtiene driver por registration
   * @param {string} registration - Registration del piloto
   * @returns {Object} - Datos del piloto o null si no existe
   */
  async getDriverByRegistration(registration) {
    try {
      const ridMappingKey = this.keyGen.ridMapping();
      const rid = await this.redis.hget(ridMappingKey, registration);
      
      if (!rid) {
        return null;
      }
      
      return await this.getDriverByRid(rid);
    } catch (error) {
      this.logger.error(`❌ Error obteniendo piloto por registration ${registration}:`, error);
      return null;
    }
  }
  
  /**
   * Lista todos los drivers
   * @param {number} limit - Límite de resultados (por defecto 100)
   * @returns {Array} - Lista de RIDs
   */
  async listAllDrivers(limit = 100) {
    try {
      const ridMappingKey = this.keyGen.ridMapping();
      const mapping = await this.redis.hgetall(ridMappingKey);
      
      const results = [];
      for (const [registration, rid] of Object.entries(mapping)) {
        if (results.length >= limit) break;
        results.push({
          rid,
          registration
        });
      }
      
      return results;
    } catch (error) {
      this.logger.error(`❌ Error listando pilotos:`, error);
      return [];
    }
  }

  /**
   * Obtiene el estado actual de un piloto
   * @param {string} rid - RID del piloto
   * @returns {Object} - Estado del piloto o null si no existe
   */
  async getDriverState(rid) {
    try {
      const stateKey = this.keyGen.driverState(rid);
      return await this.redis.hgetall(stateKey);
    } catch (error) {
      this.logger.error(`❌ Error obteniendo estado del piloto ${rid}:`, error);
      return null;
    }
  }

  /**
   * Construye el nombre completo del driver
   * @param {string} firstName - Nombre
   * @param {string} lastName - Apellido  
   * @param {string} fallback - Valor por defecto
   * @returns {string} - Nombre completo
   */
  buildFullName(firstName, lastName, fallback) {
    const fullName = `${firstName || ''} ${lastName || ''}`.trim();
    return fullName || `Driver ${fallback}`;
  }

  /**
   * MÉTODO CENTRALIZADO: Actualiza información completa de un driver
   * Este método debe ser usado por otros servicios en lugar de actualizar state directamente
   * @param {Object} updateData - Datos a actualizar
   * @returns {Promise<Object>} - Resultado de la operación
   */
  async updateDriverCentralized(updateData) {
    const {
      driverid,
      rid,
      // Datos de timing (desde LapService, PassingsService)
      best_ms,
      best_lap,
      laps,
      total_ms,
      last_total_ms,
      // Datos de catalog (desde DriverService)
      registration,
      number,
      first_name,
      last_name,
      nationality,
      class_number,
      transponder_id,
      // Datos de posición (desde posiciones)
      position
    } = updateData;

    try {
      // 1. Obtener RID si no se proporciona
      let resolvedRid = rid;
      if (!resolvedRid && driverid) {
        // Si ya existe un RID para este driver, usarlo en lugar de crear uno nuevo
        const ridMappingKey = this.keyGen.ridMapping();
        const oldRidMappingKey = `${this.sessionKey}:rid`;
        
        let existingRid = null;
        try {
          existingRid = await this.redis.hget(ridMappingKey, driverid);
          if (!existingRid) {
            existingRid = await this.redis.hget(oldRidMappingKey, driverid);
          }
          if (existingRid) {
            resolvedRid = parseInt(existingRid);
            this.logger.debug(`Usando RID existente ${resolvedRid} para driver ${driverid}`);
          }
        } catch (err) {
          this.logger.debug(`Error verificando RID existente: ${err.message}`);
        }
        
        // Si todavía no hay RID, obtener o crear uno nuevo
        if (!resolvedRid) {
          resolvedRid = await this.ridService.getOrCreateRid(driverid);
        }
      }
      
      if (!resolvedRid) {
        this.logger.warn(`❌ No se pudo resolver RID para driverid: ${driverid}`);
        return { success: false, error: 'No RID found' };
      }

      // 2. Obtener datos actuales del driver para merge
      let currentDriver = {};
      const currentStateKey = this.keyGen.driverState(resolvedRid);
      const currentCatalogKey = this.keyGen.driverCatalog(resolvedRid);
      
      try {
        const [stateData, catalogData] = await Promise.all([
          this.redis.hgetall(currentStateKey),
          this.redis.hgetall(currentCatalogKey)
        ]);
        currentDriver = { ...catalogData, ...stateData };
      } catch (e) {
        this.logger.debug(`No existing data for RID ${resolvedRid}, creating new`);
      }

      // 3. Preparar datos unificados (merge con datos actuales)
      const unifiedData = {
        // Info básica
        driverid: driverid || currentDriver.reg || resolvedRid,
        registration: registration || currentDriver.reg || driverid || resolvedRid,
        number: number || currentDriver.number || registration || driverid || resolvedRid,
        
        // Datos personales (mantener existentes si no se proporcionan nuevos)
        first_name: first_name !== undefined ? first_name : (currentDriver.first_name || ''),
        last_name: last_name !== undefined ? last_name : (currentDriver.last_name || ''),
        nationality: nationality || currentDriver.nationality || '',
        class: parseInt(class_number || currentDriver.class) || 0,
        transponder_id: parseInt(transponder_id || currentDriver.transponder_id) || 0,
        
        // Estado de carrera (usar nuevos valores o mantener actuales)
        laps: parseInt(laps !== undefined ? laps : currentDriver.laps) || 0,
        best_ms: parseInt(best_ms !== undefined ? best_ms : currentDriver.best_ms) || 0,
        best_lap: parseInt(best_lap !== undefined ? best_lap : currentDriver.best_lap) || 0,
        total_ms: parseInt(total_ms !== undefined ? total_ms : currentDriver.total_ms) || 0,
        last_total_ms: parseInt(last_total_ms !== undefined ? last_total_ms : currentDriver.last_total_ms) || 0,
        
        // Metadatos
        updated_at_ms: Date.now(),
        updated_at_iso: new Date().toISOString(),
        updated_by: 'centralized'
      };

      // 4. Actualizar state (datos completos para redundancia)
      const driverStateKey = this.keyGen.driverState(resolvedRid);
      await this.redis.hset(driverStateKey, unifiedData);

      // 5. Actualizar leaderboard a través del NewLeaderboardService SOLO si hay posición explícita
      if (position && this.newLeaderboardService) {
        await this.newLeaderboardService.updateDriverLeaderboardOnly({
          position,
          driverid: unifiedData.driverid,
          ...unifiedData
        });
      }
      
      // 6. NUEVA ARQUITECTURA MODULAR: Propagar cambios al leaderboard si el driver ya está posicionado
      if (this.newLeaderboardService && !position) {
        // Extraer campos relevantes para leaderboard (excluyendo campos internos)
        const leaderboardFields = {};
        
        // Campos de identidad
        if (unifiedData.first_name !== undefined) leaderboardFields.first_name = unifiedData.first_name;
        if (unifiedData.last_name !== undefined) leaderboardFields.last_name = unifiedData.last_name;
        if (unifiedData.name !== undefined) leaderboardFields.name = unifiedData.name;
        if (unifiedData.nationality !== undefined) leaderboardFields.nationality = unifiedData.nationality;
        if (unifiedData.number !== undefined) leaderboardFields.number = unifiedData.number;
        if (unifiedData.registration !== undefined) leaderboardFields.registration = unifiedData.registration;
        
        // Campos de carrera
        if (unifiedData.class !== undefined) leaderboardFields.class = unifiedData.class;
        if (unifiedData.transponder_id !== undefined) leaderboardFields.transponder_id = unifiedData.transponder_id;
        if (unifiedData.laps !== undefined) leaderboardFields.laps = unifiedData.laps;
        if (unifiedData.best_ms !== undefined) leaderboardFields.best_ms = unifiedData.best_ms;
        if (unifiedData.best_lap !== undefined) leaderboardFields.best_lap = unifiedData.best_lap;
        if (unifiedData.total_ms !== undefined) leaderboardFields.total_ms = unifiedData.total_ms;
        if (unifiedData.last_total_ms !== undefined) leaderboardFields.last_total_ms = unifiedData.last_total_ms;

        // Solo actualizar si hay campos relevantes
        if (Object.keys(leaderboardFields).length > 0) {
          await this.newLeaderboardService.updateLeaderboardField(unifiedData.driverid, leaderboardFields);
        }
      }
      
      // TODO: Para futuras implementaciones - calcular posiciones basadas en totalracetime y laps
      // sin afectar posiciones por mejores vueltas individuales

      const fullName = this.buildFullName(unifiedData.first_name, unifiedData.last_name, unifiedData.driverid);
      this.logger.info(`✅ Driver centralizado actualizado: ${fullName} (RID: ${resolvedRid})`);

      return { 
        success: true, 
        rid: resolvedRid,
        driverid: unifiedData.driverid,
        data: unifiedData,
        fullName
      };

    } catch (error) {
      this.logger.error(`❌ Error en actualización centralizada de driver:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Notificar a NodeCG que debe recargar datos
   * @param {string} dataType - Tipo de dato actualizado
   */
  async notifyNodeCG(dataType = 'driver') {
    try {
      const channel = `nodecg:update:${dataType}`;
      await this.redis.publish(channel, 'reload');
      // Log de notificación eliminado
    } catch (error) {
      this.logger.error('Error notifying NodeCG:', error);
    }
  }
}

module.exports = DriverService;
