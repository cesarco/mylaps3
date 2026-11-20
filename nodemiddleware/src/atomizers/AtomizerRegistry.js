/**
 * AtomizerRegistry.js
 * Registry centralizado para todos los atomizers
 * 
 * RESPONSABILIDADES:
 * - Registrar y mantener todos los atomizers disponibles
 * - Dirigir mensajes al atomizer correcto según el tipo
 * - Ejecutar múltiples atomizers en paralelo si es necesario
 * - Proveer interfaz unificada para el sistema de atomizers
 */

const DriverRegistrationAtomizer = require('./DriverRegistrationAtomizer');
const LapTimingAtomizer = require('./LapTimingAtomizer');
const BestLapAtomizer = require('./BestLapAtomizer');
const PositionAtomizer = require('./PositionAtomizer');
const SessionInfoAtomizer = require('./SessionInfoAtomizer');
const ClassDefinitionAtomizer = require('./ClassDefinitionAtomizer');
const TimeCorrectionAtomizer = require('./TimeCorrectionAtomizer');
const EventMetadataAtomizer = require('./EventMetadataAtomizer');
const FlagStatusAtomizer = require('./FlagStatusAtomizer');
const InitSyncAtomizer = require('./InitSyncAtomizer');
const LineCrossingAtomizer = require('./LineCrossingAtomizer');
const TrackDescriptionAtomizer = require('./TrackDescriptionAtomizer');

class AtomizerRegistry {
  constructor(serviceRegistry, logger = console, debugLogger = null) {
    this.serviceRegistry = serviceRegistry;
    this.logger = logger;
    this.debugLogger = debugLogger;
    this.atomizers = new Map();
    this.enabled = true; // Flag para habilitar/deshabilitar atomizers globalmente
    
    this.initializeAtomizers();
  }

  /**
   * Inicializa todos los atomizers disponibles
   */
  initializeAtomizers() {
    try {
      // Registrar atomizers principales (datos de drivers)
      this.register(new DriverRegistrationAtomizer(this.serviceRegistry, this.logger));
      this.register(new LapTimingAtomizer(this.serviceRegistry, this.logger));
      this.register(new BestLapAtomizer(this.serviceRegistry, this.logger));
      this.register(new PositionAtomizer(this.serviceRegistry, this.logger));
      
      // Registrar atomizers de corrección y metadatos
      this.register(new TimeCorrectionAtomizer(this.serviceRegistry, this.logger));
      this.register(new LineCrossingAtomizer(this.serviceRegistry, this.logger));
      
      // Registrar atomizers de información global
      this.register(new SessionInfoAtomizer(this.serviceRegistry, this.logger));
      this.register(new ClassDefinitionAtomizer(this.serviceRegistry, this.logger));
      this.register(new EventMetadataAtomizer(this.serviceRegistry, this.logger));
      this.register(new FlagStatusAtomizer(this.serviceRegistry, this.logger));
      this.register(new InitSyncAtomizer(this.serviceRegistry, this.logger));
      this.register(new TrackDescriptionAtomizer(this.serviceRegistry, this.logger));
      
      this.logger.info(`⚛️ [AtomizerRegistry] Initialized with ${this.atomizers.size} atomizers`);
      this.logRegisteredAtomizers();
      
    } catch (error) {
      this.logger.error(`❌ [AtomizerRegistry] Error initializing atomizers:`, error);
    }
  }

  /**
   * Registra un atomizer en el registry
   * @param {BaseAtomizer} atomizer - Instancia del atomizer
   */
  register(atomizer) {
    if (!atomizer || typeof atomizer.atomize !== 'function') {
      throw new Error('Invalid atomizer: must have atomize() method');
    }

    const messageTypes = atomizer.getMessageTypes();
    for (const messageType of messageTypes) {
      if (!this.atomizers.has(messageType)) {
        this.atomizers.set(messageType, []);
      }
      this.atomizers.get(messageType).push(atomizer);
    }

    this.logger.debug(`⚛️ [AtomizerRegistry] Registered ${atomizer.constructor.name} for messages: ${messageTypes.join(', ')}`);
  }

  /**
   * Procesa un mensaje con todos los atomizers relevantes
   * @param {Object} messageData - Datos del mensaje parseado (debe incluir messageType)
   * @returns {Promise<Object>} - Resultado consolidado de todos los atomizers
   */
  async atomize(messageData) {
    if (!this.enabled) {
      return { success: true, reason: 'Atomizers disabled', results: [] };
    }

    const { messageType } = messageData;
    if (!messageType) {
      this.logger.warning(`No messageType in message data`);
      return { success: false, reason: 'No messageType' };
    }

    const atomizers = this.atomizers.get(messageType) || [];
    if (atomizers.length === 0) {
      this.logger.debug(`⚛️ [AtomizerRegistry] No atomizers for message type: ${messageType}`);
      return { success: true, reason: 'No atomizers', messageType };
    }

    try {
      // Ejecutar todos los atomizers para este tipo de mensaje en paralelo
      const results = await Promise.allSettled(
        atomizers.map(atomizer => atomizer.atomize(messageData))
      );

      // Procesar resultados
      const successResults = [];
      const failedResults = [];
      
      results.forEach((result, index) => {
        const atomizerName = atomizers[index].constructor.name;
        
        if (result.status === 'fulfilled') {
          successResults.push({
            atomizer: atomizerName,
            result: result.value
          });
        } else {
          failedResults.push({
            atomizer: atomizerName,
            error: result.reason
          });
          this.logger.error(`❌ [AtomizerRegistry] ${atomizerName} failed:`, result.reason);
        }
      });

      this.logger.debug(`⚛️ [AtomizerRegistry] Processed ${messageType}: ${successResults.length} success, ${failedResults.length} failed`);

      return {
        success: true,
        messageType,
        atomizersRun: atomizers.length,
        successCount: successResults.length,
        failedCount: failedResults.length,
        results: successResults,
        failures: failedResults
      };

    } catch (error) {
      this.logger.error(`❌ [AtomizerRegistry] Error processing message ${messageType}:`, error);
      return { success: false, error: error.message, messageType };
    }
  }

  /**
   * Obtiene estadísticas del registry
   * @returns {Object} - Estadísticas
   */
  getStats() {
    const messageTypes = Array.from(this.atomizers.keys());
    const totalAtomizers = Array.from(this.atomizers.values())
      .reduce((total, atomizers) => total + atomizers.length, 0);
    
    return {
      enabled: this.enabled,
      messageTypesHandled: messageTypes.length,
      totalAtomizerInstances: totalAtomizers,
      messageTypes,
      atomizersByType: Object.fromEntries(
        Array.from(this.atomizers.entries()).map(([type, atomizers]) => [
          type, 
          atomizers.map(a => a.constructor.name)
        ])
      )
    };
  }

  /**
   * Habilita o deshabilita todos los atomizers
   * @param {boolean} enabled - true para habilitar, false para deshabilitar
   */
  setEnabled(enabled) {
    this.enabled = enabled;
    this.logger.info(`⚛️ [AtomizerRegistry] Atomizers ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Logs de atomizers registrados
   */
  logRegisteredAtomizers() {
    const stats = this.getStats();
    this.logger.info(`⚛️ [AtomizerRegistry] Stats:`, {
      enabled: stats.enabled,
      messageTypes: stats.messageTypes,
      totalInstances: stats.totalAtomizerInstances
    });
    
    for (const [messageType, atomizerNames] of Object.entries(stats.atomizersByType)) {
      this.logger.debug(`  ${messageType}: ${atomizerNames.join(', ')}`);
    }
  }
}

module.exports = AtomizerRegistry;
