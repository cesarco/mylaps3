const BaseAtomizer = require('./BaseAtomizer');

/**
 * BestLapAtomizer.js
 * Atomizer especializado en mejores tiempos de vuelta ($H)
 * 
 * RESPONSABILIDADES:
 * - Actualizar mejor tiempo de vuelta oficial
 * - Actualizar número de vuelta del mejor tiempo
 * - NO afectar posiciones de carrera (solo timing data)
 * 
 * CAMPOS QUE MANEJA:
 * - best_ms (mejor tiempo en milisegundos)
 * - best_lap (número de vuelta del mejor tiempo)
 * - best_time_str (tiempo en formato string para display)
 */
class BestLapAtomizer extends BaseAtomizer {
  constructor(serviceRegistry, logger = console) {
    super(serviceRegistry, logger);
    this.messageTypes = ['$H'];
  }

  /**
   * Procesa mensajes de mejor vuelta según estructura oficial
   * @param {Object} messageData - Datos del mensaje parseado
   * @returns {Promise<Object>} - Resultado de la operación
   */
  async atomize(messageData) {
    try {
      const { 
        registration, 
        position, // posición en ranking de mejores tiempos (NO posición de carrera)
        lap_number,  // Nombre correcto del HParser
        lap_time     // Nombre correcto del HParser
      } = messageData;
      
      if (!registration) {
        this.logger.warning(`No registration found in message`);
        return { success: false, reason: 'No registration' };
      }

      // PASO 1: Resolver RID usando RidService oficial
      const rid = await this.resolveRid(registration);
      if (!rid) {
        this.logger.error(`❌ [BestLapAtomizer] Failed to resolve RID for registration ${registration}`);
        return { success: false, reason: 'RID resolution failed' };
      }

      // PASO 2: Preparar datos de estado del driver (estructura oficial)
      const stateData = {};
      let hasUpdates = false;
      
      // Convertir tiempo a milisegundos si es necesario
      let bestLapTimeMs = null;
      if (lap_time) {
        bestLapTimeMs = this.parseTimeToMilliseconds(lap_time);
        if (bestLapTimeMs > 0) {
          stateData.best_lap_time = bestLapTimeMs;
          hasUpdates = true;
        }
      }
      
      // Actualizar número de vuelta del mejor tiempo
      if (lap_number !== undefined) {
        stateData.best_lap_number = parseInt(lap_number) || 0;
        hasUpdates = true;
      }
      
      // Actualizar tiempo en formato string para display
      if (lap_time) {
        stateData.best_lap_time_str = lap_time;
        hasUpdates = true;
      }

      // PASO 3: Actualizar estado del driver (race:{S}:driver:{rid}:state)
      let stateUpdated = false;
      if (hasUpdates) {
        stateUpdated = await this.updateDriverState(rid, stateData);
      }
      
      // PASO 4: Publicar notificación en canal oficial
      const notification = {
        type: 'best_lap',
        rid: rid,
        registration: registration,
        best_lap_time: lap_time,
        best_lap_time_ms: bestLapTimeMs,
        best_lap_number: lap_number,
        ranking_position: position, // posición en ranking de mejores tiempos
        timestamp: new Date().toISOString()
      };
      
      const notificationSent = await this.publishNotification('best', notification);
      
      this.logAtomizerInfo('Best lap time updated', `RID:${rid} (${registration})`, {
        messageType: messageData.messageType,
        stateUpdated,
        notificationSent,
        bestTime: lap_time,  // Campo original del parser
        bestTimeMs: bestLapTimeMs,  // Valor convertido
        bestLap: lap_number,  // Campo original del parser
        rankingPosition: position
      });

      return {
        success: stateUpdated,
        rid: rid,
        registration: registration,
        stateUpdated,
        notificationSent,
        bestTime: lap_time,  // Campo original del parser
        bestTimeMs: bestLapTimeMs,  // Valor convertido
        bestLap: lap_number,  // Campo original del parser
        rankingPosition: position
      };

    } catch (error) {
      this.logger.error(`❌ [BestLapAtomizer] Error processing message:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Convierte tiempo en formato string a milisegundos
   * @param {string|number} timeValue - Tiempo en formato string o número
   * @returns {number} - Tiempo en milisegundos
   */
  parseTimeToMilliseconds(timeValue) {
    try {
      if (!timeValue) return 0;
      
      // Si ya es un número, asumir que está en ms
      if (typeof timeValue === 'number') {
        return timeValue;
      }
      
      if (!isNaN(timeValue)) {
        return parseInt(timeValue);
      }
      
      // Si es string, usar el parser de LapTimingAtomizer
      if (typeof timeValue === 'string') {
        const parts = timeValue.split(':');
        if (parts.length === 3) {
          const hours = parseInt(parts[0]) || 0;
          const minutes = parseInt(parts[1]) || 0;
          const secondsParts = parts[2].split('.');
          const seconds = parseInt(secondsParts[0]) || 0;
          const milliseconds = parseInt(secondsParts[1]) || 0;
          
          return (hours * 3600 + minutes * 60 + seconds) * 1000 + milliseconds;
        }
        
        if (parts.length === 2) {
          const minutes = parseInt(parts[0]) || 0;
          const secondsParts = parts[1].split('.');
          const seconds = parseInt(secondsParts[0]) || 0;
          const milliseconds = parseInt(secondsParts[1]) || 0;
          
          return (minutes * 60 + seconds) * 1000 + milliseconds;
        }
      }
      
      return 0;
      
    } catch (error) {
      this.logger.error(`❌ [BestLapAtomizer] Error parsing time ${timeValue}:`, error);
      return 0;
    }
  }
}

module.exports = BestLapAtomizer;
