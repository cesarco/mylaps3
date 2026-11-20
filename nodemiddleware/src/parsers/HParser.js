const BaseParser = require('./BaseParser');
const TimeUtils = require('../utils/TimeUtils');

/**
 * HParser.js
 * Parser especializado para mensajes $H (Practice/Qualifying Best Lap)
 * NUEVA ARQUITECTURA SIMPLIFICADA: Parser → LapService (directo)
 * 
 * $H — Mejores vueltas (ranking de best lap)
 * • position (int): orden por mejor tiempo (1 = mejor).
 * • reg (string): piloto.
 * • best_lap (int): número de vuelta de su mejor tiempo.
 * • best_time (string tiempo): mejor tiempo de vuelta.
 * 
 * Formato: $H,position,"registration",bestLap,"bestLapTime"
 */
class HParser extends BaseParser {
  constructor(serviceRegistry, logger = console) {
    super(logger);
    this.messageType = '$H';
    this.lapService = serviceRegistry.getLapService();
  }

  /**
   * Parsea mensaje $H — Practice/Qualifying Best Lap y llama directamente a LapService
   * @param {string} rawData - Datos crudos originales
   * @returns {Object|null} - Datos procesados o null si error
   */
  async parse(rawData) {
    // Separar por comas, respetando comillas
    const parts = this.splitCSV(rawData);
    
    if (!this.validateFieldCount(parts, 5, 'Practice/Qualifying Best Lap')) {
      return null;
    }

    try {
      const data = this.createBaseData(this.messageType, rawData);
      
      // Campos específicos del mensaje $H
      data.position = this.safeParseInt(parts[1]);
      data.registration = this.cleanString(parts[2]);
      data.driver_number = data.registration; // Para compatibilidad
      data.transponder_id = data.registration; // Para LapService
      data.lap_number = this.safeParseInt(parts[3]);
      data.lap_time = this.cleanString(parts[4]);
      
      // DEBUG: Log para detectar el problema de tiempo
      if (data.lap_time === ',') {
        this.logger.warn(`🐛 DEBUG: HParser recibió lap_time como coma. Raw: ${rawData}, Parts: ${JSON.stringify(parts)}`);
      }

      // Validaciones
      if (!data.registration || !data.position) {
        this.logger.warn(`$H: Missing required fields - registration: ${data.registration}, position: ${data.position}`);
        return null;
      }

      // NUEVA ARQUITECTURA: Llamar directamente a LapService
      const result = await this.lapService.processBestLap(data);
      data.result = result;
      
      return data;

    } catch (error) {
      this.logger.warn(`Error processing $H message: ${rawData} - ${error.message}`);
      return null;
    }
  }

  /**
   * Tipos de mensaje que maneja este parser
   */
  getMessageTypes() {
    return ['$H'];
  }
}

module.exports = HParser;
