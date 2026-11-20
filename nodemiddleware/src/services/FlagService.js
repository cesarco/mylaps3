/**
 * FlagService.js
 * Gestión de banderas y estados de carrera
 */

class FlagService {
  constructor(redisClient, logger = console, sessionKey = 'default') {
    this.redis = redisClient;
    this.logger = logger;
    this.sessionKey = sessionKey;
  }

  /**
   * Actualiza estado de banderas en la sesión
   * @param {Object} flagData - Datos de banderas ($F)
   */
  async updateFlags(flagData) {
    try {
      const sessionKey = `${this.sessionKey}:leaderboard:session`;
      
      const flagInfo = {
        current_flag: flagData.flag || '',
        laps_to_go: parseInt(flagData.laps_to_go) || 0,
        time_to_go_ms: parseInt(flagData.time_to_go_ms) || 0,
        race_time_ms: parseInt(flagData.race_time_ms) || 0,
        time_of_day_ms: parseInt(flagData.time_of_day_ms) || 0,
        last_updated: Date.now()
      };
      
      await this.redis.hset(sessionKey, flagInfo);
      
      this.logger.info(`✅ Banderas actualizadas: ${flagInfo.current_flag}, Vueltas: ${flagInfo.laps_to_go}`);
      
      return { success: true, flags: flagInfo };
    } catch (error) {
      this.logger.error(`❌ Error actualizando banderas:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtiene el estado actual de las banderas
   */
  async getFlags() {
    try {
      const sessionKey = `${this.sessionKey}:leaderboard:session`;
      const sessionData = await this.redis.hgetall(sessionKey);
      
      return {
        current_flag: sessionData.current_flag || '',
        laps_to_go: parseInt(sessionData.laps_to_go) || 0,
        time_to_go_ms: parseInt(sessionData.time_to_go_ms) || 0,
        race_time_ms: parseInt(sessionData.race_time_ms) || 0,
        time_of_day_ms: parseInt(sessionData.time_of_day_ms) || 0,
        last_updated: sessionData.last_updated || null
      };
    } catch (error) {
      this.logger.error(`❌ Error obteniendo banderas:`, error);
      return {};
    }
  }
}

module.exports = FlagService;
