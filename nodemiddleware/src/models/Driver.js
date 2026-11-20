class Driver {
  constructor(data = {}) {
    this.id = data.id || data.driver_id || data.transponder_id || null;
    this.name = data.name || data.driver_name || `Driver ${this.id}` || '';
    this.transponderId = data.transponder_id || data.transponderId || this.id;
    this.currentPosition = parseInt(data.current_position || data.currentPosition || data.position) || 0;
    this.totalLaps = parseInt(data.total_laps || data.totalLaps || data.laps) || 0;
    this.currentLapTime = data.current_lap_time || data.currentLapTime || null;
    this.bestLapTime = data.best_lap_time || data.bestLapTime || null;
    this.bestLapTimeMs = parseInt(data.best_lap_time_ms || data.bestLapTimeMs) || null;
    this.lastLapTime = data.last_lap_time || data.lastLapTime || null;
    this.lastLapTimeMs = parseInt(data.last_lap_time_ms || data.lastLapTimeMs) || null;
    this.raceTime = data.race_time || data.raceTime || null;
    this.totalRaceTime = data.total_race_time || data.totalRaceTime || null;
    this.totalRaceTimeMs = parseInt(data.total_race_time_ms || data.totalRaceTimeMs) || null;
    this.lastRaceTimeStr = data.last_race_time_str || data.lastRaceTimeStr || '00:00:00';
    this.currentRank = parseInt(data.current_rank || data.currentRank) || 0;
    this.lastUpdateTime = data.last_update_time || data.lastUpdateTime || new Date().toISOString();
    this.passingNumber = data.passing_number || data.passingNumber || 0;
    
    // Asegurar que tenemos un nombre válido
    if (!this.name || this.name === '') {
      this.name = `Driver ${this.transponderId || this.id}`;
    }
  }

  // Actualizar posición del piloto
  updatePosition(positionData) {
    // Actualizar campos de posición
    this.currentPosition = parseInt(positionData.current_position || positionData.position) || this.currentPosition;
    this.totalLaps = parseInt(positionData.total_laps || positionData.laps) || this.totalLaps;
    
    const TimeUtils = require('../utils/TimeUtils');
    
    // Procesar race_time a milisegundos
    if (positionData.race_time) {
      this.raceTime = positionData.race_time;
      
      // Si ya viene en MS, usar ese valor, sino convertir
      if (positionData.race_time_ms) {
        this.totalRaceTimeMs = parseInt(positionData.race_time_ms);
      } else {
        const raceTimeMs = TimeUtils.timeToMilliseconds(positionData.race_time);
        if (raceTimeMs) {
          this.totalRaceTimeMs = raceTimeMs;
        }
      }
    }
    
    // Usar total_race_time si está disponible
    if (positionData.total_race_time) {
      this.totalRaceTime = positionData.total_race_time;
      
      // Si ya viene en MS, usar ese valor, sino convertir
      if (positionData.total_race_time_ms) {
        this.totalRaceTimeMs = parseInt(positionData.total_race_time_ms);
      } else {
        const totalRaceTimeMs = TimeUtils.timeToMilliseconds(positionData.total_race_time);
        if (totalRaceTimeMs) {
          this.totalRaceTimeMs = totalRaceTimeMs;
        }
      }
    }
    
    this.lastRaceTimeStr = positionData.last_race_time_str || this.lastRaceTimeStr;
    this.currentRank = parseInt(positionData.current_rank || positionData.position) || this.currentRank;
    this.passingNumber = parseInt(positionData.passing_number) || this.passingNumber;
    
    // Actualizar nombre si llega información real (no "Driver X")
    if (positionData.driver_name && this.shouldUpdateDriverName(positionData.driver_name)) {
      this.name = positionData.driver_name;
    }
    
    // Actualizar transponder_id si está disponible
    if (positionData.transponder_id && !this.transponderId) {
      this.transponderId = positionData.transponder_id;
    }
    
    this.lastUpdateTime = new Date().toISOString();
  }

  // Actualizar tiempo de vuelta
  updateLapTime(lapData) {
    this.currentLapTime = lapData.lap_time || this.currentLapTime;
    this.totalLaps = parseInt(lapData.lap_number) || this.totalLaps;
    
    // Actualizar campos de tiempo en milisegundos
    const TimeUtils = require('../utils/TimeUtils');
    
    // Procesar lap_time a milisegundos
    if (lapData.lap_time) {
      this.lastLapTime = lapData.lap_time;
      // Convertir a MS si no viene ya convertido
      const lapTimeMs = lapData.lap_time_ms || TimeUtils.timeToMilliseconds(lapData.lap_time);
      if (lapTimeMs) {
        this.lastLapTimeMs = lapTimeMs;
      }
      
      // Actualizar mejor tiempo si es mejor (comparando en MS)
      if (!this.bestLapTimeMs || lapTimeMs < this.bestLapTimeMs) {
        this.bestLapTime = lapData.lap_time;
        this.bestLapTimeMs = lapTimeMs;
      }
    }
    
    // Procesar race_time a milisegundos
    if (lapData.race_time) {
      this.raceTime = lapData.race_time;
      // Convertir a MS si no viene ya convertido
      const raceTimeMs = lapData.race_time_ms || TimeUtils.timeToMilliseconds(lapData.race_time);
      if (raceTimeMs) {
        this.totalRaceTimeMs = raceTimeMs;
        this.totalRaceTime = lapData.race_time;
      }
    }
    
    // Actualizar nombre si llega información real del piloto
    if (lapData.driver_name && this.shouldUpdateDriverName(lapData.driver_name)) {
      this.name = lapData.driver_name;
    }
    
    this.lastUpdateTime = new Date().toISOString();
  }

  // Determinar si debemos actualizar el nombre del piloto
  shouldUpdateDriverName(newName) {
    if (!newName || newName.trim() === '') return false;
    
    // Si no tenemos nombre o es un nombre genérico, siempre actualizar
    if (!this.name || this.name.startsWith('Driver ')) {
      return true;
    }
    
    // Si el nombre nuevo no es genérico y es diferente al actual, actualizar
    if (!newName.startsWith('Driver ') && newName !== this.name) {
      return true;
    }
    
    return false;
  }

  // Convertir a formato Redis
  toRedisHash() {
    return {
      driver_id: this.id,
      driver_name: this.name,
      transponder_id: this.transponderId,
      current_position: this.currentPosition.toString(),
      total_laps: this.totalLaps.toString(),
      current_lap_time: this.currentLapTime || '',
      best_lap_time: this.bestLapTime || '',
      best_lap_time_ms: this.bestLapTimeMs ? this.bestLapTimeMs.toString() : '',
      last_lap_time: this.lastLapTime || '',
      last_lap_time_ms: this.lastLapTimeMs ? this.lastLapTimeMs.toString() : '',
      race_time: this.raceTime || '',
      total_race_time: this.totalRaceTime || '',
      total_race_time_ms: this.totalRaceTimeMs ? this.totalRaceTimeMs.toString() : '',
      last_race_time_str: this.lastRaceTimeStr,
      current_rank: this.currentRank.toString(),
      last_update_time: this.lastUpdateTime,
      passing_number: this.passingNumber.toString()
    };
  }

  // Convertir a formato MySQL
  toMySQLData() {
    return {
      driver_id: this.id,
      driver_name: this.name,
      transponder_id: this.transponderId,
      current_position: this.currentPosition,
      total_laps: this.totalLaps,
      current_lap_time: this.currentLapTime,
      best_lap_time: this.bestLapTime,
      last_lap_time: this.lastLapTime,
      race_time: this.raceTime,
      total_race_time: this.totalRaceTime,
      passing_number: this.passingNumber,
      timestamp: this.lastUpdateTime
    };
  }

  // Crear desde datos de Redis
  static fromRedisHash(driverId, redisData) {
    return new Driver({
      id: driverId,
      ...redisData
    });
  }

  // Validar si el piloto tiene datos válidos
  isValid() {
    return this.id && this.name && this.currentPosition > 0;
  }

  // Obtener información resumida
  getSummary() {
    return {
      id: this.id,
      name: this.name,
      position: this.currentPosition,
      laps: this.totalLaps,
      bestTime: this.bestLapTime,
      bestTimeMs: this.bestLapTimeMs,
      lastTime: this.lastLapTime,
      lastTimeMs: this.lastLapTimeMs,
      totalRaceTime: this.totalRaceTime,
      totalRaceTimeMs: this.totalRaceTimeMs,
      lastRaceTimeStr: this.lastRaceTimeStr
    };
  }
}

module.exports = Driver;
