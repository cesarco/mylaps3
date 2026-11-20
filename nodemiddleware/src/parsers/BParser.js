const BaseParser = require('./BaseParser');

/**
 * BParser.js
 * Parser especializado para mensajes $B (Run/Session Info)
 * NUEVA ARQUITECTURA: Parser → SessionService
 * 
 * $B — Identificación de sesión ("run")
 * • run_number (int): número de carrera/sesión.
 * • description (string): nombre/etiqueta de la sesión (p. ej., "Race 1", "Qualy RS").
 * 
 * Formato: $B,runNumber,"description"
 */
class BParser extends BaseParser {
  constructor(serviceRegistry, logger = console) {
    super(logger);
    this.messageType = '$B';
    this.sessionService = serviceRegistry.getSessionService();
    
    this.logger.info(`🔧 BParser initialized successfully - SessionService: ${!!this.sessionService}`);
  }

  /**
   * Parsea mensaje $B — Run/Session Info y llama directamente a SessionService
   * @param {string} rawData - Datos crudos originales
   * @returns {Object|null} - Datos procesados o null si error
   */
  async parse(rawData) {
    // Separar por comas, respetando comillas
    const parts = this.splitCSV(rawData);
    
    if (!this.validateFieldCount(parts, 3, 'Session Info')) {
      return null;
    }

    try {
      const data = this.createBaseData(this.messageType, rawData);
      
      // Campos específicos del mensaje $B
      data.type = "B"; // Tipo de mensaje
      data.run_number = this.safeParseInt(parts[1]);
      data.description = this.cleanString(parts[2]);

      // Campos derivados útiles para el procesador
      data.session_id = `run_${data.run_number}`;
      data.session_name = data.description || `Run ${data.run_number}`;
      data.status = 'active';

      // NUEVA ARQUITECTURA: Llamar directamente a SessionService
      const result = await this.sessionService.updateRunInfo(data);
      data.result = result;

      return data;

    } catch (error) {
      this.logger.warn(`Error processing $B message: ${rawData} - ${error.message}`);
      return null;
    }
  }

  /**
   * Tipos de mensaje que maneja este parser
   */
  getMessageTypes() {
    return ['$B'];
  }
}

module.exports = BParser;
