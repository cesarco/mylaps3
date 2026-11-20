/**
 * KeyGenerator.js
 * Genera keys de Redis según la especificación Redis_RMonitor_Middleware.md
 */

const config = require('../config');

class KeyGenerator {
  constructor(sessionKey = null) {
    this.sessionKey = sessionKey || config.mylaps.defaultSessionKey;
    this.patterns = config.mylaps.keyPatterns;
  }

  /**
   * Establece una nueva sesión
   * @param {string} sessionKey - Clave de la sesión
   */
  setSession(sessionKey) {
    this.sessionKey = sessionKey;
  }

  /**
   * Genera una key reemplazando placeholders
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

  // === KEYS PARA DRIVERS ===
  
  /**
   * NUEVA ESTRUCTURA LEADERBOARD UNIFICADA
   * Key para driver en leaderboard con posición específica
   * @param {number} position - Posición en el leaderboard
   */
  leaderboardDriver(position) {
    return this.generateKey(this.patterns.leaderboardDriver, { pos: position });
  }

  /**
   * Key para ranking del leaderboard (ZSET)
   */
  leaderboardRanking() {
    return this.generateKey(this.patterns.leaderboardRanking);
  }

  /**
   * Key para catálogo de driver (datos fijos) - LEGACY
   * @param {string|number} rid - ID interno del driver
   */
  driverCatalog(rid) {
    return this.generateKey(this.patterns.driverCatalog, { rid });
  }

  /**
   * Key para estado en vivo del driver - LEGACY
   * @param {string|number} rid - ID interno del driver
   */
  driverState(rid) {
    return this.generateKey(this.patterns.driverState, { rid });
  }

  // === KEYS PARA CLASES ===
  
  /**
   * Key para información de clase
   * @param {string|number} cid - ID de la clase
   */
  classInfo(cid) {
    return this.generateKey(this.patterns.classInfo, { cid });
  }

  /**
   * Key para posiciones por clase
   * @param {string|number} cid - ID de la clase
   */
  classPos(cid) {
    return this.generateKey(this.patterns.classPos, { cid });
  }

  /**
   * Key para mejores tiempos por clase
   * @param {string|number} cid - ID de la clase
   */
  classBest(cid) {
    return this.generateKey(this.patterns.classBest, { cid });
  }

  // === KEYS GLOBALES ===

  /**
   * Key para información de la sesión/run
   */
  runInfo() {
    return this.generateKey(this.patterns.runInfo);
  }

  /**
   * Key para información del evento
   */
  eventInfo() {
    return this.generateKey(this.patterns.eventInfo);
  }

  /**
   * Key para estado global (banderas, etc.)
   */
  globalState() {
    return this.generateKey(this.patterns.globalState);
  }

  /**
   * Key para standings generales por posición
   */
  posStandings() {
    return this.generateKey(this.patterns.posStandings);
  }

  /**
   * Key para standings por mejor vuelta
   */
  bestStandings() {
    return this.generateKey(this.patterns.bestStandings);
  }

  /**
   * Key para mapeo reg → rid
   */
  ridMapping() {
    return this.generateKey(this.patterns.ridMapping);
  }

  // === STREAMS ===

  /**
   * Stream de passings/cruces
   */
  passStream() {
    return this.generateKey(this.patterns.passStream);
  }

  /**
   * Stream de correcciones
   */
  correctionStream() {
    return this.generateKey(this.patterns.correctionStream);
  }

  /**
   * Stream de cruces intermedios
   */
  lineStream() {
    return this.generateKey(this.patterns.lineStream);
  }

  // === CANALES PUB/SUB ===

  /**
   * Canal para banderas
   */
  flagChannel() {
    return `${this.sessionKey}:ch:flag`;
  }

  /**
   * Canal para posiciones
   */
  posChannel() {
    return `${this.sessionKey}:ch:pos`;
  }

  /**
   * Canal para mejores vueltas
   */
  bestChannel() {
    return `${this.sessionKey}:ch:best`;
  }

  /**
   * Canal para passings
   */
  passChannel() {
    return `${this.sessionKey}:ch:pass`;
  }

  /**
   * Canal para información de sesión
   */
  sessionChannel() {
    return `${this.sessionKey}:ch:session`;
  }

  /**
   * Canal para metadatos de evento
   */
  eventChannel() {
    return `${this.sessionKey}:ch:event`;
  }

  /**
   * Canal para correcciones de tiempo
   */
  correctionChannel() {
    return `${this.sessionKey}:ch:correction`;
  }

  // === UTILIDADES ===

  /**
   * Obtiene todas las keys de drivers para una sesión
   */
  getDriverKeys(rid) {
    return {
      catalog: this.driverCatalog(rid),
      state: this.driverState(rid)
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
      available_patterns: Object.keys(this.patterns),
      generator_type: 'KeyGenerator'
    };
  }
}

module.exports = KeyGenerator;
