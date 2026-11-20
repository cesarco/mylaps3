const BaseParser = require('./BaseParser');

/**
 * EParser.js
 * Parser especializado para mensajes $E (Event Metadata/Settings)
 * NUEVA ARQUITECTURA: Parser → SessionService
 * 
 * $E — Metadatos de evento (par clave/valor)
 * • key (string): nombre de la propiedad (ej.: TRACKNAME, TRACKLENGTH, etc.).
 * • value (string): valor asociado (ej.: "Autódromo X", "3.200").
 * Notas típicas:
 * • TRACKNAME: nombre del circuito.
 * • TRACKLENGTH: longitud (frecuente en km con punto decimal).
 * 
 * Formato: $E,"KEY","VALUE"
 */
class EParser extends BaseParser {
  constructor(serviceRegistry, logger = console) {
    super(logger);
    this.messageType = '$E';
    this.sessionService = serviceRegistry.getSessionService();
  }

  /**
   * Parsea mensaje $E — Event Metadata/Settings y llama directamente a SessionService
   * @param {string} rawData - Datos crudos originales
   * @returns {Object|null} - Datos procesados o null si error
   */
  async parse(rawData) {
    // Separar por comas, respetando comillas
    const parts = this.splitCSV(rawData);
    
    if (!this.validateFieldCount(parts, 3, 'Event Metadata')) {
      return null;
    }

    try {
      const data = this.createBaseData(this.messageType, rawData);
      
      // Campos específicos del mensaje $E
      data.type = "E"; // Tipo de mensaje
      data.key = this.cleanString(parts[1]);
      data.value = this.cleanString(parts[2]);

      // Campos derivados útiles para el procesador
      data.setting_key = data.key;
      data.setting_value = data.value;
      data.metadata_type = this.inferMetadataType(data.key);

      // Validaciones
      if (!data.key) {
        this.logger.warn(`$E: Missing key: ${rawData}`);
        return null;
      }

      // NUEVA ARQUITECTURA: Llamar directamente a SessionService
      const result = await this.sessionService.updateEventMetadata(data);
      data.result = result;

      return data;

    } catch (error) {
      this.logger.warn(`Error processing $E message: ${rawData} - ${error.message}`);
      return null;
    }
  }

  /**
   * Infiere el tipo de metadato basado en la clave
   */
  inferMetadataType(key) {
    const lowerKey = key.toLowerCase();
    if (lowerKey.includes('time') || lowerKey.includes('date')) return 'temporal';
    if (lowerKey.includes('track') || lowerKey.includes('circuit')) return 'track';
    if (lowerKey.includes('event') || lowerKey.includes('race')) return 'event';
    if (lowerKey.includes('weather') || lowerKey.includes('temp')) return 'weather';
    return 'general';
  }

  /**
   * Tipos de mensaje que maneja este parser
   */
  getMessageTypes() {
    return ['$E'];
  }
}

module.exports = EParser;
