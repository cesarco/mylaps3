/**
 * AtomizerKeyGenerator.js
 * Genera keys de Redis para el SISTEMA DE ATOMIZERS (nueva arquitectura)
 * Esta clase es INDEPENDIENTE del KeyGenerator original para mantener ambos sistemas separados
 */

class AtomizerKeyGenerator {
  constructor(sessionKey = 'default') {
    this.sessionKey = sessionKey;
  }

  /**
   * Establece una nueva sesión
   * @param {string} sessionKey - Clave de la sesión
   */
  setSession(sessionKey) {
    this.sessionKey = sessionKey;
  }

  /**
   * Genera una key con prefijo 'race:' para atomizers
   * @param {string} pattern - Patrón de la key
   * @param {Object} params - Parámetros para reemplazar
   * @returns {string} - Key generada
   */
  generateKey(pattern, params = {}) {
    let key = pattern.replace('{S}', this.sessionKey);
    
    // Reemplazar otros parámetros
    for (const [placeholder, value] of Object.entries(params)) {
      key = key.replace(`{${placeholder}}`, value);
    }
    
    return key;
  }

  // === KEYS PARA DRIVERS (NUEVA ARQUITECTURA) ===
  
  /**
   * Key para catálogo de driver (datos fijos)
   * @param {string|number} rid - ID interno del driver
   */
  driverCatalog(rid) {
    return `race:${this.sessionKey}:driver:${rid}:catalog`;
  }

  /**
   * Key para estado en vivo del driver
   * @param {string|number} rid - ID interno del driver
   */
  driverState(rid) {
    return `race:${this.sessionKey}:driver:${rid}:state`;
  }

  /**
   * Key para vueltas históricas del driver
   * @param {string|number} rid - ID interno del driver
   */
  driverLaps(rid) {
    return `race:${this.sessionKey}:driver:${rid}:laps`;
  }

  /**
   * Key para leaderboard position
   * @param {number} position - Posición en el leaderboard
   */
  leaderboardDriver(position) {
    return `race:${this.sessionKey}:leaderboard:${position}`;
  }

  /**
   * Key para ranking del leaderboard (ZSET)
   */
  leaderboardRanking() {
    return `race:${this.sessionKey}:leaderboard:ranking`;
  }

  // === KEYS PARA CLASES ===
  
  /**
   * Key para información de clase
   * @param {string|number} cid - ID de la clase
   */
  classInfo(cid) {
    return `race:${this.sessionKey}:class:${cid}`;
  }

  /**
   * Key para posiciones por clase
   * @param {string|number} cid - ID de la clase
   */
  classPos(cid) {
    return `race:${this.sessionKey}:class:${cid}:pos`;
  }

  /**
   * Key para mejores tiempos por clase
   * @param {string|number} cid - ID de la clase
   */
  classBest(cid) {
    return `race:${this.sessionKey}:class:${cid}:best`;
  }

  // === KEYS GLOBALES ===

  /**
   * Key para información de la sesión/run
   */
  runInfo() {
    return `race:${this.sessionKey}:run`;
  }

  /**
   * Key para información del evento
   */
  eventInfo() {
    return `race:${this.sessionKey}:event`;
  }

  /**
   * Key para estado global (banderas, etc.)
   */
  globalState() {
    return `race:${this.sessionKey}:state`;
  }

  /**
   * Key para standings generales por posición
   */
  posStandings() {
    return `race:${this.sessionKey}:pos`;
  }

  /**
   * Key para standings por mejor vuelta
   */
  bestStandings() {
    return `race:${this.sessionKey}:best`;
  }

  /**
   * Key para mapeo reg → rid
   */
  ridMapping() {
    return `race:${this.sessionKey}:rid`;
  }

  // === STREAMS ===

  /**
   * Stream de passings/cruces
   */
  passStream() {
    return `race:${this.sessionKey}:x:pass`;
  }

  /**
   * Stream de correcciones
   */
  correctionStream() {
    return `race:${this.sessionKey}:x:cor`;
  }

  /**
   * Stream de cruces intermedios
   */
  lineStream() {
    return `race:${this.sessionKey}:x:line`;
  }

  // === CANALES PUB/SUB ===

  /**
   * Canal para banderas
   */
  flagChannel() {
    return `race:${this.sessionKey}:ch:flag`;
  }

  /**
   * Canal para posiciones
   */
  posChannel() {
    return `race:${this.sessionKey}:ch:pos`;
  }

  /**
   * Canal para mejores vueltas
   */
  bestChannel() {
    return `race:${this.sessionKey}:ch:best`;
  }

  /**
   * Canal para passings
   */
  passChannel() {
    return `race:${this.sessionKey}:ch:pass`;
  }

  /**
   * Canal para información de sesión
   */
  sessionChannel() {
    return `race:${this.sessionKey}:ch:session`;
  }

  /**
   * Canal para metadatos de evento
   */
  eventChannel() {
    return `race:${this.sessionKey}:ch:event`;
  }

  /**
   * Canal para correcciones de tiempo
   */
  correctionChannel() {
    return `race:${this.sessionKey}:ch:correction`;
  }

  // === UTILIDADES ===

  /**
   * Obtiene todas las keys de drivers para una sesión
   */
  getDriverKeys(rid) {
    return {
      catalog: this.driverCatalog(rid),
      state: this.driverState(rid),
      laps: this.driverLaps(rid)
    };
  }

  /**
   * Obtiene todas las keys de clase
   */
  getClassKeys(cid) {
    return {
      info: this.classInfo(cid),
      pos: this.classPos(cid),
      best: this.classBest(cid)
    };
  }

  /**
   * Obtiene estadísticas del generador
   */
  getStats() {
    return {
      current_session: this.sessionKey,
      generator_type: 'AtomizerKeyGenerator',
      prefix: 'race:'
    };
  }
}

module.exports = AtomizerKeyGenerator;
