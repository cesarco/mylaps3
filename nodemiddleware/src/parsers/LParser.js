const BaseParser = require('./BaseParser');

/**
 * LParser.js
 * Parser especializado para mensajes $L (Line Crossing - IMSA)
 * 
 * $L (line/split crossing): suele llevar reg, split/line_id, split_time/total, para sectores intermedios.
 * (Opcional según proveedor/versión - mensajería estilo IMSA)
 * 
 * Formato: $L,"number","timelineNumber","timelineName","date","time",driverId?,"className?"
 */
class LParser extends BaseParser {
  constructor(serviceRegistry, logger = console) {
    super(logger);
    this.messageType = '$L';
    this.sessionService = serviceRegistry ? serviceRegistry.getSessionService() : null;
  }

  /**
   * Parsea mensaje $L — Line Crossing (IMSA)
   * @param {string} rawData - Datos crudos originales
   * @returns {Object|null} - Datos parseados o null si error
   */
  async parse(rawData) {
    // Separar por comas, respetando comillas
    const parts = this.splitCSV(rawData);
    
    if (!this.validateFieldCount(parts, 6, 'Line Crossing')) {
      return null;
    }

    try {
      const data = this.createBaseData(this.messageType, rawData);
      
      // Campos específicos del mensaje $L
      data.type = "L"; // Tipo de mensaje
      data.number = this.cleanString(parts[1]);
      data.timeline_number = this.cleanString(parts[2]);
      data.timeline_name = this.cleanString(parts[3]);
      data.date = this.cleanString(parts[4]);
      data.time = this.cleanString(parts[5]);
      data.driver_id = parts[6] ? this.safeParseInt(parts[6]) : null;
      data.class_name = parts[7] ? this.cleanString(parts[7]) : null;

      // Campos derivados útiles para el procesador
      data.crossing_point = data.timeline_name;
      data.crossing_datetime = this.combineDateTime(data.date, data.time);
      data.imsa_specific = true;

      // Si hay servicio de sesión disponible, actualizar datos de la línea
      if (this.sessionService) {
        try {
          const result = await this.sessionService.updateTrackLine(data);
          data.result = result;
        } catch (serviceError) {
          this.logger.warn(`Error al actualizar línea de pista: ${serviceError.message}`);
        }
      }

      return data;

    } catch (error) {
      this.logger.warn(`Error parsing $L message: ${rawData} - ${error.message}`);
      return null;
    }
  }

  /**
   * Combina fecha y hora
   */
  combineDateTime(date, time) {
    if (!date || !time) return null;
    return `${date} ${time}`;
  }

  /**
   * Tipos de mensaje que maneja este parser
   */
  getMessageTypes() {
    return ['$L'];
  }
}

module.exports = LParser;
