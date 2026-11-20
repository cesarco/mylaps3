const BaseAtomizer = require('./BaseAtomizer');

/**
 * LapTimingAtomizer.js
 * Atomizer especializado en timing de vueltas ($J)
 * SIGUE ESTRUCTURA OFICIAL: race:{S}:x:pass + race:{S}:driver:{rid}:state + race:{S}:driver:{rid}:laps
 * 
 * RESPONSABILIDADES:
 * - Agregar evento a stream de passings oficial (race:{S}:x:pass)
 * - Actualizar estado del driver con datos de la vuelta
 * - Crear vueltas históricas en ambas estructuras (race: y default:)
 * - Publicar notificación en canal oficial
 * - Usar RidService para resolución de RID
 * 
 * CAMPOS QUE MANEJA:
 * - Eventos en x:pass stream
 * - laps, total_time en driver:state
 * - Vueltas históricas en driver:laps
 * - Notificaciones Pub/Sub
 */
class LapTimingAtomizer extends BaseAtomizer {
  constructor(serviceRegistry, logger = console) {
    super(serviceRegistry, logger);
    this.messageTypes = ['$J'];
    
    // No necesitamos cargar script Lua manualmente aquí
    // BaseAtomizer.executeLuaScript() manejará la carga automáticamente
  }

  /**
   * Procesa mensajes de timing según estructura oficial usando scripts Lua
   * @param {Object} messageData - Datos del mensaje parseado
   * @returns {Promise<Object>} - Resultado de la operación
   */
  async atomize(messageData) {
    try {
      // Extraer campos del mensaje parseado por JParser
      const { 
        registration, 
        lap_ms, 
        total_ms, 
        lap_time, 
        total_time, 
        rtc_time 
      } = messageData;
      
      if (!registration) {
        this.logger.warning(`No registration found in message`);
        return { success: false, reason: 'No registration' };
      }

      // PASO 1: Resolver RID usando RidService oficial
      const rid = await this.resolveRid(registration);
      if (!rid) {
        this.logger.error(`❌ [LapTimingAtomizer] Failed to resolve RID for registration ${registration}`);
        return { success: false, reason: 'RID resolution failed' };
      }

      // PASO 2: Validar datos del mensaje
      if (!total_ms || total_ms <= 0) {
        this.logger.warning(`❌ [LapTimingAtomizer] Invalid total_ms from message: ${total_ms}`);
        return { success: false, reason: 'Invalid total_ms from message' };
      }

      // PASO 3: Ejecutar script Lua atómico
      const keys = [
        this.keyGen.driverState(rid),           // KEYS[1] = race:{S}:driver:{rid}:state
        this.keyGen.driverLaps(rid),            // KEYS[2] = race:{S}:driver:{rid}:laps  
        `${this.serviceRegistry?.sessionKey || 'default'}:driver:${rid}:state`, // KEYS[3] = legacy state
        `${this.serviceRegistry?.sessionKey || 'default'}:driver:${rid}:laps`,  // KEYS[4] = legacy laps
        this.keyGen.passStream(),               // KEYS[5] = race:{S}:x:pass
        `${this.serviceRegistry?.sessionKey || 'default'}:x:pass`               // KEYS[6] = legacy stream
      ];

      const args = [
        String(rid),                            // ARGV[1] = rid
        String(registration),                   // ARGV[2] = registration
        String(lap_time || ''),                 // ARGV[3] = lap_time (string original)
        String(lap_ms || 0),                    // ARGV[4] = lap_ms
        String(total_time || ''),               // ARGV[5] = total_time (string original)
        String(total_ms),                       // ARGV[6] = total_ms (DESDE EL MENSAJE)
        String(rtc_time || ''),                 // ARGV[7] = rtc_time
        new Date().toISOString()                // ARGV[8] = timestamp_iso
      ];

      const luaResult = await this.executeLuaScript('lap_timing_update', keys, args);

      // DEBUG: Log the raw Lua result
      this.logger.debug(`🔍 [LapTimingAtomizer] Raw Lua result:`, luaResult);

      // Convert Redis Lua array result to object format
      const result = Array.isArray(luaResult) ? {
        success: luaResult[0] === "true",
        lap_number: luaResult[1] ? parseInt(luaResult[1]) : null,
        total_ms: luaResult[2] ? parseInt(luaResult[2]) : null,
        lap_ms: luaResult[3] ? parseInt(luaResult[3]) : null,
        previous_total: luaResult[4] ? parseInt(luaResult[4]) : null,
        operations_completed: luaResult[0] === "true" ? luaResult.slice(5) : [], // Only get operations if success
        error: luaResult[0] === "false" ? luaResult[1] : null
      } : luaResult;

      // DEBUG: Log the converted result
      this.logger.debug(`🔍 [LapTimingAtomizer] Converted result:`, result);

      if (!result.success) {
        this.logger.warning(`❌ [LapTimingAtomizer] Lua script failed:`, result);
        return { 
          success: false, 
          error: result.error,
          details: result
        };
      }

      // PASO 4: Publicar notificación en canales Pub/Sub
      const notification = {
        type: 'passing',
        rid: rid,
        registration: registration,
        lap_time: lap_time,
        total_time: total_time,
        lap_number: result.lap_number,
        timestamp: new Date().toISOString()
      };
      
      const notificationSent = await this.publishNotification('pass', notification);

      this.logAtomizerInfo('Lap timing processed via Lua', `RID:${rid} (${registration})`, {
        messageType: messageData.messageType,
        lapNumber: result.lap_number,
        totalMs: result.total_ms,
        lapMs: result.lap_ms,
        previousTotal: result.previous_total,
        operations: result.operations_completed,
        notificationSent
      });

      return {
        success: true,
        rid: rid,
        registration: registration,
        lapNumber: result.lap_number,
        totalMs: result.total_ms,
        lapMs: result.lap_ms,
        previousTotal: result.previous_total,
        notificationSent,
        luaOperations: result.operations_completed
      };

    } catch (error) {
      this.logger.error(`❌ [LapTimingAtomizer] Error processing message:`, error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = LapTimingAtomizer;
