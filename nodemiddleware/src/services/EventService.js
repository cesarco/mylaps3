/**
 * EventService.js
 * Gestión de eventos, sesiones, banderas y clases según especificación Redis_RMonitor_Middleware.md
 */
const KeyGenerator = require('../utils/KeyGenerator');

class EventService {
  constructor(redisClient, logger = console, sessionKey = 'default') {
    this.redis = redisClient;
    this.logger = logger;
    this.sessionKey = sessionKey;
    this.keyGen = new KeyGenerator(sessionKey);
  }

  /**
   * Actualiza banderas ($F) según especificación
   * HSET race:{S}:state + PUBLISH race:{S}:ch:flag
   */
  async updateFlags(data) {
    try {
      const { laps_to_go, time_to_go_ms, time_of_day_ms, race_time_ms, flag } = data;
      
      const stateKey = this.keyGen.globalState();
      const stateData = {
        laps_to_go: parseInt(laps_to_go) || 0,
        time_to_go_ms: parseInt(time_to_go_ms) || 0,
        time_of_day_ms: parseInt(time_of_day_ms) || 0,
        race_time_ms: parseInt(race_time_ms) || 0,
        flag: flag || '',
        updated_at_ms: Date.now()
      };
      
      await this.redis.hset(stateKey, stateData);
      
      // Publicar evento
      const flagChannel = this.keyGen.flagChannel();
      await this.redis.publish(flagChannel, JSON.stringify({
        type: 'FLAG_UPDATE',
        flag,
        laps_to_go: parseInt(laps_to_go) || 0,
        race_time_ms: parseInt(race_time_ms) || 0,
        timestamp: new Date().toISOString()
      }));
      
      this.logger.info(`✅ Banderas actualizadas: ${flag}, Vueltas restantes: ${laps_to_go}`);
      
      return { 
        success: true, 
        flag, 
        race_time_ms: parseInt(race_time_ms) || 0
      };
    } catch (error) {
      this.logger.error(`❌ Error actualizando banderas:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Actualiza información de run ($B) según especificación
   * HSET race:{S}:run
   */
  async updateRunInfo(data) {
    try {
      const { run_number, description, session_id, session_name, status } = data;
      
      const runKey = this.keyGen.runInfo();
      const runData = {
        run_number: parseInt(run_number) || 0,
        description: description || '',
        session_id: session_id || `run_${run_number}`,
        session_name: session_name || description || `Run ${run_number}`,
        status: status || 'active',
        updated_at_ms: Date.now()
      };
      
      await this.redis.hset(runKey, runData);
      
      this.logger.info(`✅ Run actualizado: ${run_number} - ${description}`);
      
      return { 
        success: true, 
        run_number: parseInt(run_number) || 0, 
        description,
        session_id: runData.session_id
      };
    } catch (error) {
      this.logger.error(`❌ Error actualizando run info:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Actualiza sesión ($B) según especificación
   * HSET race:{S}:run
   */
  async updateSession(data) {
    try {
      const { run_number, description, started_at_ms } = data;
      
      const runKey = this.keyGen.runInfo();
      const runData = {
        run_number: parseInt(run_number) || 0,
        description: description || '',
        updated_at_ms: Date.now()
      };
      
      // Si hay started_at_ms, incluirlo
      if (started_at_ms) {
        runData.started_at_ms = parseInt(started_at_ms);
      }
      
      await this.redis.hset(runKey, runData);
      
      this.logger.info(`✅ Sesión actualizada: Run ${run_number} - ${description}`);
      
      return { 
        success: true, 
        run_number: parseInt(run_number) || 0, 
        description
      };
    } catch (error) {
      this.logger.error(`❌ Error actualizando sesión:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Actualiza clase ($C) según especificación
   * HSET race:{S}:class:{cid}
   */
  async updateClass(data) {
    try {
      const { class_id, name } = data;
      
      if (!class_id) {
        this.logger.warn(`❌ No se puede actualizar clase sin class_id`);
        return { success: false, error: 'class_id is required' };
      }
      
      const classKey = this.keyGen.classInfo(class_id);
      await this.redis.hset(classKey, {
        name: name || `Class ${class_id}`,
        updated_at_ms: Date.now()
      });
      
      this.logger.info(`✅ Clase actualizada: ${class_id} - ${name || `Class ${class_id}`}`);
      
      return { 
        success: true, 
        class_id, 
        name: name || `Class ${class_id}`
      };
    } catch (error) {
      this.logger.error(`❌ Error actualizando clase:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Actualiza metadatos de evento ($E) según especificación
   * HSET race:{S}:event
   */
  async updateEventMetadata(data) {
    try {
      const eventKey = this.keyGen.eventInfo();
      
      // Convertir todos los datos a formato apropiado
      const eventData = {};
      for (const [key, value] of Object.entries(data)) {
        if (key.toUpperCase() === 'TRACKLENGTH') {
          eventData[key] = parseInt(value) || 0;
        } else {
          eventData[key] = String(value || '');
        }
      }
      
      // Añadir timestamp de actualización
      eventData.updated_at_ms = Date.now();
      
      await this.redis.hset(eventKey, eventData);
      
      this.logger.info(`✅ Metadatos de evento actualizados con ${Object.keys(eventData).length} campos`);
      
      return { 
        success: true, 
        fields_updated: Object.keys(eventData).length - 1 // Sin contar updated_at_ms
      };
    } catch (error) {
      this.logger.error(`❌ Error actualizando metadatos de evento:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtiene el estado global actual
   */
  async getGlobalState() {
    try {
      const stateKey = this.keyGen.globalState();
      return await this.redis.hgetall(stateKey);
    } catch (error) {
      this.logger.error(`❌ Error obteniendo estado global:`, error);
      return {};
    }
  }

  /**
   * Obtiene información de la sesión actual
   */
  async getSessionInfo() {
    try {
      const runKey = this.keyGen.runInfo();
      return await this.redis.hgetall(runKey);
    } catch (error) {
      this.logger.error(`❌ Error obteniendo información de sesión:`, error);
      return {};
    }
  }

  /**
   * Obtiene información de una clase específica
   * @param {string|number} classId - ID de la clase
   */
  async getClassInfo(classId) {
    try {
      const classKey = this.keyGen.classInfo(classId);
      return await this.redis.hgetall(classKey);
    } catch (error) {
      this.logger.error(`❌ Error obteniendo información de clase ${classId}:`, error);
      return {};
    }
  }

  /**
   * Obtiene los metadatos del evento
   */
  async getEventMetadata() {
    try {
      const eventKey = this.keyGen.eventInfo();
      return await this.redis.hgetall(eventKey);
    } catch (error) {
      this.logger.error(`❌ Error obteniendo metadatos del evento:`, error);
      return {};
    }
  }
}

module.exports = EventService;
