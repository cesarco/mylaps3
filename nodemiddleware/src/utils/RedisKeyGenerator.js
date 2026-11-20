/**
 * RedisKeyGenerator.js
 * Centralización de todas las claves Redis utilizadas en la aplicación.
 * 
 * Esta clase proporciona métodos para generar todas las claves Redis utilizadas
 * en los diferentes servicios, garantizando consistencia y facilitando cambios
 * en la estructura de claves.
 */

class RedisKeyGenerator {
  /**
   * Constructor del generador de claves
   * @param {string} prefix - Prefijo para todas las claves (normalmente el sessionKey)
   */
  constructor(prefix = 'default') {
    this.prefix = prefix;
  }

  /**
   * Establece un nuevo prefijo para todas las claves
   * @param {string} prefix - Nuevo prefijo
   * @returns {RedisKeyGenerator} - Instancia para encadenar métodos
   */
  setPrefix(prefix) {
    this.prefix = prefix;
    return this;
  }

  /**
   * Obtiene el prefijo actual
   * @returns {string} - Prefijo actual
   */
  getPrefix() {
    return this.prefix;
  }

  // ==== CLAVES DE SESIÓN ====
  
  /**
   * Key para el hash principal de sesión que almacena flags, datos de run, etc.
   * @returns {string} - Ej: "default:session"
   */
  session() {
    return `${this.prefix}:session`;
  }

  /**
   * Key para sesión en formato legacy
   * @returns {string} - Ej: "default:leaderboard:session"
   */
  legacySessionKey() {
    return `${this.prefix}:leaderboard:session`;
  }

  // ==== CLAVES DE DRIVER ====
  
  /**
   * Key para el catálogo de un driver (datos fijos)
   * @param {string|number} rid - RID del driver
   * @returns {string} - Ej: "default:driver:catalog:123"
   */
  driverCatalog(rid) {
    return `${this.prefix}:driver:catalog:${rid}`;
  }

  /**
   * Key para el estado de un driver (datos de carrera en tiempo real)
   * @param {string|number} rid - RID del driver
   * @returns {string} - Ej: "default:driver:state:123"
   */
  driverState(rid) {
    return `${this.prefix}:driver:state:${rid}`;
  }

  /**
   * Key para el mapeo registration → RID
   * @returns {string} - Ej: "default:driver:rid:mapping"
   */
  ridMapping() {
    return `${this.prefix}:driver:rid:mapping`;
  }

  // ==== CLAVES DE LEADERBOARD ====
  
  /**
   * Key para el ranking general de leaderboard (ZSET)
   * @returns {string} - Ej: "default:leaderboard:ranking"
   */
  leaderboardRanking() {
    return `${this.prefix}:leaderboard:ranking`;
  }

  /**
   * Key para un piloto en posición específica del leaderboard
   * @param {string|number} position - Posición del piloto
   * @returns {string} - Ej: "default:leaderboard:driver:1"
   */
  leaderboardDriver(position) {
    return `${this.prefix}:leaderboard:driver:${position}`;
  }

  /**
   * Key para ranking de pilotos por clase
   * @param {string|number} classId - ID de la clase
   * @returns {string} - Ej: "default:leaderboard:class:1"
   */
  leaderboardClass(classId) {
    return `${this.prefix}:leaderboard:class:${classId}`;
  }

  // ==== CLAVES DE VUELTAS Y TIEMPOS ====
  
  /**
   * Key para el historial de vueltas de un piloto
   * @param {string|number} driverId - ID del piloto
   * @returns {string} - Ej: "default:laps:history:123"
   */
  lapsHistory(driverId) {
    return `${this.prefix}:laps:history:${driverId}`;
  }

  /**
   * Key para la mejor vuelta de un piloto
   * @param {string|number} driverId - ID del piloto
   * @returns {string} - Ej: "default:laps:best:123"
   */
  bestLap(driverId) {
    return `${this.prefix}:laps:best:${driverId}`;
  }

  /**
   * Key para la última vuelta de un piloto
   * @param {string|number} driverId - ID del piloto
   * @returns {string} - Ej: "default:laps:last:123"
   */
  lastLap(driverId) {
    return `${this.prefix}:laps:last:${driverId}`;
  }

  /**
   * Key para el ranking de mejores vueltas (ZSET)
   * @returns {string} - Ej: "default:best:standings"
   */
  bestStandings() {
    return `${this.prefix}:best:standings`;
  }

  /**
   * Key para el ranking de mejores vueltas por clase (ZSET)
   * @param {string|number} classId - ID de la clase
   * @returns {string} - Ej: "default:class:1:best"
   */
  classBest(classId) {
    return `${this.prefix}:class:${classId}:best`;
  }

  // ==== CLAVES DE STREAMS Y CANALES ====
  
  /**
   * Key para el stream principal de passings
   * @returns {string} - Ej: "default:stream:passings"
   */
  passingsStream() {
    return `${this.prefix}:stream:passings`;
  }

  /**
   * Key para el canal de notificaciones de banderas
   * @returns {string} - Ej: "default:channel:flags"
   */
  flagsChannel() {
    return `${this.prefix}:channel:flags`;
  }

  /**
   * Key para el canal de notificaciones de posiciones
   * @returns {string} - Ej: "default:channel:positions"
   */
  positionsChannel() {
    return `${this.prefix}:channel:positions`;
  }

  /**
   * Key para el canal de notificaciones de mejores vueltas
   * @returns {string} - Ej: "default:channel:best"
   */
  bestChannel() {
    return `${this.prefix}:channel:best`;
  }

  // ==== CLAVES LEGACY (COMPATIBILIDAD) ====
  
  /**
   * Key para posiciones en formato antiguo (ZSET)
   * @returns {string} - Ej: "default:pos:standings"
   */
  legacyPosStandings() {
    return `${this.prefix}:pos:standings`;
  }
  
  /**
   * Genera una key basada en un patrón con placeholders
   * @param {string} pattern - Patrón con placeholders {placeholder}
   * @param {Object} params - Objeto con valores para reemplazar
   * @returns {string} - Key generada
   */
  generateKey(pattern, params = {}) {
    let key = pattern.replace('{prefix}', this.prefix);
    
    // Reemplazar otros parámetros
    Object.entries(params).forEach(([placeholder, value]) => {
      key = key.replace(`{${placeholder}}`, value);
    });
    
    return key;
  }
}

module.exports = RedisKeyGenerator;
