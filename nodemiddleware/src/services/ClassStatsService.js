/**
 * ClassStatsService.js
 * Servicio para gestionar las estadísticas de clases, incluyendo el conteo de pilotos
 */

class ClassStatsService {
  constructor(redisClient, logger = console) {
    this.redis = redisClient;
    this.logger = logger;
  }

  /**
   * Actualiza la información básica de una clase
   * @param {string|number} classId - ID de la clase
   * @param {Object} classInfo - Información de la clase (name, description, etc.)
   */
  async updateClassInfo(classId, classInfo = {}) {
    try {
      const classKey = `class:${classId}`;
      
      // Datos básicos de la clase
      const classData = {
        id: classId,
        class_id: classId,
        class_number: classId,
        name: classInfo.name || classInfo.description || `Class ${classId}`,
        description: classInfo.description || classInfo.name || `Class ${classId}`,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...classInfo // Incluir cualquier información adicional
      };
      
      // Guardar información de la clase
      await this.redis.hset(classKey, classData);
      
      this.logger.info(`✅ Información de clase ${classId} actualizada: ${classData.name}`);
      
      return {
        success: true,
        class_id: classId,
        class_data: classData
      };
    } catch (error) {
      this.logger.error(`❌ Error actualizando información de clase ${classId}:`, error);
      return { 
        success: false, 
        error: error.message,
        class_id: classId
      };
    }
  }

  /**
   * Actualiza las estadísticas de una clase específica
   * @param {string|number} classId - ID de la clase
   */
  async updateClassStats(classId) {
    try {
      const statsKey = `class:${classId}:stats`;
      const classKey = `class:${classId}`;
      
      // Obtener información básica de la clase
      const classInfo = await this.redis.hgetall(classKey);
      
      // Obtener todos los drivers y filtrar por clase
      const driverKeys = await this.redis.keys('race:default:driver:*:catalog');
      let driverCount = 0;
      
      for (const driverKey of driverKeys) {
        const driverData = await this.redis.hgetall(driverKey);
        if (driverData.class && driverData.class.toString() === classId.toString()) {
          driverCount++;
        }
      }
      
      // Crear estadísticas completas de la clase
      const statsData = {
        // Información básica de la clase
        id: classId,
        class_id: classId,
        class_number: classId,
        name: classInfo.name || `Class ${classId}`,
        description: classInfo.description || classInfo.name || `Class ${classId}`,
        
        // Estadísticas
        driver_count: driverCount,
        total_drivers: driverCount,
        active_drivers: driverCount,
        
        // Timestamps
        last_updated: new Date().toISOString(),
        created_at: classInfo.created_at || new Date().toISOString()
      };
      
      // Actualizar el hash de estadísticas con información completa
      await this.redis.hset(statsKey, statsData);
      
      this.logger.info(`✅ Estadísticas de clase ${classId} actualizadas: ${driverCount} pilotos`);
      
      return {
        success: true,
        class_id: classId,
        driver_count: driverCount,
        stats_data: statsData
      };
    } catch (error) {
      this.logger.error(`❌ Error actualizando estadísticas de clase ${classId}:`, error);
      return { 
        success: false, 
        error: error.message,
        class_id: classId
      };
    }
  }

  /**
   * Actualiza estadísticas de todas las clases activas
   */
  async updateAllClassStats() {
    try {
      // Obtener todas las clases registradas
      const classKeysPattern = 'class:*';
      const classKeysRaw = await this.redis.keys(classKeysPattern);
      
      // Extraer IDs de clase de las keys (evitar las keys de stats)
      const classIds = classKeysRaw
        .filter(key => !key.includes(':stats')) // Excluir las keys de stats
        .map(key => {
          const match = key.match(/class:(\d+)$/);
          return match ? match[1] : null;
        })
        .filter(id => id !== null);
      
      this.logger.info(`🔄 Actualizando estadísticas para ${classIds.length} clases`);
      
      // Actualizar estadísticas para cada clase
      const results = [];
      for (const classId of classIds) {
        const result = await this.updateClassStats(classId);
        results.push(result);
      }
      
      return {
        success: true,
        updated_classes: results.length,
        details: results
      };
    } catch (error) {
      this.logger.error(`❌ Error actualizando todas las estadísticas de clases:`, error);
      return { 
        success: false, 
        error: error.message
      };
    }
  }

  /**
   * Obtiene las estadísticas de una clase
   * @param {string|number} classId - ID de la clase
   */
  async getClassStats(classId) {
    try {
      const statsKey = `class:${classId}:stats`;
      const stats = await this.redis.hgetall(statsKey);
      
      // Si no hay estadísticas, calcularlas primero
      if (!stats || Object.keys(stats).length === 0) {
        await this.updateClassStats(classId);
        return await this.redis.hgetall(statsKey);
      }
      
      return stats;
    } catch (error) {
      this.logger.error(`❌ Error obteniendo estadísticas de clase ${classId}:`, error);
      return {};
    }
  }

  /**
   * Obtiene todas las clases con sus estadísticas
   * @returns {Object} - Objeto con todas las clases y sus estadísticas
   */
  async getAllClassStats() {
    try {
      const pattern = 'class:*:stats';
      const keys = await this.redis.keys(pattern);
      const allStats = {};
      
      for (const key of keys) {
        const classId = key.split(':')[1];
        const stats = await this.redis.hgetall(key);
        if (stats && Object.keys(stats).length > 0) {
          allStats[classId] = stats;
        }
      }
      
      return allStats;
    } catch (error) {
      this.logger.error('❌ Error obteniendo todas las estadísticas de clases:', error);
      return {};
    }
  }
}

module.exports = ClassStatsService;
