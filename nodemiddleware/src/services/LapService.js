/**
 * LapService.js
 * Gestión de vueltas, tiempos y passings según especificación Redis_RMonitor_Middleware.md
 * Updated to use efficient PassingsService for $J messages
 */
const KeyGenerator = require('../utils/KeyGenerator');
const TimeUtils = require('../utils/TimeUtils');
const RidService = require('./RidService');
const PassingsService = require('./PassingsService');

class LapService {
  constructor(redisClient, logger = console, sessionKey = 'default', serviceRegistry = null) {
    this.redis = redisClient;
    this.logger = logger;
    this.sessionKey = sessionKey;
    this.serviceRegistry = serviceRegistry;
    
    this.keyGen = new KeyGenerator(sessionKey);
    this.ridService = new RidService(redisClient, sessionKey);
    this.passingsService = serviceRegistry ? serviceRegistry.getPassingsService() : null;
    this.newLeaderboardService = serviceRegistry ? serviceRegistry.getNewLeaderboardService() : null;
    this.driverService = serviceRegistry ? serviceRegistry.getDriverService() : null; // NUEVO
    this.calculatedLeaderboardService = serviceRegistry ? serviceRegistry.getCalculatedLeaderboardService() : null; // NUEVO
    
    // Debug: verificar si el servicio se inicializó correctamente
    this.logger.info(`🔧 LapService initialized - CalculatedLeaderboardService available: ${!!this.calculatedLeaderboardService}`);
  }

  /**
   * Procesa mejor vuelta ($H) según especificación
   * NUEVO: Delega la actualización del estado al NewLeaderboardService
   */
  async processBestLap(data) {
    try {
      const { transponder_id, driver_number, lap_time, lap_number, class_id } = data;
      
      // 1. Obtener RID
      const rid = await this.ridService.getOrCreateRid(transponder_id || driver_number);
      if (!rid) {
        this.logger.warn(`❌ No se pudo obtener RID para mejor vuelta`);
        return { success: false, error: 'No RID found' };
      }
      
      // 2. Convertir tiempo a milisegundos
      const bestMs = this.parseTimeToMilliseconds(lap_time);
      
      // 3. Actualizar datos de timing del driver SIN afectar posición
      if (this.driverService && bestMs > 0) {
        try {
          await this.driverService.updateDriverCentralized({
            driverid: transponder_id || driver_number,
            best_ms: bestMs,
            best_lap: parseInt(lap_number) || 0
          });
          this.logger.info(`✅ Mejor vuelta $H procesada centralizadamente para ${transponder_id || driver_number} (sin afectar posición)`);
        } catch (leaderboardError) {
          this.logger.error(`❌ Error procesando mejor vuelta $H: ${leaderboardError.message}`);
          return { success: false, error: leaderboardError.message };
        }
      }
      
      // 4. Actualizar ZSET de mejores vueltas (solo índices, no state)
      if (bestMs > 0) {
        const bestKey = this.keyGen.bestStandings();
        await this.redis.zadd(bestKey, bestMs, rid);
        
        // Por clase también
        if (class_id) {
          const classBestKey = this.keyGen.classBest(class_id);
          await this.redis.zadd(classBestKey, bestMs, rid);
        }
      }
      
      // 5. Publicar evento
      const bestChannel = this.keyGen.bestChannel();
      await this.redis.publish(bestChannel, JSON.stringify({
        type: 'BEST_LAP',
        rid,
        lap_number: parseInt(lap_number) || 0,
        lap_time,
        best_ms: bestMs,
        timestamp: new Date().toISOString()
      }));
      
      this.logger.info(`✅ Mejor vuelta procesada para RID ${rid}: Vuelta ${lap_number}, Tiempo ${lap_time} (${bestMs}ms)`);
      
      // Notificar a NodeCG sobre nueva mejor vuelta
      await this.notifyNodeCG('bestlap');
      
      return { success: true, rid, best_ms: bestMs, lap_number: parseInt(lap_number) || 0 };
    } catch (error) {
      this.logger.error(`❌ Error procesando mejor vuelta:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Procesa passing ($J) usando PassingsService optimizado
   * Atomic Lua operation for idempotency and performance
   */
  async processPassing(data) {
    try {
      const { transponder_id, driver_number, lap_ms, total_ms } = data;
      
      // Usar el nuevo PassingsService para operación atómica
      const result = await this.passingsService.handleJ({
        sessionKey: this.sessionKey,
        reg: transponder_id || driver_number,
        lapMs: lap_ms,
        totalMs: total_ms
      });
      
      if (!result.success) {
        return { success: false, error: result.error };
      }
      
      if (result.skipped) {
        return { success: true, rid: result.rid, skipped: true, reason: 'duplicate_or_old' };
      }
      
      // Obtener estado actual para actualizar leaderboard si es necesario
      const driverState = await this.passingsService.getDriverState(this.sessionKey, result.rid);
      const recentLaps = await this.passingsService.getRecentPassings(this.sessionKey, result.rid, 1);
      
      // Verificar si es mejor vuelta (comparar con lap anterior si existe)
      let isBestLap = false;
      if (recentLaps.length > 0 && lap_ms > 0) {
        // Para determinar si es mejor vuelta, necesitamos comparar con el histórico
        const lapHistory = await this.passingsService.getLapHistory(this.sessionKey, result.rid);
        const bestLapInHistory = lapHistory.reduce((best, lap) => {
          return (best === null || lap.lapMs < best.lapMs) ? lap : best;
        }, null);
        
        if (!bestLapInHistory || lap_ms <= bestLapInHistory.lapMs) {
          isBestLap = true;
        }
      }
      
      // Actualizar datos de timing sin afectar posiciones
      if (isBestLap && lap_ms > 0) {
        try {
          // Solo actualizar datos de timing, NO posición
          await this.driverService.updateDriverCentralized({
            driverid: transponder_id || driver_number,
            best_ms: lap_ms,
            best_lap: result.result
          });
          this.logger.info(`✅ Mejor vuelta actualizada en driver state para ${transponder_id || driver_number} (sin afectar posición)`);
        } catch (leaderboardError) {
          this.logger.warn(`⚠️ Error actualizando datos de mejor vuelta: ${leaderboardError.message}`);
        }
      }
      
      this.logger.info(`✅ Passing procesado para RID ${result.rid}: LapMS ${lap_ms}, TotalMS ${total_ms}, BestMS ${isBestLap ? lap_ms : 'N/A'}`);
      
      // NUEVO: Activar cálculo automático de posiciones basado en tiempos totales
      if (this.calculatedLeaderboardService && total_ms > 0) {
        try {
          this.logger.debug(`🧮 Calling position recalculation for ${transponder_id || driver_number} with ${total_ms}ms`);
          await this.calculatedLeaderboardService.processLapAndRecalculate({
            driverid: transponder_id || driver_number,
            total_ms: total_ms,
            laps: driverState ? driverState.laps : result.result
          });
          this.logger.debug(`🧮 Triggered position recalculation for ${transponder_id || driver_number}`);
        } catch (calcError) {
          this.logger.warn(`⚠️ Error in position calculation: ${calcError.message}`);
        }
      } else {
        this.logger.debug(`🔍 Position calculation skipped: calculatedLeaderboardService=${!!this.calculatedLeaderboardService}, total_ms=${total_ms}`);
      }
      
      return { 
        success: true, 
        rid: result.rid, 
        lap: result.result,
        isBestLap,
        skipped: false 
      };
    } catch (error) {
      this.logger.error(`❌ Error processing passing:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Actualiza mejor vuelta en el sistema
   * @private
   */

  /**
   * Convierte tiempo a milisegundos usando TimeUtils
   * @param {string} timeStr - Tiempo en formato HH:MM:SS.mmm, MM:SS.mmm o SS.mmm
   * @returns {number} - Tiempo en milisegundos
   */
  parseTimeToMilliseconds(timeStr) {
    if (!timeStr || typeof timeStr !== 'string' || timeStr.trim() === '' || timeStr === ',') {
      console.warn(`⚠️ Invalid time format: ${timeStr}`);
      return 0;
    }
    
    const result = TimeUtils.timeToMilliseconds(timeStr);
    
    if (result === null) {
      console.warn(`⚠️ Failed to parse time: ${timeStr}`);
      return 0;
    }
    
    console.log(`✅ Time parsed: ${timeStr} → ${result}ms`);
    return result;
  }

  /**
   * Convierte milisegundos a tiempo formateado
   * @param {number} ms - Milisegundos
   * @returns {string} - Tiempo formateado MM:SS.mmm
   */
  millisecondsToTime(ms) {
    if (!ms || ms <= 0) return '00:00.000';
    
    const totalSeconds = Math.floor(ms / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = ms % 1000;
    
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
  }

  /**
   * Obtiene las mejores vueltas generales
   * @param {number} limit - Límite de resultados
   */
  async getBestLaps(limit = 10) {
    try {
      const bestKey = this.keyGen.bestStandings();
      const rawResults = await this.redis.zrange(bestKey, 0, limit - 1, 'WITHSCORES');
      
      // Convertir formato [rid1, score1, rid2, score2, ...] a objetos
      const results = [];
      for (let i = 0; i < rawResults.length; i += 2) {
        const rid = rawResults[i];
        const best_ms = parseInt(rawResults[i + 1]);
        
        results.push({ 
          rid, 
          best_ms,
          best_lap_time: this.millisecondsToTime(best_ms)
        });
      }
      
      // Enriquecer con datos adicionales
      const enrichedResults = await this.enrichBestLapData(results);
      return enrichedResults;
    } catch (error) {
      this.logger.error(`❌ Error obteniendo mejores vueltas:`, error);
      return [];
    }
  }

  /**
   * Obtiene las mejores vueltas por clase
   * @param {string|number} classId - ID de la clase
   * @param {number} limit - Límite de resultados
   */
  async getClassBestLaps(classId, limit = 10) {
    try {
      const classBestKey = this.keyGen.classBest(classId);
      const rawResults = await this.redis.zrange(classBestKey, 0, limit - 1, 'WITHSCORES');
      
      // Convertir formato [rid1, score1, rid2, score2, ...] a objetos
      const results = [];
      for (let i = 0; i < rawResults.length; i += 2) {
        const rid = rawResults[i];
        const best_ms = parseInt(rawResults[i + 1]);
        
        results.push({ 
          rid, 
          best_ms,
          best_lap_time: this.millisecondsToTime(best_ms),
          class_id: classId
        });
      }
      
      // Enriquecer con datos adicionales
      const enrichedResults = await this.enrichBestLapData(results);
      return enrichedResults;
    } catch (error) {
      this.logger.error(`❌ Error obteniendo mejores vueltas para clase ${classId}:`, error);
      return [];
    }
  }

  /**
   * Enriquece datos de mejores vueltas con información de pilotos
   * @private
   */
  async enrichBestLapData(bestLapData) {
    const enriched = [];
    
    for (const entry of bestLapData) {
      try {
        const { rid, best_ms, best_lap_time, class_id } = entry;
        
        // Obtener datos de catálogo
        const catalogKey = this.keyGen.driverCatalog(rid);
        const catalog = await this.redis.hgetall(catalogKey);
        
        // Obtener datos de estado
        const stateKey = this.keyGen.driverState(rid);
        const state = await this.redis.hgetall(stateKey);
        
        enriched.push({
          rid,
          best_ms,
          best_lap_time,
          best_lap: state.best_lap || 0,
          class_id: class_id || catalog.class || 0,
          number: catalog.number || '',
          name: `${catalog.first_name || ''} ${catalog.last_name || ''}`.trim() || `Driver ${rid}`
        });
      } catch (error) {
        this.logger.error(`❌ Error enriqueciendo datos para RID ${entry.rid}:`, error);
      }
    }
    
    return enriched;
  }

  /**
   * Notificar a NodeCG que debe recargar datos
   * @param {string} dataType - Tipo de dato actualizado
   */
  async notifyNodeCG(dataType = 'lap') {
    try {
      const channel = `nodecg:update:${dataType}`;
      await this.redis.publish(channel, 'reload');
      // Log de notificación eliminado
    } catch (error) {
      this.logger.error('Error notifying NodeCG:', error);
    }
  }

  /**
   * @deprecated - Método obsoleto, ahora se usa updateDriverCentralized directamente
   * sin intentar afectar posiciones del leaderboard
   */
  async updateBestLap(driverid, bestMs, lapNumber) {
    try {
      if (!this.driverService) {
        this.logger.warn('DriverService not available for updateBestLap');
        return { success: false, error: 'DriverService not available' };
      }

      // Usar DriverService para actualizar de forma centralizada SIN afectar posición
      const result = await this.driverService.updateDriverCentralized({
        driverid,
        best_ms: bestMs,
        best_lap: lapNumber
      });

      if (result.success) {
        this.logger.info(`✅ Best lap updated for ${driverid}: ${bestMs}ms on lap ${lapNumber} (no position change)`);
        await this.notifyNodeCG('lap');
      }

      return result;

    } catch (error) {
      this.logger.error(`❌ Error updating best lap for ${driverid}:`, error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = LapService;
