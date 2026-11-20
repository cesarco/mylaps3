const BaseParser = require('./BaseParser');
const TimeUtils = require('../utils/TimeUtils');

/**
 * JParser.js
 * Parser especializado para mensajes $J (PASSING - VUELTAS INDIVIDUALES)
 * 
 * $J — Passing (cada vez que un piloto completa una vuelta)
 * • reg (string): piloto.
 * • lap_time (string tiempo): tiempo de la vuelta recién completada.
 * • total_time (string tiempo): acumulado total hasta ese paso por meta.
 * (Este es el mensaje base para vueltas y posiciones "en vivo".)
 * 
 * Formato: $J,"registration","lapTime","totalTime"
 * 
 * ⭐ IMPORTANTE: Los mensajes $J son los eventos de vuelta reales!
 */
class JParser extends BaseParser {
  constructor(serviceRegistry, logger = console) {
    super(logger);
    this.messageType = '$J';
    this.serviceRegistry = serviceRegistry;
    this.lapService = serviceRegistry ? serviceRegistry.getLapService() : null;
  }

  /**
   * Parsea mensaje $J — Passing (Vuelta Individual)
   * @param {string} rawData - Datos crudos originales
   * @returns {Object|null} - Datos parseados o null si error
   */
  async parse(rawData) {
    // Separar por comas, respetando comillas
    const parts = this.splitCSV(rawData);
    
    if (!this.validateFieldCount(parts, 4, 'Passing (Lap)')) {
      return null;
    }

    try {
      const data = this.createBaseData(this.messageType, rawData);
      
      // Campos específicos del mensaje $J
      data.type = "J"; // Tipo de mensaje
      data.registration = this.cleanString(parts[1]);
      data.driver_number = data.registration; // Alias para consistencia
      data.transponder_id = data.registration; // Para LapService 
      data.lap_time = this.cleanString(parts[2]);
      data.total_time = this.cleanString(parts[3]);

      // Conversión de tiempos a milisegundos
      if (data.lap_time) {
        data.lap_ms = TimeUtils.timeToMilliseconds(data.lap_time);
        data.lap_time_ms = data.lap_ms; // Alias para retrocompatibilidad
      }
      if (data.total_time) {
        data.total_ms = TimeUtils.timeToMilliseconds(data.total_time);
        data.race_time_ms = data.total_ms; // Alias para retrocompatibilidad
      }

      // Campos derivados útiles para el procesador
      data.driver_id = data.registration;
      data.event_type = 'LAP_COMPLETED';
      data.crossing_time = new Date().toISOString();

      // Validaciones
      if (!data.registration) {
        this.logger.warn(`$J: Missing registration: ${rawData}`);
        return null;
      }

      if (!data.lap_ms && !data.total_ms) {
        this.logger.warn(`$J: No valid times found: ${rawData}`);
        return null;
      }
      
      // NUEVA ARQUITECTURA: Llamar directamente a LapService si está disponible
      if (this.lapService) {
        try {
          const result = await this.lapService.processPassing(data);
          data.result = result;
        } catch (serviceError) {
          this.logger.warn(`Error en servicio de vueltas: ${serviceError.message}`);
        }
      }

      return data;

    } catch (error) {
      this.logger.warn(`Error parsing $J message: ${rawData} - ${error.message}`);
      return null;
    }
  }

  /**
   * Tipos de mensaje que maneja este parser
   */
  getMessageTypes() {
    return ['$J'];
  }
}

module.exports = JParser;
