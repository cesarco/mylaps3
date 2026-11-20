/**
 * COMPParser.js
 * Parser para mensajes $COMP (Competitor Extended Information)
 * NUEVA ARQUITECTURA: Parser → DriverService
 * 
 * $COMP — Inscripción/confirmación de competidor
 * • reg (string)
 * • number (string)
 * • class (int)
 * • first (string)
 * • last (string)
 * • (Campos extra suelen venir vacíos en algunas fuentes; úsalo como "refresco" de $A.)
 * 
 * Formato: $COMP,"registration","number",classNumber,"first","last","nationality","additional"
 */

const BaseParser = require('./BaseParser');

class COMPParser extends BaseParser {
  constructor(serviceRegistry, logger = console) {
    super(logger);
    this.messageType = '$COMP';
    this.driverService = serviceRegistry.getDriverService();
  }

  /**
   * Parser para $COMP — Competitor Extended Information
   * $COMP,"registration","number",classNumber,"first","last","nationality","additional"
   */
  async parse(rawData) {
    // Dividir por comas, respetando comillas
    const parts = this.splitCSV(rawData);
    
    if (!this.validateFieldCount(parts, 8)) return null;

    try {
      const data = this.createBaseData('$COMP', rawData);
      data.type = "COMPETITOR_INFO"; // Tipo de mensaje para información de competidor
      data.registration = this.cleanString(parts[1]);
      data.number = this.cleanString(parts[2]);
      data.class_number = this.safeParseInt(parts[3]);
      data.first_name = this.cleanString(parts[4]);
      data.last_name = this.cleanString(parts[5]);
      data.nationality = this.cleanString(parts[6]);
      data.additional = this.cleanString(parts[7]);

      // Campos derivados útiles
      data.full_name = `${data.first_name} ${data.last_name}`.trim();
      data.bib = data.number; // Alias para compatibilidad

      // Validación de campos requeridos
      if (!data.registration || !data.number) {
        this.logger.warn(`$COMP: Missing required fields - registration: ${data.registration}, number: ${data.number}`);
        return null;
      }

      // Intentar recuperar el RID y transponder_id de un registro previo de $A
      let existingRid = null;
      try {
        // Verificar si ya existe un RID para este registration
        const newRidMappingKey = this.driverService.keyGen.ridMapping();
        const oldRidMappingKey = `${this.driverService.keyGen.sessionKey}:rid`;
        
        existingRid = await this.driverService.redis.hget(newRidMappingKey, data.registration);
        if (!existingRid) {
          existingRid = await this.driverService.redis.hget(oldRidMappingKey, data.registration);
        }
        
        if (existingRid) {
          // Si ya existe un RID, recuperar datos existentes
          const catalogKey = `${this.driverService.keyGen.sessionKey}:driver:${existingRid}:catalog`;
          const existingData = await this.driverService.redis.hgetall(catalogKey);
          if (existingData && existingData.transponder_id) {
            data.transponder_id = parseInt(existingData.transponder_id);
            this.logger.debug(`Found existing RID ${existingRid} and transponder_id ${data.transponder_id} for driver ${data.registration}`);
          }
        }
      } catch (err) {
        this.logger.debug(`Could not retrieve previous RID or transponder_id for ${data.registration}: ${err.message}`);
      }

      // Si existe un RID, actualizar los datos del driver sin crear un nuevo RID
      if (existingRid) {
        const result = await this.driverService.updateDriverCentralized({
          driverid: data.registration,
          rid: parseInt(existingRid),
          registration: data.registration,
          number: data.number,
          first_name: data.first_name,
          last_name: data.last_name,
          nationality: data.nationality,
          class_number: data.class_number,
          transponder_id: data.transponder_id
        });
        
        data.result = result;
        return data;
      }

      // NUEVA ARQUITECTURA: Registrar driver en DriverService (solo si no existía)
      const result = await this.driverService.registerDriver(data);
      data.result = result;

      return data;

    } catch (error) {
      this.logger.warn(`Error processing $COMP message: ${rawData} - ${error.message}`);
      return null;
    }
  }

  /**
   * Tipos de mensaje que maneja este parser
   */
  getMessageTypes() {
    return ['$COMP'];
  }
}

module.exports = COMPParser;
