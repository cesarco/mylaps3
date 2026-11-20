const BaseAtomizer = require('./BaseAtomizer');

/**
 * LineCrossingAtomizer.js
 * Atomizer especializado en cruces de línea ($L - IMSA)
 * 
 * RESPONSABILIDADES:
 * - Procesar cruces de líneas intermedias
 * - Actualizar tiempos de sectores
 * - Actualizar velocidades por sector
 * 
 * CAMPOS QUE MANEJA:
 * - line_id, crossing_time
 * - sector_time, sector_speed
 * - segment_number
 */
class LineCrossingAtomizer extends BaseAtomizer {
  constructor(serviceRegistry, logger = console) {
    super(serviceRegistry, logger);
    this.messageTypes = ['$L'];
  }

  /**
   * Procesa mensajes de cruce de línea según estructura oficial
   * @param {Object} messageData - Datos del mensaje parseado
   * @returns {Promise<Object>} - Resultado de la operación
   */
  async atomize(messageData) {
    try {
      const { 
        registration, 
        lineId, 
        crossingTime, 
        sectorTime, 
        segmentNumber,
        sectorSpeed
      } = messageData;
      
      if (!registration) {
        this.logger.warning(`No registration found in line crossing message`);
        return { success: false, reason: 'No registration' };
      }

      // PASO 1: Resolver RID usando RidService oficial
      const rid = await this.resolveRid(registration);
      if (!rid) {
        this.logger.error(`❌ [LineCrossingAtomizer] Failed to resolve RID for registration ${registration}`);
        return { success: false, reason: 'RID resolution failed' };
      }

      // PASO 2: Preparar datos de sector para estado del driver
      const stateData = {};
      let hasUpdates = false;
      
      if (sectorTime !== undefined) {
        stateData.last_sector_time = parseInt(sectorTime) || 0;
        hasUpdates = true;
      }
      
      if (segmentNumber !== undefined) {
        stateData.current_segment = parseInt(segmentNumber) || 0;
        hasUpdates = true;
      }
      
      if (sectorSpeed !== undefined) {
        stateData.sector_speed = parseFloat(sectorSpeed) || 0;
        hasUpdates = true;
      }
      
      // Guardar tiempo de línea específica
      if (lineId !== undefined && crossingTime) {
        stateData[`line_${lineId}_time`] = crossingTime;
        hasUpdates = true;
      }

      // PASO 3: Actualizar estado del driver (race:{S}:driver:{rid}:state)
      let stateUpdated = false;
      if (hasUpdates) {
        stateUpdated = await this.updateDriverState(rid, stateData);
      }
      
      // PASO 4: Registrar evento de cruce de línea en stream
      const crossingEvent = {
        rid: rid,
        registration: registration,
        type: 'line_crossing',
        line_id: lineId,
        crossing_time: crossingTime,
        sector_time: sectorTime,
        segment_number: segmentNumber,
        sector_speed: sectorSpeed,
        timestamp: new Date().toISOString()
      };
      
      const eventAdded = await this.addPassingEvent(crossingEvent);
      
      // PASO 5: Publicar notificación en canal oficial
      const notification = {
        type: 'line_crossing',
        rid: rid,
        registration: registration,
        line_id: lineId,
        crossing_time: crossingTime,
        sector_time: sectorTime,
        segment_number: segmentNumber,
        timestamp: new Date().toISOString()
      };
      
      const notificationSent = await this.publishNotification('sector', notification);
      
      this.logAtomizerInfo('Line crossing updated', `RID:${rid} (${registration})`, {
        messageType: messageData.messageType,
        stateUpdated,
        eventAdded,
        notificationSent,
        lineId: lineId || 'Unknown',
        sectorTime: sectorTime,
        segmentNumber: segmentNumber,
        fieldsCount: Object.keys(stateData).length
      });

      return {
        success: stateUpdated || eventAdded,
        rid: rid,
        registration: registration,
        stateUpdated,
        eventAdded,
        notificationSent,
        lineId: lineId,
        sectorTime: sectorTime,
        fieldsProcessed: Object.keys(stateData).length
      };

    } catch (error) {
      this.logger.error(`❌ [LineCrossingAtomizer] Error processing message:`, error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = LineCrossingAtomizer;
