const BaseAtomizer = require('./BaseAtomizer');

/**
 * SessionInfoAtomizer.js
 * Atomizer especializado en información de sesión ($B)
 * 
 * RESPONSABILIDADES:
 * - Actualizar información de la sesión actual
 * - Actualizar estado global de la carrera
 * - Actualizar configuraciones de timing
 * 
 * CAMPOS QUE MANEJA:
 * - session_name, session_type
 * - start_time, end_time
 * - track_length, track_name
 * - weather_conditions
 * - session_status
 */
class SessionInfoAtomizer extends BaseAtomizer {
  constructor(serviceRegistry, logger = console) {
    super(serviceRegistry, logger);
    this.messageTypes = ['$B'];
  }

  /**
   * Procesa mensajes de información de sesión según estructura oficial
   * @param {Object} messageData - Datos del mensaje parseado
   * @returns {Promise<Object>} - Resultado de la operación
   */
  async atomize(messageData) {
    try {
      const { 
        sessionName, 
        sessionType, 
        startTime, 
        endTime, 
        trackLength, 
        trackName,
        sessionStatus,
        weatherConditions 
      } = messageData;
      
      // PASO 1: Preparar datos de información de sesión
      const sessionData = {};
      let hasUpdates = false;
      
      if (sessionName) {
        sessionData.session_name = sessionName;
        hasUpdates = true;
      }
      
      if (sessionType) {
        sessionData.session_type = sessionType;
        hasUpdates = true;
      }
      
      if (startTime) {
        sessionData.start_time = startTime;
        hasUpdates = true;
      }
      
      if (endTime) {
        sessionData.end_time = endTime;
        hasUpdates = true;
      }
      
      if (trackLength) {
        sessionData.track_length = trackLength;
        hasUpdates = true;
      }
      
      if (trackName) {
        sessionData.track_name = trackName;
        hasUpdates = true;
      }
      
      if (sessionStatus) {
        sessionData.session_status = sessionStatus;
        hasUpdates = true;
      }
      
      if (weatherConditions) {
        sessionData.weather_conditions = weatherConditions;
        hasUpdates = true;
      }

      // PASO 2: Actualizar información de sesión usando Redis oficial
      let sessionUpdated = false;
      if (hasUpdates) {
        try {
          // Usar la clave oficial de información de sesión race:{S}:run
          const sessionKey = this.keyGen.runInfo();
          const pipeline = this.redis.pipeline();
          
          // Actualizar todos los campos de información de sesión
          Object.entries(sessionData).forEach(([key, value]) => {
            pipeline.hset(sessionKey, key, value);
          });
          
          // Agregar timestamp de última actualización
          pipeline.hset(sessionKey, 'last_updated', new Date().toISOString());
          
          const results = await pipeline.exec();
          sessionUpdated = results && results.length > 0;
          
        } catch (error) {
          this.logger.error(`❌ [SessionInfoAtomizer] Error updating session info:`, error);
        }
      }
      
      // PASO 3: Publicar notificación en canal oficial
      const notification = {
        type: 'session_info',
        session_name: sessionName,
        session_type: sessionType,
        session_status: sessionStatus,
        track_name: trackName,
        timestamp: new Date().toISOString()
      };
      
      const notificationSent = await this.publishNotification('session', notification);
      
      this.logAtomizerInfo('Session info processed', 'GLOBAL', {
        messageType: messageData.messageType,
        sessionUpdated,
        notificationSent,
        session: sessionName || 'Unknown',
        type: sessionType || 'Unknown',
        fieldsCount: Object.keys(sessionData).length
      });

      return {
        success: sessionUpdated,
        type: 'session_info',
        sessionUpdated,
        notificationSent,
        session: sessionName,
        sessionType: sessionType,
        fieldsProcessed: Object.keys(sessionData).length,
        sessionData
      };

    } catch (error) {
      this.logger.error(`❌ [SessionInfoAtomizer] Error processing message:`, error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = SessionInfoAtomizer;
