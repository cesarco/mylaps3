/**
 * DataNormalizer.js
 * Normalizador centralizado para datos de entrada
 * Convierte diferentes formatos a estructuras estándar
 * NUEVA RESPONSABILIDAD: Extrae comandos RAW puros de cualquier formato de entrada
 */

const TimeUtils = require('../utils/TimeUtils');

class DataNormalizer {
  constructor(logger = console) {
    this.logger = logger;
  }

  /**
   * FUNCIÓN PRINCIPAL: Extrae comando MyLaps RAW puro de cualquier formato de entrada
   * Esta es la función de entrada principal que maneja todos los formatos
   * @param {string|Object} inputData - Datos en cualquier formato desde Redis stream
   * @returns {string|null} - Comando MyLaps puro ($COMMAND) o null
   */
  extractRawCommand(inputData) {
    if (!inputData) {
      return null;
    }

    let rawData;

    // 1. Si es objeto (datos de stream), extraer la parte raw
    if (typeof inputData === 'object') {
      rawData = inputData.raw_data || inputData.data || inputData.message || inputData.raw_message;
      if (!rawData) {
        this.logger.debug('❓ No raw data field found in object');
        return null;
      }
    } else if (typeof inputData === 'string') {
      rawData = inputData;
    } else {
      this.logger.debug('❓ Invalid input data type');
      return null;
    }

    const cleanData = rawData.trim();

    // 2. Si ya es un comando puro (empieza con $)
    if (cleanData.startsWith('$')) {
      this.logger.debug(`✅ Raw command found: ${cleanData.substring(0, 50)}...`);
      return cleanData;
    }

    // 3. Formato de simulación: [timestamp] [message_type] $COMMAND
    const simulationMatch = cleanData.match(/\[.*?\]\s*\[.*?\]\s*(\$.+)/);
    if (simulationMatch) {
      const extracted = simulationMatch[1].trim();
      this.logger.debug(`🔧 Extracted from simulation format: ${extracted.substring(0, 50)}...`);
      return extracted;
    }

    // 4. Formato con timestamp y comando: timestamp $COMMAND
    const timestampMatch = cleanData.match(/\d{4}-\d{2}-\d{2}.*?(\$.+)/);
    if (timestampMatch) {
      const extracted = timestampMatch[1].trim();
      this.logger.debug(`🔧 Extracted from timestamp format: ${extracted.substring(0, 50)}...`);
      return extracted;
    }

    // 5. Buscar cualquier $COMMAND en el string
    const commandMatch = cleanData.match(/(\$[A-Z,]+[^$]*)/);
    if (commandMatch) {
      const extracted = commandMatch[1].trim();
      this.logger.debug(`🔧 Extracted command from text: ${extracted.substring(0, 50)}...`);
      return extracted;
    }

    // 6. Formato legacy de logs: puede tener prefijos
    const legacyMatch = cleanData.match(/.*?(\$[A-Z][^$]*)/);
    if (legacyMatch) {
      const extracted = legacyMatch[1].trim();
      this.logger.debug(`🔧 Extracted from legacy format: ${extracted.substring(0, 50)}...`);
      return extracted;
    }

    // 7. No se encontró comando válido
    this.logger.warning(`❌ No MyLaps command found in: ${cleanData.substring(0, 100)}...`);
    return null;
  }

  /**
   * Normaliza datos de tiempo en un objeto
   * @param {Object} data - Datos que pueden contener tiempos
   * @returns {Object} - Datos con tiempos normalizados
   */
  normalizeTimeData(data) {
    const normalizedData = { ...data };
    
    // Campos de tiempo comunes
    const timeFields = [
      'lap_time',
      'best_lap_time', 
      'last_lap_time',
      'current_lap_time',
      'total_time',
      'race_time'
    ];

    timeFields.forEach(field => {
      if (normalizedData[field] && !normalizedData[`${field}_ms`]) {
        const timeMs = TimeUtils.timeToMilliseconds(normalizedData[field]);
        if (timeMs !== null) {
          normalizedData[`${field}_ms`] = timeMs;
        }
      }
    });

    // Casos especiales
    if (normalizedData.total_time && !normalizedData.race_time_ms) {
      const raceTimeMs = TimeUtils.timeToMilliseconds(normalizedData.total_time);
      if (raceTimeMs !== null) {
        normalizedData.race_time_ms = raceTimeMs;
        normalizedData.race_time = normalizedData.total_time;
      }
    }
    
    return normalizedData;
  }

  /**
   * Normaliza datos de piloto
   * @param {Object} driverData - Datos del piloto
   * @returns {Object} - Datos normalizados
   */
  normalizeDriverData(driverData) {
    const normalized = { ...driverData };
    
    // Limpiar campos de texto
    ['first_name', 'last_name', 'extra', 'bib'].forEach(field => {
      if (normalized[field]) {
        normalized[field] = normalized[field].replace(/"/g, '').trim();
      }
    });

    // Generar nombre completo si no existe
    if (!normalized.name && (normalized.first_name || normalized.last_name)) {
      normalized.name = `${normalized.first_name || ''} ${normalized.last_name || ''}`.trim();
    }

    // Normalizar IDs numéricos
    ['class_id', 'transponder_id'].forEach(field => {
      if (normalized[field] && typeof normalized[field] === 'string') {
        const numericValue = parseInt(normalized[field]);
        if (!isNaN(numericValue)) {
          normalized[field] = numericValue.toString();
        }
      }
    });

    return normalized;
  }

  /**
   * Normaliza datos de vuelta
   * @param {Object} lapData - Datos de la vuelta
   * @returns {Object} - Datos normalizados
   */
  normalizeLapData(lapData) {
    let normalized = this.normalizeTimeData(lapData);
    
    // Normalizar números de vuelta
    if (normalized.lap_number) {
      const lapNum = parseInt(normalized.lap_number);
      if (!isNaN(lapNum)) {
        normalized.lap_number = lapNum;
      }
    }

    // Normalizar posición
    if (normalized.position) {
      const pos = parseInt(normalized.position);
      if (!isNaN(pos)) {
        normalized.position = pos;
      }
    }

    return normalized;
  }

  /**
   * Normaliza datos de posición/clasificación
   * @param {Object} positionData - Datos de posición
   * @returns {Object} - Datos normalizados
   */
  normalizePositionData(positionData) {
    let normalized = this.normalizeTimeData(positionData);
    
    // Normalizar vueltas totales
    if (normalized.total_laps) {
      const totalLaps = parseInt(normalized.total_laps);
      if (!isNaN(totalLaps)) {
        normalized.total_laps = totalLaps;
      }
    }

    // Normalizar posición
    if (normalized.position) {
      const pos = parseInt(normalized.position);
      if (!isNaN(pos)) {
        normalized.position = pos;
      }
    }

    return normalized;
  }

  /**
   * Normaliza datos según el tipo de mensaje
   * @param {Object} data - Datos a normalizar
   * @param {string} messageType - Tipo de mensaje
   * @returns {Object} - Datos normalizados
   */
  normalizeByType(data, messageType) {
    switch (messageType) {
      case 'LAP_DATA':
      case '$H':
        return this.normalizeLapData(data);
        
      case 'POSITION_DATA':
      case '$G':
        return this.normalizePositionData(data);
        
      case 'DRIVER_REG':
      case 'COMPETITOR_INFO':
      case '$A':
      case '$COMP':
        return this.normalizeDriverData(data);
        
      case 'RECOGNIZED':
      case '$J':
        return this.normalizeTimeData(data);
        
      default:
        return this.normalizeTimeData(data); // Fallback básico
    }
  }

  /**
   * Obtiene estadísticas del normalizador
   * @returns {Object} - Estadísticas
   */
  getStats() {
    return {
      normalizer_type: 'DataNormalizer',
      main_capability: 'raw_command_extraction',
      supported_input_formats: [
        'pure_raw_command',
        'simulation_format', 
        'timestamped_format',
        'legacy_log_format',
        'stream_object_format'
      ],
      supported_normalization_types: [
        'LAP_DATA',
        'POSITION_DATA', 
        'DRIVER_REG',
        'COMPETITOR_INFO',
        'RECOGNIZED'
      ],
      capabilities: [
        'raw_command_extraction',
        'time_normalization',
        'driver_data_cleanup',
        'numeric_conversion',
        'type_specific_normalization'
      ]
    };
  }
}

module.exports = DataNormalizer;
