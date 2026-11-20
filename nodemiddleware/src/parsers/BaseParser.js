/**
 * BaseParser.js
 * Clase base para todos los parsers de mensajes RMonitor
 */
class BaseParser {
  constructor(logger = console) {
    this.logger = logger;
  }

  /**
   * Limpia las comillas de un string
   * @param {string} str - String a limpiar
   * @returns {string} - String limpio
   */
  cleanString(str) {
    if (!str) return '';
    return str.replace(/"/g, '').trim();
  }

  /**
   * Convierte un string a número entero de forma segura
   * @param {string} str - String a convertir
   * @returns {number|null} - Número o null si no es válido
   */
  safeParseInt(str) {
    if (!str || str === '') return null;
    const parsed = parseInt(str);
    return isNaN(parsed) ? null : parsed;
  }

  /**
   * Convierte un string a número flotante de forma segura
   * @param {string} str - String a convertir
   * @returns {number|null} - Número o null si no es válido
   */
  safeParseFloat(str) {
    if (!str || str === '') return null;
    const parsed = parseFloat(str);
    return isNaN(parsed) ? null : parsed;
  }

  /**
   * Crea la estructura base de datos parseados
   * @param {string} messageType - Tipo de mensaje ($A, $B, etc.)
   * @param {string} rawData - Datos crudos
   * @returns {Object} - Estructura base
   */
  createBaseData(messageType, rawData) {
    return {
      messageType: messageType,
      raw: rawData,
      timestamp: new Date().toISOString()
    };
  }

  /**
   * Valida que un mensaje tenga el mínimo número de campos requeridos
   * @param {Array} parts - Partes del mensaje dividido por comas
   * @param {number} minFields - Número mínimo de campos
   * @param {string} messageType - Tipo de mensaje para el log
   * @returns {boolean} - true si es válido
   */
  validateFieldCount(parts, minFields, messageType = '') {
    if (parts.length < minFields) {
      this.logger.warn(`${messageType} message has ${parts.length} fields, expected at least ${minFields}: ${parts[0]}`);
      return false;
    }
    return true;
  }

  /**
   * Divide un string CSV respetando comillas
   * @param {string} csvString - String a dividir
   * @returns {Array} - Array de campos
   */
  splitCSV(csvString) {
    if (!csvString) return [];
    
    const results = [];
    let currentField = '';
    let inQuotes = false;
    
    for (let i = 0; i < csvString.length; i++) {
      const char = csvString[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        results.push(currentField);
        currentField = '';
      } else {
        currentField += char;
      }
    }
    
    // Añadir el último campo
    results.push(currentField);
    return results;
  }

  /**
   * Método abstracto que debe ser implementado por cada parser específico
   * @param {Array} parts - Partes del mensaje dividido por comas
   * @param {string} rawData - Datos crudos
   * @returns {Object|null} - Datos parseados o null si error
   */
  parse(parts, rawData) {
    throw new Error('parse() method must be implemented by subclass');
  }
}

module.exports = BaseParser;
