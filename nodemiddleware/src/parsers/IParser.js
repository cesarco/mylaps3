const BaseParser = require('./BaseParser');

/**
 * IParser.js
 * Parser especializado para mensajes $I (Init/Resync)
 * 
 * $I — Init/epoch (inicio/re-sync)
 * • time_of_day (string HH:MM:SS.mmm): hora local del "init".
 * • date (string dd mmm yy): fecha del "init".
 * (Se usa para marcar/incrementar "epoch" y forzar resync lógico.)
 * 
 * Formato: $I,"time","date"
 */
class IParser extends BaseParser {
  constructor(serviceRegistry, logger = console) {
    super(logger);
    this.messageType = '$I';
    this.sessionService = serviceRegistry ? serviceRegistry.getSessionService() : null;
  }

  /**
   * Parsea mensaje $I — Init/Resync
   * @param {string} rawData - Datos crudos originales
   * @returns {Object|null} - Datos parseados o null si error
   */
  async parse(rawData) {
    // Separar por comas, respetando comillas
    const parts = this.splitCSV(rawData);
    
    if (!this.validateFieldCount(parts, 3, 'Init/Resync')) {
      return null;
    }

    try {
      const data = this.createBaseData(this.messageType, rawData);
      
      // Campos específicos del mensaje $I
      data.type = "I"; // Tipo de mensaje
      data.time = this.cleanString(parts[1]);
      data.date = this.cleanString(parts[2]);

      // Campos derivados útiles para el procesador
      data.system_time = data.time;
      data.system_date = data.date;
      data.event_type = 'SYSTEM_INIT';
      data.full_datetime = this.combineDateTime(data.date, data.time);

      // Si hay servicio de sesión disponible, actualizar información de inicialización
      if (this.sessionService) {
        try {
          const result = await this.sessionService.updateSystemTime(data);
          data.result = result;
        } catch (serviceError) {
          this.logger.warn(`Error al actualizar tiempo del sistema: ${serviceError.message}`);
        }
      }

      return data;

    } catch (error) {
      this.logger.warn(`Error parsing $I message: ${rawData} - ${error.message}`);
      return null;
    }
  }

  /**
   * Combina fecha y hora en un string datetime
   */
  combineDateTime(date, time) {
    if (!date || !time) return null;
    
    try {
      // Formato típico: date="DD/MM/YYYY", time="HH:MM:SS"
      const [day, month, year] = date.split('/');
      const datetime = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${time}`;
      return datetime;
    } catch (error) {
      return `${date} ${time}`;
    }
  }

  /**
   * Tipos de mensaje que maneja este parser
   */
  getMessageTypes() {
    return ['$I'];
  }
}

module.exports = IParser;
