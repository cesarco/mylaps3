const BaseParser = require('./BaseParser');

/**
 * TParser.js
 * Parser especializado para mensajes $T (Track Description - IMSA)
 * 
 * $T (track/sections): define secciones/splits del circuito (IDs, nombres, offsets).
 * (Opcional según proveedor/versión - mensajería estilo IMSA)
 * 
 * Formato: $T,"name","shortName","distance",sectionCount,[sections...]
 */
class TParser extends BaseParser {
  constructor(serviceRegistry, logger = console) {
    super(logger);
    this.messageType = '$T';
    this.sessionService = serviceRegistry ? serviceRegistry.getSessionService() : null;
  }

  /**
   * Parsea mensaje $T — Track Description (IMSA)
   * @param {string} rawData - Datos crudos originales
   * @returns {Object|null} - Datos parseados o null si error
   */
  async parse(rawData) {
    // Separar por comas, respetando comillas
    const parts = this.splitCSV(rawData);
    
    if (!this.validateFieldCount(parts, 5, 'Track Description')) {
      return null;
    }

    try {
      const data = this.createBaseData(this.messageType, rawData);
      
      // Campos específicos del mensaje $T
      data.type = "T"; // Tipo de mensaje
      data.name = this.cleanString(parts[1]);
      data.short_name = this.cleanString(parts[2]);
      data.distance = this.cleanString(parts[3]);
      data.section_count = this.safeParseInt(parts[4]) || 0;
      
      // Parse sections
      data.sections = [];
      let sectionIndex = 5;
      for (let i = 0; i < data.section_count; i++) {
        if (sectionIndex + 3 < parts.length) {
          data.sections.push({
            name: this.cleanString(parts[sectionIndex]),
            from: this.cleanString(parts[sectionIndex + 1]),
            to: this.cleanString(parts[sectionIndex + 2]),
            length: this.cleanString(parts[sectionIndex + 3])
          });
          sectionIndex += 4;
        }
      }

      // Campos derivados útiles para el procesador
      data.track_name = data.name;
      data.track_layout = data.sections;
      data.imsa_specific = true;

      // Si hay servicio de sesión disponible, actualizar información de pista
      if (this.sessionService) {
        try {
          const result = await this.sessionService.updateTrackInfo(data);
          data.result = result;
        } catch (serviceError) {
          this.logger.warn(`Error al actualizar información de pista: ${serviceError.message}`);
        }
      }

      return data;

    } catch (error) {
      this.logger.warn(`Error parsing $T message: ${rawData} - ${error.message}`);
      return null;
    }
  }

  /**
   * Tipos de mensaje que maneja este parser
   */
  getMessageTypes() {
    return ['$T'];
  }
}

module.exports = TParser;
