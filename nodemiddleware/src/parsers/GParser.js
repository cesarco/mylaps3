const BaseParser = require('./BaseParser');
const TimeUtils = require('../utils/TimeUtils');

/**
 * GParser.js
 * Parser especializado para mensajes $G (Race Position/Times)
 * NUEVA ARQUITECTURA: Parser → NewLeaderboardService (solo este)
 * 
 * $G — Clasificación final (snapshot de posiciones)
 * • position (int): posición absoluta.
 * • reg (string): piloto/competidor.
 * • laps (int): vueltas completadas.
 * • total_time (string tiempo): tiempo total acumulado.
 * 
 * Formato: $G,position,"registration",laps?,"totalTime"
 */
class GParser extends BaseParser {
  constructor(serviceRegistry, logger = console) {
    super(logger);
    this.messageType = '$G';
    this.newLeaderboardService = serviceRegistry.getNewLeaderboardService();
  }

  /**
   * Parsea mensaje $G — Race Position/Times y llama directamente a NewLeaderboardService
   * @param {string} rawData - Datos crudos originales
   * @returns {Object|null} - Datos procesados o null si error
   */
  async parse(rawData) {
    // Separar por comas, respetando comillas
    const parts = this.splitCSV(rawData);
    
    if (!this.validateFieldCount(parts, 4, 'Race Position')) {
      return null;
    }

    try {
      const data = this.createBaseData(this.messageType, rawData);
      
      // Campos específicos del mensaje $G
      data.position = this.safeParseInt(parts[1]);
      data.driver_number = this.cleanString(parts[2]);
      data.laps_completed = this.safeParseInt(parts[3]) || 0;
      data.total_time = this.cleanString(parts[4]);

      // Conversión de tiempos a milisegundos
      if (data.total_time) {
        data.race_time_ms = TimeUtils.timeToMilliseconds(data.total_time);
      }

      // Validaciones
      if (!data.driver_number || !data.position) {
        this.logger.warn(`$G: Missing required fields - driver_number: ${data.driver_number}, position: ${data.position}`);
        return null;
      }

      // NUEVA ARQUITECTURA: Solo NewLeaderboardService
      const result = await this.newLeaderboardService.updatePosition(
        data.driver_number, // driverid
        data.position,      // newPosition
        {
          laps: data.laps_completed,
          total_ms: data.race_time_ms
        }
      );
      data.result = result;

      return data;

    } catch (error) {
      this.logger.warn(`Error processing $G message: ${rawData} - ${error.message}`);
      return null;
    }
  }

  /**
   * Tipos de mensaje que maneja este parser
   */
  getMessageTypes() {
    return ['$G'];
  }
}

module.exports = GParser;
