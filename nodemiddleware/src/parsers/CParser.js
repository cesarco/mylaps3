const BaseParser = require('./BaseParser');

/**
 * CParser.js
 * Parser especializado para mensajes $C (Class Definition)
 * NUEVA ARQUITECTURA: Parser → SessionService
 * 
 * $C — Definición de clase
 * • class_id (int): ID de la clase.
 * • class_name (string): nombre corto/visible de la clase (p. ej., "RS", "PRO").
 * 
 * Formato: $C,classNumber,"description"
 */
class CParser extends BaseParser {
  constructor(serviceRegistry, logger = console) {
    super(logger);
    this.messageType = '$C';
    this.sessionService = serviceRegistry.getSessionService();
  }

  /**
   * Parsea mensaje $C — Class Definition
   * @param {string} rawData - Datos crudos originales
   * @returns {Object|null} - Datos parseados o null si error
   */
  async parse(rawData) {
    // Separar por comas, respetando comillas
    const parts = this.splitCSV(rawData);
    
    if (!this.validateFieldCount(parts, 3, 'Class Definition')) {
      return null;
    }

    try {
      const data = this.createBaseData(this.messageType, rawData);
      
      // Campos específicos del mensaje $C
      data.type = "C"; // Tipo de mensaje
      data.class_number = this.safeParseInt(parts[1]);
      data.description = this.cleanString(parts[2]);

      // Campos derivados útiles para el procesador
      data.class_id = data.class_number;
      data.class_name = data.description;
      data.class_key = `class_${data.class_number}`;

      // Validaciones
      if (!data.class_number) {
        this.logger.warn(`$C: Missing class number: ${rawData}`);
        return null;
      }

      // NUEVA ARQUITECTURA: Llamar directamente a SessionService
      const result = await this.sessionService.updateClassInfo(data);
      data.result = result;

      return data;

    } catch (error) {
      this.logger.warn(`Error parsing $C message: ${rawData} - ${error.message}`);
      return null;
    }
  }

  /**
   * Tipos de mensaje que maneja este parser
   */
  getMessageTypes() {
    return ['$C'];
  }
}

module.exports = CParser;
