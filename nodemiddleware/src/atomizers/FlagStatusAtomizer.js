const BaseAtomizer = require('./BaseAtomizer');

/**
 * FlagStatusAtomizer.js
 * Atomizer especializado en estados de bandera ($F)
 * 
 * RESPONSABILIDADES:
 * - Actualizar estado de banderas (verde, amarilla, roja, etc.)
 * - Actualizar condiciones de la pista
 * - Actualizar estado global de la carrera
 * 
 * CAMPOS QUE MANEJA:
 * - flag_status, flag_color
 * - race_status, safety_car
 * - track_conditions
 */
class FlagStatusAtomizer extends BaseAtomizer {
  constructor(serviceRegistry, logger = console) {
    super(serviceRegistry, logger);
    this.messageTypes = ['$F'];
  }

  /**
   * Procesa mensajes de estado de bandera según estructura oficial
   * @param {Object} messageData - Datos del mensaje parseado
   * @returns {Promise<Object>} - Resultado de la operación
   */
  async atomize(messageData) {
    try {
      const { 
        flag, // Campo correcto del FParser
        laps_to_go, // Campo correcto del FParser  
        race_time, // Campo correcto del FParser
        time_to_go, // Campo correcto del FParser
        session_status, // Campo derivado del FParser
        flag_description // Campo derivado del FParser
      } = messageData;
      
      // PASO 1: Preparar datos de estado global
      const globalStateData = {};
      let hasUpdates = false;
      
      if (flag) {
        globalStateData.flag_status = flag;
        globalStateData.flag_description = flag_description;
        hasUpdates = true;
      }
      
      if (session_status) {
        globalStateData.session_status = session_status;
        hasUpdates = true;
      }
      
      if (race_time) {
        globalStateData.race_time = race_time;
        hasUpdates = true;
      }
      
      if (time_to_go) {
        globalStateData.time_to_go = time_to_go;
        hasUpdates = true;
      }
      
      if (laps_to_go !== undefined) {
        globalStateData.laps_to_go = laps_to_go;
        hasUpdates = true;
      }

      // PASO 2: Actualizar estado global usando Redis oficial
      let globalStateUpdated = false;
      if (hasUpdates) {
        try {
          // Usar la clave oficial de estado global race:{S}:global
          const globalStateKey = this.keyGen.globalState();
          const pipeline = this.redis.pipeline();
          
          // Actualizar todos los campos de estado global
          Object.entries(globalStateData).forEach(([key, value]) => {
            pipeline.hset(globalStateKey, key, value);
          });
          
          // Agregar timestamp de última actualización
          pipeline.hset(globalStateKey, 'last_updated', new Date().toISOString());
          
          const results = await pipeline.exec();
          globalStateUpdated = results && results.length > 0;
          
        } catch (error) {
          this.logger.error(`❌ [FlagStatusAtomizer] Error updating global state:`, error);
        }
      }
      
      // PASO 3: Publicar notificación en canal oficial
      const notification = {
        type: 'flag_status',
        flag: flag,
        flag_description: flag_description,
        session_status: session_status,
        race_time: race_time,
        time_to_go: time_to_go,
        laps_to_go: laps_to_go,
        timestamp: new Date().toISOString()
      };
      
      const notificationSent = await this.publishNotification('flag', notification);
      
      this.logAtomizerInfo('Flag status processed', 'GLOBAL', {
        messageType: messageData.messageType,
        globalStateUpdated,
        notificationSent,
        flag: flag || 'Unknown',
        flagDescription: flag_description || 'Unknown',
        sessionStatus: session_status || 'Unknown',
        fieldsCount: Object.keys(globalStateData).length
      });

      return {
        success: globalStateUpdated,
        type: 'flag_status',
        globalStateUpdated,
        notificationSent,
        flag: flag,
        flagDescription: flag_description,
        sessionStatus: session_status,
        fieldsProcessed: Object.keys(globalStateData).length,
        globalStateData
      };

    } catch (error) {
      this.logger.error(`❌ [FlagStatusAtomizer] Error processing message:`, error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = FlagStatusAtomizer;
