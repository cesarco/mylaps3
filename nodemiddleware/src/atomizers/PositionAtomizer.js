const BaseAtomizer = require('./BaseAtomizer');

/**
 * PositionAtomizer.js
 * Atomizer especializado en posiciones explícitas de carrera ($G)
 * 
 * RESPONSABILIDADES:
 * - Actualizar posición oficial de carrera
 * - Actualizar vueltas completadas (si viene en $G)
 * - Actualizar tiempo total de carrera (si viene en $G)
 * - Disparar actualización completa del leaderboard con nueva posición
 * 
 * CAMPOS QUE MANEJA:
 * - position (posición oficial de carrera)
 * - laps (vueltas completadas - opcional en $G)
 * - total_ms (tiempo total de carrera - opcional en $G)
 */
class PositionAtomizer extends BaseAtomizer {
  constructor(serviceRegistry, logger = console) {
    super(serviceRegistry, logger);
    this.messageTypes = ['$G'];
  }

  /**
   * Procesa mensajes de posición según estructura oficial usando scripts Lua
   * @param {Object} messageData - Datos del mensaje parseado
   * @returns {Promise<Object>} - Resultado de la operación
   */
  async atomize(messageData) {
    try {
      const { 
        position, // Campo correcto del GParser
        driver_number, // Campo correcto del GParser (no "registration")
        laps_completed, // Campo correcto del GParser
        total_time, // Campo correcto del GParser
        race_time_ms // Campo derivado del GParser
      } = messageData;
      
      if (!driver_number) {
        this.logger.warning(`No driver_number found in message`);
        return { success: false, reason: 'No driver_number' };
      }

      if (!position || isNaN(parseInt(position)) || parseInt(position) <= 0) {
        this.logger.warning(`Invalid position: ${position}`);
        return { success: false, reason: 'Invalid position' };
      }

      // PASO 1: Resolver RID usando RidService oficial
      const rid = await this.resolveRid(driver_number);
      if (!rid) {
        this.logger.error(`❌ [PositionAtomizer] Failed to resolve RID for driver_number ${driver_number}`);
        return { success: false, reason: 'RID resolution failed' };
      }

      // PASO 2: Ejecutar script Lua atómico para posiciones
      const keys = [
        this.keyGen.driverState(rid),           // KEYS[1] = race:{S}:driver:{rid}:state
        this.keyGen.posStandings(),             // KEYS[2] = race:{S}:pos
        `${this.serviceRegistry?.sessionKey || 'default'}:driver:${rid}:state`, // KEYS[3] = legacy state
        `${this.serviceRegistry?.sessionKey || 'default'}:pos`                   // KEYS[4] = legacy pos
      ];

      const args = [
        String(rid),                            // ARGV[1] = rid
        String(driver_number),                  // ARGV[2] = driver_number
        String(parseInt(position)),             // ARGV[3] = position
        laps_completed ? String(parseInt(laps_completed)) : '',  // ARGV[4] = laps_completed (opcional)
        race_time_ms ? String(parseInt(race_time_ms)) : '',      // ARGV[5] = total_time_ms (opcional)
        new Date().toISOString()                // ARGV[6] = timestamp_iso
      ];

      const luaResult = await this.executeLuaScript('position_update', keys, args);

      // Parsear resultado del array devuelto por Lua
      const result = {
        success: luaResult[0] === "true",
        rid: luaResult[1],
        position: parseInt(luaResult[2]) || null,
        previous_position: luaResult[3] ? parseInt(luaResult[3]) : null,
        laps_completed: luaResult[4] ? parseInt(luaResult[4]) : null,
        total_time_ms: luaResult[5] ? parseInt(luaResult[5]) : null,
        operations_completed: luaResult.slice(6) // Resto son las operaciones
      };

      if (!result.success) {
        this.logger.warning(`❌ [PositionAtomizer] Lua script failed:`, result);
        return { 
          success: false, 
          error: result.error || 'Unknown error',
          details: result
        };
      }

      // PASO 3: Publicar notificación en canal oficial
      const notification = {
        type: 'position',
        rid: rid,
        driver_number: driver_number,
        position: parseInt(position),
        laps: laps_completed,
        total_time: race_time_ms,
        timestamp: new Date().toISOString()
      };
      
      const notificationSent = await this.publishNotification('pos', notification);
      
      this.logAtomizerInfo('Position updated via Lua', `RID:${rid} (${driver_number})`, {
        messageType: messageData.messageType,
        newPosition: position,
        previousPosition: result.previous_position,
        laps: laps_completed,
        totalTime: race_time_ms,
        operations: result.operations_completed,
        notificationSent
      });

      return {
        success: true,
        rid: rid,
        driver_number: driver_number,
        position: parseInt(position),
        previousPosition: result.previous_position,
        lapsCompleted: laps_completed,
        totalTime: race_time_ms,
        notificationSent,
        luaOperations: result.operations_completed
      };

    } catch (error) {
      this.logger.error(`❌ [PositionAtomizer] Error processing message:`, error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = PositionAtomizer;
