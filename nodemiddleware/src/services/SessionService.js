/**
 * SessionService.js
 * Gestión centralizada de datos de sesión usando estructura leaderboard:session:
 */

class SessionService {
  constructor(redisClient, logger = console, sessionKey = 'default') {
    this.redis = redisClient;
    this.logger = logger;
    this.sessionKey = sessionKey;
  }

  /**
   * Actualiza información de run ($B)
   * HSET {sessionKey}:session run_*
   */
  async updateRunInfo(data) {
    try {
      const { run_number, description, session_id, session_name, status } = data;
      
      const sessionKey = `${this.sessionKey}:session`;
      const runData = {
        [`run_number`]: parseInt(run_number) || 0,
        [`run_description`]: description || '',
        [`run_session_id`]: session_id || `run_${run_number}`,
        [`run_session_name`]: session_name || description || `Run ${run_number}`,
        [`run_status`]: status || 'active',
        [`run_updated_at_ms`]: Date.now()
      };
      
      await this.redis.hset(sessionKey, runData);
      
      this.logger.info(`✅ Session run updated: ${run_number} - ${description} → Redis key: ${sessionKey}`);
      
      return { 
        success: true, 
        run_number: parseInt(run_number) || 0, 
        description,
        session_id: runData[`run_session_id`]
      };
    } catch (error) {
      this.logger.error(`❌ Error updating session run info:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Actualiza metadatos de evento ($E)
   * HSET {sessionKey}:session event_*
   */
  async updateEventMetadata(data) {
    try {
      const { key, value, setting_key, setting_value, metadata_type } = data;
      
      const sessionKey = `${this.sessionKey}:session`;
      
      // Agregar nuevo campo con prefijo event_
      const fieldName = `event_${setting_key || key}`;
      const fieldValue = setting_value || value || '';
      
      const eventData = {
        [fieldName]: fieldValue,
        [`event_updated_at_ms`]: Date.now()
      };
      
      await this.redis.hset(sessionKey, eventData);
      
      this.logger.info(`✅ Session event metadata updated: ${fieldName} = ${fieldValue} → Redis key: ${sessionKey}`);
      
      return { 
        success: true, 
        field: fieldName,
        value: fieldValue
      };
    } catch (error) {
      this.logger.error(`❌ Error updating session event metadata:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Actualiza información de clase ($C)
   * HSET {sessionKey}:session class_*
   */
  async updateClassInfo(data) {
    try {
      const { class_id, name, description, class_name } = data;
      
      if (!class_id) {
        this.logger.warn(`❌ No se puede actualizar clase sin class_id`);
        return { success: false, error: 'class_id is required' };
      }
      
      const sessionKey = `${this.sessionKey}:session`;
      
      // Usar el nombre correcto de la clase (prioridad: name, description, class_name, default)
      const className = name || description || class_name || `Class ${class_id}`;
      
      // Agregar/actualizar clase con prefijo
      const classData = {
        [`class_${class_id}`]: className,
        [`classes_updated_at_ms`]: Date.now()
      };
      
      await this.redis.hset(sessionKey, classData);
      
      this.logger.info(`✅ Session class updated: ${class_id} - ${className} → Redis key: ${sessionKey}`);
      
      return { 
        success: true, 
        class_id, 
        name: className
      };
    } catch (error) {
      this.logger.error(`❌ Error updating session class info:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Actualiza estado de banderas ($F)
   * HSET {sessionKey}:session flags_*
   */
  async updateFlags(data) {
    try {
      const { laps_to_go, time_to_go_ms, time_of_day_ms, race_time_ms, flag } = data;
      
      const sessionKey = `${this.sessionKey}:session`;
      const flagData = {
        [`flags_laps_to_go`]: parseInt(laps_to_go) || 0,
        [`flags_time_to_go_ms`]: parseInt(time_to_go_ms) || 0,
        [`flags_time_of_day_ms`]: parseInt(time_of_day_ms) || 0,
        [`flags_race_time_ms`]: parseInt(race_time_ms) || 0,
        [`flags_flag`]: flag || '',
        [`flags_updated_at_ms`]: Date.now()
      };
      
      // Log detallado antes de la operación
      this.logger.info(`🏁 Updating flags: ${flag}, Laps to go: ${laps_to_go} in Redis key: ${sessionKey}`);
      
      // Realizar la operación HSET con flags
      await this.redis.hset(sessionKey, flagData);
      
      // Añadir verificación para asegurar que los datos se guardaron correctamente
      try {
        const savedData = await this.redis.hgetall(sessionKey);
        const flagsSaved = savedData[`flags_flag`] === flag;
        const lapsToGoSaved = parseInt(savedData[`flags_laps_to_go`] || 0) === parseInt(laps_to_go || 0);
        
        if (flagsSaved && lapsToGoSaved) {
          this.logger.info(`✅ Session flags updated successfully: ${flag}, Laps to go: ${laps_to_go} → Redis key: ${sessionKey}`);
        } else {
          this.logger.warn(`⚠️ Session flags may not have been saved correctly in ${sessionKey}: Flag: ${flag} vs ${savedData[`flags_flag`]}, Laps: ${laps_to_go} vs ${savedData[`flags_laps_to_go`]}`);
        }
      } catch (verifyError) {
        this.logger.warn(`⚠️ Could not verify flags saved in Redis: ${verifyError.message}`);
      }
      
      return { 
        success: true, 
        flag, 
        race_time_ms: parseInt(race_time_ms) || 0,
        laps_to_go: parseInt(laps_to_go) || 0
      };
    } catch (error) {
      this.logger.error(`❌ Error updating session flags:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtiene información completa de la sesión
   */
  async getSessionInfo() {
    try {
      const sessionKey = `${this.sessionKey}:session`;
      const sessionData = await this.redis.hgetall(sessionKey);
      
      // Separar los datos por categorías usando prefijos
      const run = {};
      const event = {};
      const classes = {};
      const flags = {};
      
      Object.entries(sessionData || {}).forEach(([key, value]) => {
        if (key.startsWith('run_')) {
          run[key.replace('run_', '')] = value;
        } else if (key.startsWith('event_')) {
          event[key.replace('event_', '')] = value;
        } else if (key.startsWith('class_')) {
          classes[key] = value; // Mantener el prefijo class_ para identificación
        } else if (key.startsWith('classes_')) {
          // Metadatos de clases
          classes[key.replace('classes_', '')] = value;
        } else if (key.startsWith('flags_')) {
          flags[key.replace('flags_', '')] = value;
        }
      });

      this.logger.debug(`📊 Retrieved session info from ${sessionKey}: Run fields: ${Object.keys(run).length}, Flag fields: ${Object.keys(flags).length}`);
      
      return { run, event, classes, flags };
    } catch (error) {
      this.logger.error(`❌ Error getting session info:`, error);
      return { run: {}, event: {}, classes: {}, flags: {} };
    }
  }

  /**
   * Obtiene solo información del run actual
   */
  async getRunInfo() {
    try {
      const sessionKey = `${this.sessionKey}:session`;
      const sessionData = await this.redis.hgetall(sessionKey);
      const runData = {};
      
      Object.entries(sessionData || {}).forEach(([key, value]) => {
        if (key.startsWith('run_')) {
          runData[key.replace('run_', '')] = value;
        }
      });
      
      this.logger.debug(`📊 Retrieved run info from ${sessionKey}: ${Object.keys(runData).length} fields`);
      return runData;
    } catch (error) {
      this.logger.error(`❌ Error getting run info:`, error);
      return {};
    }
  }

  /**
   * Obtiene solo información del evento
   */
  async getEventInfo() {
    try {
      const sessionKey = `${this.sessionKey}:session`;
      const sessionData = await this.redis.hgetall(sessionKey);
      const eventData = {};
      
      Object.entries(sessionData || {}).forEach(([key, value]) => {
        if (key.startsWith('event_')) {
          eventData[key.replace('event_', '')] = value;
        }
      });
      
      this.logger.debug(`📊 Retrieved event info from ${sessionKey}: ${Object.keys(eventData).length} fields`);
      return eventData;
    } catch (error) {
      this.logger.error(`❌ Error getting event info:`, error);
      return {};
    }
  }

  /**
   * Obtiene solo información de clases
   */
  async getClassesInfo() {
    try {
      const sessionKey = `${this.sessionKey}:session`;
      const sessionData = await this.redis.hgetall(sessionKey);
      const classesData = {};
      
      Object.entries(sessionData || {}).forEach(([key, value]) => {
        if (key.startsWith('class_') || key.startsWith('classes_')) {
          classesData[key] = value;
        }
      });
      
      this.logger.debug(`📊 Retrieved classes info from ${sessionKey}: ${Object.keys(classesData).length} fields`);
      return classesData;
    } catch (error) {
      this.logger.error(`❌ Error getting classes info:`, error);
      return {};
    }
  }

  /**
   * Actualiza información completa de sesión
   * @param {Object} sessionData - Datos de la sesión
   */
  async updateSession(sessionData) {
    try {
      const sessionKey = `${this.sessionKey}:leaderboard:session`;
      
      // Estructura de datos de sesión
      const sessionInfo = {
        // Datos de Run ($B)
        run_number: sessionData.run_number || null,
        run_description: sessionData.description || sessionData.run_description || '',
        session_id: sessionData.session_id || '',
        session_name: sessionData.session_name || sessionData.description || '',
        session_status: sessionData.status || sessionData.session_status || 'unknown',
        
        // Datos de Evento ($E)
        event_metadata: sessionData.event_metadata || {},
        
        // Datos de Flag/Estado ($F)
        current_flag: sessionData.flag || sessionData.current_flag || '',
        laps_to_go: parseInt(sessionData.laps_to_go) || 0,
        time_to_go_ms: parseInt(sessionData.time_to_go_ms) || 0,
        race_time_ms: parseInt(sessionData.race_time_ms) || 0,
        
        // Metadatos
        last_updated: Date.now(),
        updated_by: sessionData.source || 'middleware'
      };
      
      await this.redis.hset(sessionKey, sessionInfo);
      
      this.logger.info(`✅ Sesión actualizada: ${sessionInfo.session_name || 'Unknown'}`);
      
      return { success: true, session: sessionInfo };
    } catch (error) {
      this.logger.error(`❌ Error actualizando sesión:`, error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Obtiene información completa de la sesión
   */
  async getSession() {
    try {
      const sessionKey = `${this.sessionKey}:leaderboard:session`;
      const sessionData = await this.redis.hgetall(sessionKey);
      
      if (sessionData.event_metadata) {
        try {
          sessionData.event_metadata = JSON.parse(sessionData.event_metadata);
        } catch (e) {
          sessionData.event_metadata = {};
        }
      }
      
      return sessionData;
    } catch (error) {
      this.logger.error(`❌ Error obteniendo información de sesión:`, error);
      return {};
    }
  }

  /**
   * Obtiene solo información de banderas
   */
  async getFlagsInfo() {
    try {
      const sessionKey = `${this.sessionKey}:session`;
      const sessionData = await this.redis.hgetall(sessionKey);
      const flagsData = {};
      
      Object.entries(sessionData || {}).forEach(([key, value]) => {
        if (key.startsWith('flags_')) {
          flagsData[key.replace('flags_', '')] = value;
        }
      });
      
      this.logger.debug(`📊 Retrieved flags info from ${sessionKey}: ${Object.keys(flagsData).length} fields, current flag: ${flagsData.flag || 'None'}`);
      return flagsData;
    } catch (error) {
      this.logger.error(`❌ Error getting flags info:`, error);
      return {};
    }
  }

  /**
   * Verificar el estado actual completo de la sesión en Redis
   * Útil para debugging
   */
  async verifySessionStorage() {
    try {
      const sessionKey = `${this.sessionKey}:session`;
      // Intentar obtener los datos de sessionKey
      const sessionData = await this.redis.hgetall(sessionKey);
      
      // Verificar si hay datos de flags
      const hasFlags = Object.keys(sessionData).some(key => key.startsWith('flags_'));
      const flagData = hasFlags ? 
        `Current Flag: ${sessionData['flags_flag'] || 'None'}, Laps to go: ${sessionData['flags_laps_to_go'] || '0'}` : 
        'No flag data found';
      
      // Verificar si hay datos de run
      const hasRun = Object.keys(sessionData).some(key => key.startsWith('run_'));
      const runData = hasRun ? 
        `Run: ${sessionData['run_number'] || 'None'} - ${sessionData['run_description'] || 'No description'}` : 
        'No run data found';
      
      // Verificar si hay datos de event
      const hasEvent = Object.keys(sessionData).some(key => key.startsWith('event_'));
      const eventKeys = Object.keys(sessionData).filter(key => key.startsWith('event_'));
      const eventData = hasEvent ? 
        `Event keys found: ${eventKeys.join(', ')}` : 
        'No event data found';
      
      // Log de resultados
      this.logger.info(`📊 Session Storage Verification in '${sessionKey}':`);
      this.logger.info(`🏁 ${flagData}`);
      this.logger.info(`🏎️ ${runData}`);
      this.logger.info(`🏆 ${eventData}`);
      this.logger.info(`📈 Total keys in session: ${Object.keys(sessionData).length}`);
      
      return {
        success: true,
        hasData: Object.keys(sessionData).length > 0,
        hasFlags,
        hasRun,
        hasEvent,
        flagData: hasFlags ? { 
          flag: sessionData['flags_flag'],
          laps_to_go: sessionData['flags_laps_to_go'],
          race_time_ms: sessionData['flags_race_time_ms']
        } : null,
        sessionKey: sessionKey
      };
      
    } catch (error) {
      this.logger.error(`❌ Error verifying session storage:`, error);
      return { 
        success: false, 
        error: error.message,
        sessionKey: `${this.sessionKey}:session` 
      };
    }
  }
}

module.exports = SessionService;
