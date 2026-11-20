const BaseParser = require('./BaseParser');

/**
 * AParser.js
 * Parser especializado para mensajes $A (Driver Registration)
 * NUEVA ARQUITECTURA: Parser → DriverService (maneja registro completo)
 * 
 * $A — Registro de piloto (competitor/entry)
 * • reg (string): identificador del piloto/competidor en RMonitor.
 * • number (string): dorsal mostrado (puede incluir letras).
 * • transponder (int): ID del transponder.
 * • first (string): nombre.
 * • last (string): apellido(s).
 * • nationality (string): nacionalidad (a veces vacío).
 * • class (int): identificador numérico de la clase en la sesión.
 * 
 * Formato: $A,"registration","number",transponder,"first","last","nationality",classNumber
 */
class AParser extends BaseParser {
  constructor(serviceRegistry, logger = console) {
    super(logger);
    this.messageType = '$A';
    this.driverService = serviceRegistry.getDriverService();
  }

  /**
   * Parsea mensaje $A — Driver Registration y llama directamente a DriverService
   * @param {string} rawData - Datos crudos originales
   * @returns {Object|null} - Datos procesados o null si error
   */
  async parse(rawData) {
    // Separar por comas, respetando comillas
    const parts = this.splitCSV(rawData);
    
    if (!this.validateFieldCount(parts, 8, 'Driver Registration')) {
      return null;
    }

    try {
      const data = this.createBaseData(this.messageType, rawData);
      
      // Campos específicos del mensaje $A
      data.registration = this.cleanString(parts[1]);
      data.number = this.cleanString(parts[2]);
      data.transponder_id = this.safeParseInt(parts[3]);
      data.first_name = this.cleanString(parts[4]);
      data.last_name = this.cleanString(parts[5]);
      data.nationality = this.cleanString(parts[6]);
      data.class_number = this.safeParseInt(parts[7]);

      // Campos derivados útiles
      data.full_name = `${data.first_name} ${data.last_name}`.trim();
      
      // Validaciones básicas
      if (!data.registration) {
        this.logger.warn(`$A: Missing required field - registration`);
        return null;
      }

      // NUEVA ARQUITECTURA: DriverService maneja registro completo
      // Con mensajes $A, siempre verificamos si ya existe un RID
      const result = await this.driverService.registerDriver(data, true);
      data.result = result;
      
      return data;

    } catch (error) {
      this.logger.warn(`Error processing $A message: ${rawData} - ${error.message}`);
      return null;
    }
  }

  /**
   * Tipos de mensaje que maneja este parser
   */
  getMessageTypes() {
    return ['$A'];
  }
}

module.exports = AParser;
