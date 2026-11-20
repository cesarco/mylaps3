const BaseParser = require('./BaseParser');
const TimeUtils = require('../utils/TimeUtils');

/**
 * FParser.js
 * Parser especializado para mensajes $F (Heartbeat/Flag Status)
 * NUEVA ARQUITECTURA: Parser → SessionService
 * 
 * $F — Estado/heartbeat de sesión (banderas y tiempos de sesión)
 * • laps_to_go (int): vueltas restantes (0 si terminó).
 * • time_to_go (string tiempo): tiempo restante del reloj de sesión (si aplica).
 * • time_of_day (string HH:MM:SS): hora local del momento del mensaje.
 * • race_time (string tiempo): tiempo transcurrido total de carrera.
 * • flag (string): estado de bandera. Valores comunes: "Green", "Yellow", "Red", "Finish" (a veces viene en blanco/espacios).
 * 
 * Formato: $F,lapsToGo,"timeToGo","timeOfDay","raceTime","flag"
 */
class FParser extends BaseParser {
  constructor(serviceRegistry, logger = console) {
    super(logger);
    this.messageType = '$F';
    this.sessionService = serviceRegistry.getSessionService();
  }

  /**
   * Parsea mensaje $F — Heartbeat/Flag Status y llama directamente a SessionService
   * @param {string} rawData - Datos crudos originales
   * @returns {Object|null} - Datos procesados o null si error
   */
  async parse(rawData) {
    // Separar por comas, respetando comillas
    const parts = this.splitCSV(rawData);
    
    if (!this.validateFieldCount(parts, 6, 'Heartbeat/Flag Status')) {
      return null;
    }

    try {
      const data = this.createBaseData(this.messageType, rawData);
      
      // Campos específicos del mensaje $F
      data.laps_to_go = this.safeParseInt(parts[1]);
      data.time_to_go = this.cleanString(parts[2]);
      data.time_of_day = this.cleanString(parts[3]);
      data.race_time = this.cleanString(parts[4]);
      data.flag = this.cleanString(parts[5]);

      // Detalle adicional de logging para procesamiento de flags
      this.logger.debug(`🏁 Processing flag message: Laps to go: ${data.laps_to_go}, Flag: ${data.flag}, Time: ${data.race_time}`);

      // Conversión de tiempos a milisegundos
      if (data.race_time) {
        data.race_time_ms = TimeUtils.timeToMilliseconds(data.race_time);
        this.logger.debug(`⏱️ Converted race_time ${data.race_time} → ${data.race_time_ms}ms`);
      }
      if (data.time_to_go) {
        data.time_to_go_ms = TimeUtils.timeToMilliseconds(data.time_to_go);
      }
      if (data.time_of_day) {
        data.time_of_day_ms = TimeUtils.timeToMilliseconds(data.time_of_day);
      }

      // Campos derivados para información
      data.flag_description = this.getFlagDescription(data.flag);
      data.session_status = this.getSessionStatus(data.flag);
      this.logger.debug(`🏁 Flag status: ${data.flag} (${data.flag_description}) - Session: ${data.session_status}`);

      // NUEVA ARQUITECTURA: Llamar directamente a SessionService
      const result = await this.sessionService.updateFlags(data);
      data.result = result;
      
      // Verificar que los datos se guardaron correctamente
      try {
        const verificationResult = await this.sessionService.verifySessionStorage();
        this.logger.info(`🔍 Flag verification after update: ${verificationResult.hasFlags ? '✅ Flags found' : '❌ No flags found'} in ${verificationResult.sessionKey}`);
      } catch (verifyError) {
        this.logger.warn(`⚠️ Could not verify flag storage: ${verifyError.message}`);
      }
      
      return data;

    } catch (error) {
      this.logger.warn(`Error processing $F message: ${rawData} - ${error.message}`);
      return null;
    }
  }

  /**
   * Obtiene descripción de la bandera
   */
  getFlagDescription(flag) {
    const flagDescriptions = {
      'GREEN': 'Race Start/Resume',
      'YELLOW': 'Caution',
      'RED': 'Stop Race',
      'CHECKERED': 'Race Finish',
      'BLACK': 'Disqualification',
      'WHITE': 'One Lap to Go',
      'BLUE': 'Let Faster Car Pass'
    };
    return flagDescriptions[flag] || flag || 'Unknown Flag';
  }

  /**
   * Obtiene estado de la sesión basado en la bandera
   */
  getSessionStatus(flag) {
    if (['GREEN'].includes(flag)) return 'racing';
    if (['YELLOW', 'BLUE', 'WHITE'].includes(flag)) return 'caution';
    if (['RED', 'BLACK'].includes(flag)) return 'stopped';
    if (['CHECKERED'].includes(flag)) return 'finished';
    return 'unknown';
  }

  /**
   * Tipos de mensaje que maneja este parser
   */
  getMessageTypes() {
    return ['$F'];
  }
}

module.exports = FParser;
