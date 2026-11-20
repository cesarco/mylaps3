const BaseAtomizer = require('./BaseAtomizer');

/**
 * EventMetadataAtomizer.js
 * Atomizer especializado en metadatos de eventos ($E)
 * 
 * RESPONSABILIDADES:
 * - Actualizar información del evento
 * - Actualizar configuraciones globales
 * - Actualizar metadatos de la competición
 * 
 * CAMPOS QUE MANEJA:
 * - event_name, event_date
 * - event_location, event_type
 * - organizer, series_name
 */
class EventMetadataAtomizer extends BaseAtomizer {
  constructor(serviceRegistry, logger = console) {
    super(serviceRegistry, logger);
    this.messageTypes = ['$E'];
  }

  /**
   * Procesa mensajes de metadatos de evento según estructura oficial
   * @param {Object} messageData - Datos del mensaje parseado
   * @returns {Promise<Object>} - Resultado de la operación
   */
  async atomize(messageData) {
    try {
      const { 
        key, // Campo correcto del EParser
        value, // Campo correcto del EParser  
        setting_key, // Campo derivado del EParser
        setting_value, // Campo derivado del EParser
        metadata_type // Campo derivado del EParser
      } = messageData;
      
      // PASO 1: Preparar datos de metadatos del evento usando clave-valor del EParser
      const eventData = {};
      let hasUpdates = false;
      
      if (key && value) {
        // Mapear claves comunes de RMonitor a estructura estándar
        const mappedKey = this.mapEventKey(key);
        if (mappedKey) {
          eventData[mappedKey] = value;
          hasUpdates = true;
        }
        
        // También guardar la clave original
        eventData[`raw_${key.toLowerCase()}`] = value;
      }

      // PASO 2: Actualizar información del evento usando Redis oficial
      let eventUpdated = false;
      if (hasUpdates) {
        try {
          // Usar la clave oficial de información del evento race:{S}:event
          const eventKey = this.keyGen.eventInfo();
          const pipeline = this.redis.pipeline();
          
          // Actualizar todos los campos de información del evento
          Object.entries(eventData).forEach(([key, value]) => {
            pipeline.hset(eventKey, key, value);
          });
          
          // Agregar timestamp de última actualización
          pipeline.hset(eventKey, 'last_updated', new Date().toISOString());
          
          const results = await pipeline.exec();
          eventUpdated = results && results.length > 0;
          
        } catch (error) {
          this.logger.error(`❌ [EventMetadataAtomizer] Error updating event info:`, error);
        }
      }
      
      // PASO 3: Publicar notificación en canal oficial
      const notification = {
        type: 'event_metadata',
        event_name: eventData.event_name || eventData.raw_eventname || 'Unknown',
        event_date: eventData.event_date || eventData.raw_eventdate || null,
        event_location: eventData.event_location || eventData.raw_eventlocation || null,
        event_type: eventData.event_type || eventData.raw_eventtype || null,
        organizer: eventData.organizer || eventData.raw_organizer || null,
        series_name: eventData.series_name || eventData.raw_series || null,
        timestamp: new Date().toISOString()
      };
      
      const notificationSent = await this.publishNotification('event', notification);
      
      // Build meaningful display values from available data
      const displayInfo = {
        eventName: eventData.track_name || eventData.event_name || eventData.raw_eventname || 'Unknown',
        location: eventData.event_location || eventData.raw_eventlocation || 'Unknown',
        type: eventData.event_type || eventData.raw_eventtype || 'Unknown'
      };
      
      this.logAtomizerInfo('Event metadata processed', 'GLOBAL', {
        messageType: messageData.messageType,
        eventUpdated,
        notificationSent,
        key: key,
        value: value,
        mappedField: this.mapEventKey(key),
        eventName: displayInfo.eventName,
        location: displayInfo.location,
        type: displayInfo.type,
        fieldsCount: Object.keys(eventData).length
      });

      return {
        success: eventUpdated,
        type: 'event_metadata',
        eventUpdated,
        notificationSent,
        key: key,
        value: value,
        mappedKey: eventData ? Object.keys(eventData)[0] : null,
        fieldsProcessed: Object.keys(eventData).length,
        eventData
      };

    } catch (error) {
      this.logger.error(`❌ [EventMetadataAtomizer] Error processing message:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Mapea claves de RMonitor a campos estándar
   * @param {string} key - Clave original del mensaje $E
   * @returns {string|null} - Campo estándar mapeado
   */
  mapEventKey(key) {
    const keyMappings = {
      'TRACKNAME': 'track_name',
      'TRACKLENGTH': 'track_length',
      'EVENTNAME': 'event_name',
      'EVENTDATE': 'event_date',
      'EVENTLOCATION': 'event_location',
      'WEATHER': 'weather_conditions',
      'TEMPERATURE': 'temperature',
      'ORGANIZER': 'organizer',
      'SERIES': 'series_name',
      'CLASS': 'class_info'
    };
    
    return keyMappings[key.toUpperCase()] || null;
  }
}

module.exports = EventMetadataAtomizer;
