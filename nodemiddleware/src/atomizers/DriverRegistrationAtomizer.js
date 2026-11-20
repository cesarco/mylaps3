const BaseAtomizer = require('./BaseAtomizer');

/**
 * DriverRegistrationAtomizer.js
 * Atomizer especializado en datos de registro de drivers ($A y $COMP)
 * SIGUE ESTRUCTURA OFICIAL: race:{S}:driver:{rid}:catalog
 * 
 * RESPONSABILIDADES:
 * - Actualizar datos de catálogo del driver (estructura oficial)
 * - Resolver RID usando RidService oficial
 * - Escribir a race:{S}:driver:{rid}:catalog según instrucciones
 * 
 * CAMPOS QUE MANEJA:
 * - registration, first_name, last_name, name
 * - number, class, nationality
 * - transponder_id
 */
class DriverRegistrationAtomizer extends BaseAtomizer {
  constructor(serviceRegistry, logger = console) {
    super(serviceRegistry, logger);
    this.messageTypes = ['$A'];
  }

  /**
   * Procesa mensajes de registro de driver según estructura oficial
   * @param {Object} messageData - Datos del mensaje parseado
   * @returns {Promise<Object>} - Resultado de la operación
   */
  async atomize(messageData) {
    try {
      const { 
        registration, 
        first_name, 
        last_name, 
        full_name, // Campo derivado del AParser
        number, 
        class_number, 
        nationality, 
        transponder_id 
      } = messageData;
      
      if (!registration) {
        this.logger.warning(`No registration found in message`);
        return { success: false, reason: 'No registration' };
      }

      // PASO 1: Resolver RID usando RidService oficial
      const rid = await this.resolveRid(registration);
      if (!rid) {
        this.logger.error(`❌ [DriverRegistrationAtomizer] Failed to resolve RID for registration ${registration}`);
        return { success: false, reason: 'RID resolution failed' };
      }
      
      // PASO 2: Preparar datos para catálogo oficial
      const catalogData = {
        registration: registration
      };
      
      // Procesar datos del AParser (mensaje $A)
      if (first_name) catalogData.first_name = first_name;
      if (last_name) catalogData.last_name = last_name;
      if (full_name) catalogData.name = full_name;
      if (number) catalogData.number = number;
      if (class_number !== undefined) catalogData.class = class_number;
      if (nationality) catalogData.nationality = nationality;
      if (transponder_id) catalogData.transponder_id = transponder_id;
      
      // PASO 3: Actualizar catálogo usando estructura oficial
      const catalogUpdated = await this.updateDriverCatalog(rid, catalogData);
      
      if (catalogUpdated) {
        this.logAtomizerInfo('Driver catalog updated', `RID:${rid} (${registration})`, {
          messageType: messageData.messageType,
          fields: Object.keys(catalogData),
          catalogData
        });
      }

      return {
        success: catalogUpdated,
        rid: rid,
        registration: registration,
        fieldsUpdated: Object.keys(catalogData).length,
        catalogData: catalogData
      };

    } catch (error) {
      this.logger.error(`❌ [DriverRegistrationAtomizer] Error processing message:`, error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = DriverRegistrationAtomizer;

module.exports = DriverRegistrationAtomizer;
