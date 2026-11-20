const BaseAtomizer = require('./BaseAtomizer');

/**
 * ClassDefinitionAtomizer.js
 * Atomizer especializado en definiciones de clase ($C)
 * 
 * RESPONSABILIDADES:
 * - Actualizar información de clases de competición
 * - Actualizar clasificaciones por categoría
 * - Actualizar configuraciones de clase
 * 
 * CAMPOS QUE MANEJA:
 * - class_id, class_name
 * - class_description
 * - class_color, class_settings
 */
class ClassDefinitionAtomizer extends BaseAtomizer {
  constructor(serviceRegistry, logger = console) {
    super(serviceRegistry, logger);
    this.messageTypes = ['$C'];
  }

  /**
   * Procesa mensajes de definición de clase según estructura oficial
   * @param {Object} messageData - Datos del mensaje parseado
   * @returns {Promise<Object>} - Resultado de la operación
   */
  async atomize(messageData) {
    try {
      const { 
        classId,        // Legacy field
        className,      // Legacy field
        classDescription, // Legacy field
        classColor,     // Legacy field
        classSettings,  // Legacy field
        // New fields from CParser
        class_id,
        class_name,
        class_number,
        description
      } = messageData;
      
      // Use new fields from CParser or fall back to legacy fields
      const finalClassId = classId || class_id || class_number;
      const finalClassName = className || class_name || description;
      
      if (!finalClassId) {
        if (this.debugLogger) {
          this.debugLogger.logMissingClassId(messageData.messageType, messageData.rawData);
        } else {
          this.logger.warning(`No class ID found in message`);
          console.log(`⚠️ [ClassDefinitionAtomizer] No class ID found in message`);
        }
        return { success: false, reason: 'No class ID found' };
      }

      // PASO 1: Preparar datos de información de clase
      const classData = {};
      let hasUpdates = false;
      
      if (finalClassName) {
        classData.class_name = finalClassName;
        hasUpdates = true;
      }
      
      if (classDescription) {
        classData.class_description = classDescription;
        hasUpdates = true;
      }
      
      if (classColor) {
        classData.class_color = classColor;
        hasUpdates = true;
      }
      
      if (classSettings) {
        classData.class_settings = JSON.stringify(classSettings);
        hasUpdates = true;
      }

      // PASO 2: Actualizar información de clase usando Redis oficial
      let classUpdated = false;
      if (hasUpdates) {
        try {
          // Usar la clave oficial de información de clase race:{S}:class:{cid}
          const classKey = this.keyGen.classInfo(finalClassId);
          const pipeline = this.redis.pipeline();
          
          // Actualizar todos los campos de información de clase
          Object.entries(classData).forEach(([key, value]) => {
            pipeline.hset(classKey, key, value);
          });
          
          // Agregar timestamp de última actualización
          pipeline.hset(classKey, 'last_updated', new Date().toISOString());
          
          const results = await pipeline.exec();
          classUpdated = results && results.length > 0;
          
        } catch (error) {
          this.logger.error(`❌ [ClassDefinitionAtomizer] Error updating class info:`, error);
        }
      }
      
      // PASO 3: Publicar notificación en canal oficial
      const notification = {
        type: 'class_definition',
        class_id: finalClassId,
        class_name: finalClassName,
        class_description: classDescription,
        class_color: classColor,
        timestamp: new Date().toISOString()
      };
      
      const notificationSent = await this.publishNotification('session', notification);
      
      this.logAtomizerInfo('Class definition processed', finalClassId, {
        messageType: messageData.messageType,
        classUpdated,
        notificationSent,
        className: finalClassName || 'Unknown',
        description: classDescription || '',
        fieldsCount: Object.keys(classData).length
      });

      return {
        success: classUpdated,
        type: 'class_definition',
        classUpdated,
        notificationSent,
        classId: finalClassId,
        className: finalClassName,
        fieldsProcessed: Object.keys(classData).length,
        classData
      };

    } catch (error) {
      this.logger.error(`❌ [ClassDefinitionAtomizer] Error processing message:`, error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = ClassDefinitionAtomizer;
