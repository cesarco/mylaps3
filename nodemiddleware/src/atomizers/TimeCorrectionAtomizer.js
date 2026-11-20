const BaseAtomizer = require('./BaseAtomizer');

/**
 * TimeCorrectionAtomizer.js
 * Atomizer especializado en correcciones de tiempo ($COR)
 * 
 * RESPONSABILIDADES:
 * - Aplicar correcciones de tiempo a drivers específicos
 * - Actualizar tiempos corregidos en leaderboard
 * - Actualizar penalizaciones temporales
 * 
 * CAMPOS QUE MANEJA:
 * - corrected_time, penalty_time
 * - correction_reason
 * - original_time, final_time
 */
class TimeCorrectionAtomizer extends BaseAtomizer {
  constructor(serviceRegistry, logger = console) {
    super(serviceRegistry, logger);
    this.messageTypes = ['$COR'];
  }

  /**
   * Procesa mensajes de corrección de tiempo según estructura oficial
   * @param {Object} messageData - Datos del mensaje parseado
   * @returns {Promise<Object>} - Resultado de la operación
   */
  async atomize(messageData) {
    try {
      const { 
        registration, 
        correctedTime, // Legacy field
        penaltyTime,   // Legacy field
        correctionReason, // Legacy field
        originalTime,
        finalTime,
        // New fields from CORParser
        correction_reason,
        total_time,
        race_time_ms,
        correction,
        laps
      } = messageData;
      
      if (!registration) {
        this.logger.warning(`No registration found in correction message`);
        return { success: false, reason: 'No registration' };
      }

      // PASO 1: Resolver RID usando RidService oficial
      const rid = await this.resolveRid(registration);
      if (!rid) {
        this.logger.error(`❌ [TimeCorrectionAtomizer] Failed to resolve RID for registration ${registration}`);
        return { success: false, reason: 'RID resolution failed' };
      }

      // PASO 2: Preparar datos de corrección para estado del driver
      const stateData = {};
      let hasUpdates = false;
      
      // Use new fields from CORParser or fall back to legacy fields
      const finalCorrectedTime = correctedTime || race_time_ms || (total_time ? parseInt(total_time) : undefined);
      const finalCorrectionReason = correctionReason || correction_reason || correction || 'Time correction applied';
      
      if (finalCorrectedTime !== undefined) {
        stateData.corrected_time = parseInt(finalCorrectedTime) || 0;
        hasUpdates = true;
      }
      
      if (penaltyTime !== undefined) {
        stateData.penalty_time = parseInt(penaltyTime) || 0;
        hasUpdates = true;
      }
      
      if (finalCorrectionReason) {
        stateData.correction_reason = finalCorrectionReason;
        hasUpdates = true;
      }
      
      if (originalTime !== undefined) {
        stateData.original_time = parseInt(originalTime) || 0;
        hasUpdates = true;
      }
      
      if (finalTime !== undefined) {
        stateData.final_time = parseInt(finalTime) || 0;
        hasUpdates = true;
      }
      
      if (laps !== undefined) {
        stateData.corrected_laps = parseInt(laps) || 0;
        hasUpdates = true;
      }

      // PASO 3: Actualizar estado del driver (race:{S}:driver:{rid}:state)
      let stateUpdated = false;
      if (hasUpdates) {
        stateUpdated = await this.updateDriverState(rid, stateData);
      }
      
      // PASO 4: Registrar evento de corrección en stream de eventos
      const correctionEvent = {
        rid: rid,
        registration: registration,
        type: 'time_correction',
        corrected_time: finalCorrectedTime,
        penalty_time: penaltyTime,
        correction_reason: finalCorrectionReason,
        original_time: originalTime,
        final_time: finalTime,
        corrected_laps: laps,
        timestamp: new Date().toISOString()
      };
      
      const eventAdded = await this.addPassingEvent(correctionEvent);
      
      // PASO 5: Publicar notificación en canal oficial
      const notification = {
        type: 'time_correction',
        rid: rid,
        registration: registration,
        corrected_time: finalCorrectedTime,
        penalty_time: penaltyTime,
        correction_reason: finalCorrectionReason,
        timestamp: new Date().toISOString()
      };
      
      const notificationSent = await this.publishNotification('correction', notification);
      
      this.logAtomizerInfo('Time correction applied', `RID:${rid} (${registration})`, {
        messageType: messageData.messageType,
        stateUpdated,
        eventAdded,
        notificationSent,
        reason: finalCorrectionReason || 'No reason provided',
        correctedTime: finalCorrectedTime,
        penaltyTime: penaltyTime,
        fieldsCount: Object.keys(stateData).length
      });

      return {
        success: stateUpdated || eventAdded,
        rid: rid,
        registration: registration,
        stateUpdated,
        eventAdded,
        notificationSent,
        correctedTime: finalCorrectedTime,
        penaltyTime: penaltyTime,
        fieldsProcessed: Object.keys(stateData).length
      };

    } catch (error) {
      this.logger.error(`❌ [TimeCorrectionAtomizer] Error processing message:`, error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = TimeCorrectionAtomizer;
