class TimeUtils {
  // Convertir tiempo en formato MM:SS.mmm o HH:MM:SS.mmm a milisegundos
  static timeToMilliseconds(timeString) {
    if (!timeString || timeString === '---' || timeString === '') {
      return null;
    }

    try {
      // Remover espacios en blanco
      const cleanTime = timeString.trim();
      
      // Patrón para HH:MM:SS.mmm, MM:SS.mmm, HH:MM:SS o MM:SS
      const timePatternWithMs = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2})\.(\d{1,3})$/;
      const timePatternNoMs = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2})$/;
      
      let match = cleanTime.match(timePatternWithMs);
      let hasMilliseconds = true;
      
      if (!match) {
        match = cleanTime.match(timePatternNoMs);
        hasMilliseconds = false;
      }
      
      if (!match) {
        console.warn(`⚠️  Invalid time format: ${timeString}`);
        return null;
      }

      const hours = parseInt(match[1] || '0');
      const minutes = parseInt(match[2]);
      const seconds = parseInt(match[3]);
      const milliseconds = hasMilliseconds ? parseInt(match[4].padEnd(3, '0')) : 0;

      return (hours * 3600 + minutes * 60 + seconds) * 1000 + milliseconds;
    } catch (error) {
      console.warn(`⚠️  Error parsing time "${timeString}":`, error.message);
      return null;
    }
  }

  // Convertir milisegundos a formato HH:MM:SS.mmm o MM:SS.mmm
  static millisecondsToTime(ms, includeHours = false) {
    if (!ms || ms <= 0) {
      return includeHours ? '00:00:00.000' : '00:00.000';
    }

    try {
      const totalSeconds = Math.floor(ms / 1000);
      const milliseconds = ms % 1000;
      
      const hours = Math.floor(totalSeconds / 3600);
      const minutes = Math.floor((totalSeconds % 3600) / 60);
      const seconds = totalSeconds % 60;

      if (includeHours || hours > 0) {
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
      } else {
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
      }
    } catch (error) {
      console.warn(`⚠️  Error formatting time from ms "${ms}":`, error.message);
      return includeHours ? '00:00:00.000' : '00:00.000';
    }
  }

  // Comparar dos tiempos (retorna -1, 0, 1)
  static compareTimes(timeA, timeB) {
    const msA = this.timeToMilliseconds(timeA);
    const msB = this.timeToMilliseconds(timeB);

    if (msA === null && msB === null) return 0;
    if (msA === null) return 1;
    if (msB === null) return -1;

    return msA - msB;
  }

  // Obtener el mejor tiempo de una lista
  static getBestTime(times) {
    const validTimes = times.filter(time => time && time !== '---' && time !== '');
    
    if (validTimes.length === 0) {
      return null;
    }

    return validTimes.reduce((best, current) => {
      return this.compareTimes(current, best) < 0 ? current : best;
    });
  }

  // Formatear timestamp a fecha legible
  static formatTimestamp(timestamp) {
    try {
      const date = new Date(timestamp);
      return date.toISOString().replace('T', ' ').substring(0, 19);
    } catch (error) {
      return new Date().toISOString().replace('T', ' ').substring(0, 19);
    }
  }

  // Obtener tiempo actual en formato ISO
  static getCurrentTimestamp() {
    return new Date().toISOString();
  }

  // Calcular diferencia entre dos tiempos
  static calculateTimeDifference(timeA, timeB) {
    const msA = this.timeToMilliseconds(timeA);
    const msB = this.timeToMilliseconds(timeB);

    if (msA === null || msB === null) {
      return null;
    }

    const diff = Math.abs(msA - msB);
    return this.millisecondsToTime(diff);
  }

  // Comparar dos tiempos en milisegundos directamente
  static compareMs(ms1, ms2) {
    if (ms1 < ms2) return -1;
    if (ms1 > ms2) return 1;
    return 0;
  }

  // Encontrar el mejor tiempo (menor) de un array de tiempos en ms
  static findBestTimeMs(timesMs) {
    if (!timesMs || timesMs.length === 0) return null;
    
    const validTimes = timesMs.filter(time => time > 0);
    if (validTimes.length === 0) return null;
    
    return Math.min(...validTimes);
  }

  // Validar si un string de tiempo es válido
  static isValidTimeString(timeString) {
    if (!timeString || typeof timeString !== 'string') return false;
    
    const timePattern = /^(?:\d{1,2}:)?\d{1,2}:\d{1,2}\.\d{1,3}$/;
    return timePattern.test(timeString.trim());
  }
}

module.exports = TimeUtils;
