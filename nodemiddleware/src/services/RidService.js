/**
 * RidService.js
 * Servicio para manejar RIDs (IDs internos autoincrementales) según especificación
 */

const KeyGenerator = require('../utils/KeyGenerator');

class RidService {
  constructor(redisClient, sessionKey = 'default') {
    this.redis = redisClient;
    this.keyGen = new KeyGenerator(sessionKey);
    this.ridCounter = null; // Cache del contador actual
  }

  /**
   * Obtiene o crea un RID para un registration (AMBAS estructuras - vieja y nueva)
   * @param {string} registration - Registration del piloto
   * @returns {Promise<number>} - RID asignado
   */
  async getOrCreateRid(registration) {
    // ESTRUCTURA NUEVA (race:default:rid)
    const newRidMappingKey = this.keyGen.ridMapping();
    
    // ESTRUCTURA VIEJA (default:rid) - para compatibilidad
    const oldRidMappingKey = `${this.keyGen.sessionKey}:rid`;
    
    // 1. Verificar si ya existe un RID para este registration (en cualquiera de las dos estructuras)
    let existingRid = await this.redis.hget(newRidMappingKey, registration);
    if (!existingRid) {
      existingRid = await this.redis.hget(oldRidMappingKey, registration);
    }
    
    if (existingRid) {
      return parseInt(existingRid);
    }

    // 2. Crear nuevo RID autoincremental
    const newRid = await this.getNextRid();
    
    // 3. Guardar el mapeo reg → rid en AMBAS estructuras
    await this.redis.hset(newRidMappingKey, registration, newRid);
    await this.redis.hset(oldRidMappingKey, registration, newRid);
    
    return newRid;
  }

  /**
   * Obtiene el siguiente RID disponible (autoincremental)
   * @returns {Promise<number>} - Siguiente RID
   */
  async getNextRid() {
    const counterKey = `${this.keyGen.sessionKey}:rid:counter`;
    const newRid = await this.redis.incr(counterKey);
    this.ridCounter = newRid;
    return newRid;
  }

  /**
   * Obtiene el registration para un RID
   * @param {number} rid - RID del piloto
   * @returns {Promise<string|null>} - Registration o null si no existe
   */
  async getRegistrationForRid(rid) {
    const ridMappingKey = this.keyGen.ridMapping();
    
    // Buscar en el hash el registration que corresponde a este RID
    const allMappings = await this.redis.hgetall(ridMappingKey);
    
    for (const [registration, mappedRid] of Object.entries(allMappings)) {
      if (parseInt(mappedRid) === parseInt(rid)) {
        return registration;
      }
    }
    
    return null;
  }

  /**
   * Obtiene todos los mappings reg → rid
   * @returns {Promise<Object>} - Objeto con mappings
   */
  async getAllMappings() {
    const ridMappingKey = this.keyGen.ridMapping();
    return await this.redis.hgetall(ridMappingKey);
  }

  /**
   * Obtiene la lista de todos los RIDs activos
   * @returns {Promise<Array<number>>} - Array de RIDs
   */
  async getAllRids() {
    const mappings = await this.getAllMappings();
    return Object.values(mappings).map(rid => parseInt(rid));
  }

  /**
   * Obtiene estadísticas del servicio
   * @returns {Promise<Object>} - Estadísticas
   */
  async getStats() {
    const mappings = await this.getAllMappings();
    const rids = Object.values(mappings).map(rid => parseInt(rid));
    
    return {
      session_key: this.keyGen.sessionKey,
      total_drivers: Object.keys(mappings).length,
      max_rid: rids.length > 0 ? Math.max(...rids) : 0,
      current_counter: this.ridCounter,
      service_type: 'RidService'
    };
  }

  /**
   * Resetea todos los mappings (usar con cuidado)
   */
  async resetMappings() {
    const ridMappingKey = this.keyGen.ridMapping();
    const counterKey = `${this.keyGen.sessionKey}:rid:counter`;
    
    await this.redis.del(ridMappingKey);
    await this.redis.del(counterKey);
    this.ridCounter = null;
  }

  /**
   * Cambia la sesión actual
   * @param {string} sessionKey - Nueva clave de sesión
   */
  setSession(sessionKey) {
    this.keyGen.setSession(sessionKey);
    this.ridCounter = null; // Reset cache
  }
  
  /**
   * Obtiene un RID para un registration (alias para getOrCreateRid)
   * @param {string} registration - Registration del piloto
   * @returns {Promise<number>} - RID asignado
   */
  async getRid(registration) {
    return this.getOrCreateRid(registration);
  }
}

module.exports = RidService;
