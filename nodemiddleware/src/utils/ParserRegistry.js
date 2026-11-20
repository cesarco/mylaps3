/**
 * ParserRegistry.js
 * Registry centralizado de parsers independientes
 * NUEVA ARQUITECTURA: MessageProcessor usa parsers especializados
 */

// Importar todos los parsers especializados
const AParser = require('../parsers/AParser');
const BParser = require('../parsers/BParser');
const CParser = require('../parsers/CParser');
const COMPParser = require('../parsers/COMPParser');
const CORParser = require('../parsers/CORParser');
const EParser = require('../parsers/EParser');
const FParser = require('../parsers/FParser');
const GParser = require('../parsers/GParser');
const HParser = require('../parsers/HParser');
const IParser = require('../parsers/IParser');
const JParser = require('../parsers/JParser');
const LParser = require('../parsers/LParser');
const TParser = require('../parsers/TParser');

class ParserRegistry {
  constructor(serviceRegistry, logger = console) {
    this.serviceRegistry = serviceRegistry;
    this.logger = logger;
    this.parsers = new Map();
    this.messageTypeMap = new Map();
    
    this.initializeParsers();
    this.buildMessageTypeMap();
  }

  /**
   * Inicializa todos los parsers especializados
   */
  initializeParsers() {
    try {
      // Crear instancias de todos los parsers
      this.parsers.set('A', new AParser(this.serviceRegistry, this.logger));
      this.parsers.set('B', new BParser(this.serviceRegistry, this.logger));
      this.parsers.set('C', new CParser(this.serviceRegistry, this.logger));
      this.parsers.set('COMP', new COMPParser(this.serviceRegistry, this.logger));
      this.parsers.set('COR', new CORParser(this.serviceRegistry, this.logger));
      this.parsers.set('E', new EParser(this.serviceRegistry, this.logger));
      this.parsers.set('F', new FParser(this.serviceRegistry, this.logger));
      this.parsers.set('G', new GParser(this.serviceRegistry, this.logger));
      this.parsers.set('H', new HParser(this.serviceRegistry, this.logger));
      this.parsers.set('I', new IParser(this.serviceRegistry, this.logger));
      this.parsers.set('J', new JParser(this.serviceRegistry, this.logger));
      this.parsers.set('L', new LParser(this.serviceRegistry, this.logger));
      this.parsers.set('T', new TParser(this.serviceRegistry, this.logger));

      this.logger.info(`✅ [ParserRegistry] Initialized ${this.parsers.size} specialized parsers`);
      
    } catch (error) {
      this.logger.error(`❌ [ParserRegistry] Error initializing parsers:`, error);
      throw error;
    }
  }

  /**
   * Construye el mapa de tipos de mensaje a parsers
   */
  buildMessageTypeMap() {
    this.parsers.forEach((parser, key) => {
      try {
        const messageTypes = parser.getMessageTypes();
        messageTypes.forEach(messageType => {
          this.messageTypeMap.set(messageType, parser);
        });
      } catch (error) {
        this.logger.warning(`⚠️ [ParserRegistry] Parser ${key} doesn't implement getMessageTypes():`, error);
      }
    });

    this.logger.info(`✅ [ParserRegistry] Built message type mapping for ${this.messageTypeMap.size} message types`);
    this.logger.debug(`📋 [ParserRegistry] Supported message types:`, Array.from(this.messageTypeMap.keys()));
  }

  /**
   * Obtiene el parser apropiado para un tipo de mensaje
   * @param {string} messageType - Tipo de mensaje ($A, $J, etc.)
   * @returns {Object|null} - Parser o null si no existe
   */
  getParserForMessageType(messageType) {
    return this.messageTypeMap.get(messageType) || null;
  }

  /**
   * Parsea un mensaje usando el parser especializado apropiado
   * @param {string} rawData - Mensaje raw completo
   * @returns {Object|null} - Datos parseados o null si error
   */
  async parseMessage(rawData) {
    try {
      // Validar que rawData sea un string válido
      if (!rawData) {
        this.logger.warning(`❌ [ParserRegistry] Empty or null rawData received`);
        return null;
      }
      
      if (typeof rawData !== 'string') {
        this.logger.warning(`❌ [ParserRegistry] Invalid rawData type: ${typeof rawData}, value: ${rawData}`);
        return null;
      }
      
      // Determinar el tipo de mensaje
      const messageType = this.extractMessageType(rawData);
      
      if (!messageType) {
        this.logger.warning(`❌ [ParserRegistry] Could not extract message type from: ${rawData.substring(0, 50)}...`);
        return null;
      }

      // Obtener el parser apropiado
      const parser = this.getParserForMessageType(messageType);
      
      if (!parser) {
        this.logger.warning(`❌ [ParserRegistry] No parser found for message type: ${messageType}`);
        return null;
      }

      // Parsear con el parser especializado
      const result = await parser.parse(rawData);
      
      if (result) {
        this.logger.debug(`✅ [ParserRegistry] Parsed ${messageType} with ${parser.constructor.name}`);
      }
      
      return result;

    } catch (error) {
      this.logger.error(`❌ [ParserRegistry] Error parsing message: ${rawData}`, error);
      return null;
    }
  }

  /**
   * Extrae el tipo de mensaje de los datos raw
   * @param {string} rawData - Datos raw del mensaje
   * @returns {string|null} - Tipo de mensaje o null
   */
  extractMessageType(rawData) {
    if (!rawData || typeof rawData !== 'string') {
      return null;
    }

    // Buscar el tipo de mensaje al inicio
    if (rawData.startsWith('$COMP')) return '$COMP';
    if (rawData.startsWith('$COR')) return '$COR';
    if (rawData.startsWith('$A')) return '$A';
    if (rawData.startsWith('$B')) return '$B';
    if (rawData.startsWith('$C')) return '$C';
    if (rawData.startsWith('$E')) return '$E';
    if (rawData.startsWith('$F')) return '$F';
    if (rawData.startsWith('$G')) return '$G';
    if (rawData.startsWith('$H')) return '$H';
    if (rawData.startsWith('$I')) return '$I';
    if (rawData.startsWith('$J')) return '$J';
    if (rawData.startsWith('$L')) return '$L';
    if (rawData.startsWith('$T')) return '$T';

    return null;
  }

  /**
   * Obtiene estadísticas del registry
   * @returns {Object} - Estadísticas
   */
  getStats() {
    return {
      totalParsers: this.parsers.size,
      supportedMessageTypes: this.messageTypeMap.size,
      parsers: Array.from(this.parsers.keys()),
      messageTypes: Array.from(this.messageTypeMap.keys())
    };
  }

  /**
   * Verifica si un tipo de mensaje es soportado
   * @param {string} messageType - Tipo de mensaje
   * @returns {boolean} - true si es soportado
   */
  isMessageTypeSupported(messageType) {
    return this.messageTypeMap.has(messageType);
  }
}

module.exports = ParserRegistry;
