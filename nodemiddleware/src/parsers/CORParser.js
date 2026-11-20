const BaseParser = require('./BaseParser');
const TimeUtils = require('../utils/TimeUtils');

/**
 * CORParser.js
 * Parser especializado para mensajes $COR (Time Correction)
 * 
 * $COR — Corrección de tiempos
 * • reg (string): piloto a corregir.
 * • alias/number (string): a veces repite número o alias; puede no ser usado.
 * • lap_count (int): vuelta a la que aplica la corrección.
 * • new_total_time (string tiempo): nuevo acumulado total tras la corrección.
 * • note (string, opcional): motivo/observación (p. ej., "-500ms").
 * 
 * Formato: $COR,"registration","number",laps,"totalTime","correction"
 */
class CORParser extends BaseParser {
  constructor(serviceRegistry, logger = console) {
    super(logger);
    this.messageType = '$COR';
    this.driverService = serviceRegistry ? serviceRegistry.getDriverService() : null;
  }

  /**
   * Parsea mensaje $COR — Time Correction
   * @param {string} rawData - Datos crudos originales
   * @returns {Object|null} - Datos parseados o null si error
   */
  async parse(rawData) {
    // Separar por comas, respetando comillas
    const parts = this.splitCSV(rawData);
    
    if (!this.validateFieldCount(parts, 6, 'Time Correction')) {
      return null;
    }

    try {
      const data = this.createBaseData(this.messageType, rawData);
      
      // Campos específicos del mensaje $COR
      data.type = "COR"; // Tipo de mensaje
      data.registration = this.cleanString(parts[1]);
      data.number = this.cleanString(parts[2]);
      data.laps = this.safeParseInt(parts[3]);
      data.total_time = this.cleanString(parts[4]);
      data.correction = this.cleanString(parts[5]);

      // Conversión de tiempos a milisegundos
      if (data.total_time) {
        data.race_time_ms = TimeUtils.timeToMilliseconds(data.total_time);
      }

      // Campos derivados útiles para el procesador
      data.driver_id = data.registration;
      data.corrected_total_time = data.total_time;
      data.correction_reason = data.correction;

      // Validaciones
      if (!data.registration) {
        this.logger.warn(`$COR: Missing registration: ${rawData}`);
        return null;
      }

      // Si hay servicio de driver disponible, actualizar tiempo corregido
      if (this.driverService) {
        try {
          const result = await this.driverService.updateDriverCentralized({
            driverid: data.registration,
            total_ms: data.race_time_ms,
            laps: data.laps
          });
          data.result = result;
        } catch (serviceError) {
          this.logger.warn(`Error al actualizar corrección de tiempo: ${serviceError.message}`);
        }
      }

      return data;

    } catch (error) {
      this.logger.warn(`Error parsing $COR message: ${rawData} - ${error.message}`);
      return null;
    }
  }

  /**
   * Tipos de mensaje que maneja este parser
   */
  getMessageTypes() {
    return ['$COR'];
  }
}

module.exports = CORParser;
