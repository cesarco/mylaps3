const BaseAtomizer = require('./BaseAtomizer');

/**
 * InitSyncAtomizer.js
 * Atomizer especializado en inicialización y resincronización ($I)
 * 
 * RESPONSABILIDADES:
 * - Procesar comandos de inicialización del sistema
 * - Manejar resincronización de datos
 * - Actualizar estados de conexión
 * 
 * CAMPOS QUE MANEJA:
 * - init_command, sync_status
 * - connection_status
 * - system_ready
 */
class InitSyncAtomizer extends BaseAtomizer {
  constructor(serviceRegistry, logger = console) {
    super(serviceRegistry, logger);
    this.messageTypes = ['$I'];
  }

  /**
   * Procesa mensajes de inicialización/resincronización según estructura oficial
   * @param {Object} messageData - Datos del mensaje parseado
   * @returns {Promise<Object>} - Resultado de la operación
   */
  async atomize(messageData) {
    try {
      const { 
        initCommand, 
        syncStatus, 
        connectionStatus, 
        systemReady,
        timestamp
      } = messageData;
      
      // PASO 1: Preparar datos de estado del sistema
      const systemData = {};
      let hasUpdates = false;
      
      if (initCommand) {
        systemData.init_command = initCommand;
        hasUpdates = true;
      }
      
      if (syncStatus) {
        systemData.sync_status = syncStatus;
        hasUpdates = true;
      }
      
      if (connectionStatus) {
        systemData.connection_status = connectionStatus;
        hasUpdates = true;
      }
      
      if (systemReady !== undefined) {
        systemData.system_ready = systemReady;
        hasUpdates = true;
      }
      
      if (timestamp) {
        systemData.last_sync_time = timestamp;
        hasUpdates = true;
      }

      // PASO 2: Actualizar estado global del sistema usando Redis oficial
      let systemUpdated = false;
      if (hasUpdates) {
        try {
          // Usar la clave oficial de estado global race:{S}:global para info del sistema
          const globalStateKey = this.keyGen.globalState();
          const pipeline = this.redis.pipeline();
          
          // Actualizar todos los campos de estado del sistema
          Object.entries(systemData).forEach(([key, value]) => {
            pipeline.hset(globalStateKey, key, value);
          });
          
          // Agregar timestamp de última actualización
          pipeline.hset(globalStateKey, 'system_last_updated', new Date().toISOString());
          
          const results = await pipeline.exec();
          systemUpdated = results && results.length > 0;
          
        } catch (error) {
          this.logger.error(`❌ [InitSyncAtomizer] Error updating system state:`, error);
        }
      }
      
      // PASO 3: Registrar evento de sistema en stream
      const systemEvent = {
        type: 'system_init',
        init_command: initCommand,
        sync_status: syncStatus,
        connection_status: connectionStatus,
        system_ready: systemReady,
        timestamp: new Date().toISOString()
      };
      
      const eventAdded = await this.addPassingEvent(systemEvent);
      
      // PASO 4: Publicar notificación en canal oficial
      const notification = {
        type: 'init_sync',
        init_command: initCommand,
        sync_status: syncStatus,
        connection_status: connectionStatus,
        system_ready: systemReady,
        timestamp: new Date().toISOString()
      };
      
      const notificationSent = await this.publishNotification('system', notification);
      
      this.logAtomizerInfo('Init/Sync command processed', 'SYSTEM', {
        messageType: messageData.messageType,
        systemUpdated,
        eventAdded,
        notificationSent,
        command: initCommand || 'Unknown',
        status: syncStatus || 'Unknown',
        ready: systemReady || false,
        fieldsCount: Object.keys(systemData).length
      });

      return {
        success: systemUpdated || eventAdded,
        type: 'init_sync',
        systemUpdated,
        eventAdded,
        notificationSent,
        command: initCommand,
        syncStatus: syncStatus,
        connectionStatus: connectionStatus,
        fieldsProcessed: Object.keys(systemData).length
      };

    } catch (error) {
      this.logger.error(`❌ [InitSyncAtomizer] Error processing message:`, error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = InitSyncAtomizer;
