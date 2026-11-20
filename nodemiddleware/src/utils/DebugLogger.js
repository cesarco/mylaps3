/**
 * DebugLogger.js
 * Logger especializado para warnings y campos undefined
 * Ayuda a debuggear problemas en el parsing de mensajes
 */

const fs = require('fs');
const path = require('path');

class DebugLogger {
  constructor(logDir = 'logs') {
    this.logDir = logDir;
    this.logFile = path.join(logDir, 'debug-warnings.log');
    this.undefinedFile = path.join(logDir, 'undefined-fields.log');
    
    // Crear directorio de logs si no existe
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    
    // Inicializar archivos de log
    this.initLogFiles();
  }

  /**
   * Inicializa los archivos de log con headers
   */
  initLogFiles() {
    const timestamp = new Date().toISOString();
    const separator = '='.repeat(80);
    
    const warningHeader = `${separator}\nDEBUG WARNINGS LOG - Session started: ${timestamp}\n${separator}\n\n`;
    const undefinedHeader = `${separator}\nUNDEFINED FIELDS LOG - Session started: ${timestamp}\n${separator}\n\n`;
    
    fs.writeFileSync(this.logFile, warningHeader);
    fs.writeFileSync(this.undefinedFile, undefinedHeader);
  }

  /**
   * Registra un warning general
   * @param {string} component - Componente que genera el warning
   * @param {string} message - Mensaje del warning
   * @param {Object} context - Contexto adicional
   */
  logWarning(component, message, context = {}) {
    const timestamp = new Date().toISOString();
    const logEntry = {
      timestamp,
      component,
      type: 'WARNING',
      message,
      context
    };
    
    const logLine = `[${timestamp}] ⚠️  ${component}: ${message}\n`;
    const detailLine = `   Context: ${JSON.stringify(context, null, 2)}\n\n`;
    
    fs.appendFileSync(this.logFile, logLine + detailLine);
    
    // También log a consola
    console.warn(`⚠️  [${component}] ${message}`, context);
  }

  /**
   * Registra campos undefined encontrados en mensajes
   * @param {string} messageType - Tipo de mensaje ($A, $J, etc.)
   * @param {string} messageId - ID del mensaje
   * @param {string} rawData - Datos raw del mensaje
   * @param {Object} parsedData - Datos parseados
   * @param {Array} undefinedFields - Lista de campos undefined
   */
  logUndefinedFields(messageType, messageId, rawData, parsedData, undefinedFields) {
    const timestamp = new Date().toISOString();
    
    const logEntry = {
      timestamp,
      messageType,
      messageId,
      rawData: rawData.substring(0, 100), // Truncar para evitar logs muy largos
      undefinedFields,
      parsedDataKeys: Object.keys(parsedData),
      parsedDataSample: this.getSampleFields(parsedData, 5)
    };
    
    const logLine = `[${timestamp}] 🔍 ${messageType} (${messageId}): ${undefinedFields.length} undefined fields\n`;
    const detailLine = `   Raw: ${rawData.substring(0, 60)}...\n`;
    const fieldsLine = `   Undefined: [${undefinedFields.join(', ')}]\n`;
    const parsedLine = `   Parsed Keys: [${Object.keys(parsedData).join(', ')}]\n\n`;
    
    fs.appendFileSync(this.undefinedFile, logLine + detailLine + fieldsLine + parsedLine);
    
    // También log a consola con menos detalle
    console.warn(`🔍 [${messageType}] ${undefinedFields.length} undefined fields: [${undefinedFields.join(', ')}]`);
  }

  /**
   * Registra transponder undefined específicamente
   * @param {string} messageType - Tipo de mensaje
   * @param {string} registration - Registration del driver
   * @param {string} rawData - Datos raw
   */
  logUndefinedTransponder(messageType, registration, rawData) {
    this.logWarning('TRANSPONDER_UNDEFINED', `Transponder undefined for registration ${registration}`, {
      messageType,
      registration,
      rawData: rawData.substring(0, 100)
    });
  }

  /**
   * Registra class ID undefined
   * @param {string} messageType - Tipo de mensaje
   * @param {string} rawData - Datos raw
   */
  logMissingClassId(messageType, rawData) {
    this.logWarning('CLASS_ID_MISSING', `No class ID found in ${messageType} message`, {
      messageType,
      rawData: rawData ? rawData.substring(0, 100) : 'undefined'
    });
  }

  /**
   * Registra errores de resolución de RID
   * @param {string} registration - Registration que falló
   * @param {string} component - Componente que intentó resolver
   */
  logRidResolutionFailed(registration, component) {
    this.logWarning('RID_RESOLUTION_FAILED', `Failed to resolve RID for registration ${registration}`, {
      registration,
      component
    });
  }

  /**
   * Analiza un objeto en busca de campos undefined
   * @param {Object} obj - Objeto a analizar
   * @param {Array} excludeKeys - Keys a excluir del análisis
   * @returns {Array} - Lista de campos undefined
   */
  findUndefinedFields(obj, excludeKeys = []) {
    const undefinedFields = [];
    
    Object.entries(obj).forEach(([key, value]) => {
      if (!excludeKeys.includes(key) && (value === undefined || value === null || value === '')) {
        undefinedFields.push(key);
      }
    });
    
    return undefinedFields;
  }

  /**
   * Obtiene una muestra de campos de un objeto
   * @param {Object} obj - Objeto
   * @param {number} maxFields - Máximo número de campos
   * @returns {Object} - Muestra del objeto
   */
  getSampleFields(obj, maxFields = 5) {
    const keys = Object.keys(obj).slice(0, maxFields);
    const sample = {};
    keys.forEach(key => {
      sample[key] = obj[key];
    });
    return sample;
  }

  /**
   * Registra estadísticas de mensajes procesados
   * @param {Object} stats - Estadísticas
   */
  logStats(stats) {
    const timestamp = new Date().toISOString();
    const statsLine = `[${timestamp}] 📊 STATS: ${JSON.stringify(stats, null, 2)}\n\n`;
    
    fs.appendFileSync(this.logFile, statsLine);
  }

  /**
   * Obtiene las últimas N líneas del log de warnings
   * @param {number} lines - Número de líneas
   * @returns {string} - Contenido del log
   */
  getTailWarnings(lines = 50) {
    try {
      const content = fs.readFileSync(this.logFile, 'utf8');
      const allLines = content.split('\n');
      const lastLines = allLines.slice(-lines);
      return lastLines.join('\n');
    } catch (error) {
      return `Error reading log file: ${error.message}`;
    }
  }

  /**
   * Obtiene las últimas N líneas del log de undefined fields
   * @param {number} lines - Número de líneas
   * @returns {string} - Contenido del log
   */
  getTailUndefined(lines = 50) {
    try {
      const content = fs.readFileSync(this.undefinedFile, 'utf8');
      const allLines = content.split('\n');
      const lastLines = allLines.slice(-lines);
      return lastLines.join('\n');
    } catch (error) {
      return `Error reading undefined log file: ${error.message}`;
    }
  }

  /**
   * Limpia los archivos de log
   */
  clearLogs() {
    this.initLogFiles();
    console.log('🧹 Debug logs cleared');
  }
}

module.exports = DebugLogger;
