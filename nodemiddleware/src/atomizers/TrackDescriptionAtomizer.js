const BaseAtomizer = require('./BaseAtomizer');

/**
 * TrackDescriptionAtomizer.js
 * Atomizer especializado en descripción de pista ($T - IMSA)
 * 
 * RESPONSABILIDADES:
 * - Actualizar información de la pista
 * - Actualizar configuración de sectores
 * - Actualizar datos geográficos del circuito
 * 
 * CAMPOS QUE MANEJA:
 * - track_name, track_length
 * - sector_count, turn_count
 * - track_config, surface_type
 */
class TrackDescriptionAtomizer extends BaseAtomizer {
  constructor(serviceRegistry, logger = console) {
    super(serviceRegistry, logger);
    this.messageTypes = ['$T'];
  }

  /**
   * Procesa mensajes de descripción de pista según estructura oficial
   * @param {Object} messageData - Datos del mensaje parseado
   * @returns {Promise<Object>} - Resultado de la operación
   */
  async atomize(messageData) {
    try {
      const { 
        trackName, 
        trackLength, 
        sectorCount, 
        turnCount, 
        trackConfig,
        surfaceType
      } = messageData;
      
      // PASO 1: Preparar datos de descripción de pista
      const trackData = {};
      let hasUpdates = false;
      
      if (trackName) {
        trackData.track_name = trackName;
        hasUpdates = true;
      }
      
      if (trackLength) {
        trackData.track_length = trackLength;
        hasUpdates = true;
      }
      
      if (sectorCount !== undefined) {
        trackData.sector_count = parseInt(sectorCount) || 0;
        hasUpdates = true;
      }
      
      if (turnCount !== undefined) {
        trackData.turn_count = parseInt(turnCount) || 0;
        hasUpdates = true;
      }
      
      if (trackConfig) {
        trackData.track_config = trackConfig;
        hasUpdates = true;
      }
      
      if (surfaceType) {
        trackData.surface_type = surfaceType;
        hasUpdates = true;
      }

      // PASO 2: Actualizar información de pista usando Redis oficial
      let trackUpdated = false;
      if (hasUpdates) {
        try {
          // Usar la clave oficial de información del evento race:{S}:event para datos de pista
          const trackKey = this.keyGen.eventInfo();
          const pipeline = this.redis.pipeline();
          
          // Actualizar todos los campos de información de pista
          Object.entries(trackData).forEach(([key, value]) => {
            pipeline.hset(trackKey, key, value);
          });
          
          // Agregar timestamp de última actualización
          pipeline.hset(trackKey, 'track_last_updated', new Date().toISOString());
          
          const results = await pipeline.exec();
          trackUpdated = results && results.length > 0;
          
        } catch (error) {
          this.logger.error(`❌ [TrackDescriptionAtomizer] Error updating track info:`, error);
        }
      }
      
      // PASO 3: Publicar notificación en canal oficial
      const notification = {
        type: 'track_description',
        track_name: trackName,
        track_length: trackLength,
        sector_count: sectorCount,
        turn_count: turnCount,
        track_config: trackConfig,
        surface_type: surfaceType,
        timestamp: new Date().toISOString()
      };
      
      const notificationSent = await this.publishNotification('track', notification);
      
      this.logAtomizerInfo('Track description processed', 'TRACK', {
        messageType: messageData.messageType,
        trackUpdated,
        notificationSent,
        trackName: trackName || 'Unknown',
        length: trackLength || 'Unknown',
        sectors: sectorCount || 'Unknown',
        config: trackConfig || 'Unknown',
        fieldsCount: Object.keys(trackData).length
      });

      return {
        success: trackUpdated,
        type: 'track_description',
        trackUpdated,
        notificationSent,
        trackName: trackName,
        trackLength: trackLength,
        sectorCount: sectorCount,
        fieldsProcessed: Object.keys(trackData).length,
        trackData
      };

    } catch (error) {
      this.logger.error(`❌ [TrackDescriptionAtomizer] Error processing message:`, error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = TrackDescriptionAtomizer;
