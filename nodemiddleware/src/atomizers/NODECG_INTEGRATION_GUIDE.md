# 📊 Guía de Integración NodeCG con Atomizers
## Consumo de Datos de Timing desde Redis con Estructura Oficial

> **Versión**: 2.0 - Estructura Oficial Redis `race:{S}:*`  
> **Última actualización**: Septiembre 2025  
> **Compatibilidad**: NodeCG, Redis Streams, IoRedis

---

## 🎯 **Resumen Ejecutivo**

Esta guía explica cómo consumir datos de timing desde NodeCG utilizando la nueva estructura oficial de Redis implementada por los atomizers. Los datos ahora siguen el patrón `race:{S}:*` y están organizados en streams, estados de drivers, posiciones y catálogos.

---

## 📚 **Tabla de Contenidos**

1. [Estructura de Datos Oficial](#estructura-de-datos-oficial)
2. [Configuración Inicial](#configuración-inicial)
3. [Extracción del Leaderboard](#extracción-del-leaderboard)
4. [Cálculo de Gaps](#cálculo-de-gaps)
5. [Comparación de Tiempos](#comparación-de-tiempos)
6. [Streams en Tiempo Real](#streams-en-tiempo-real)
7. [Ejemplos Prácticos](#ejemplos-prácticos)
8. [Mejores Prácticas](#mejores-prácticas)

---

## 🏗️ **Estructura de Datos Oficial**

### **Claves Principales**

```javascript
// Estructura oficial race:{S}:* donde S = session key
race:practice1:driver:1:catalog    // Datos de registro del driver
race:practice1:driver:1:state      // Estado actual del driver
race:practice1:pos                 // Posiciones de carrera (sorted set)
race:practice1:x:pass             // Stream de eventos de paso
race:practice1:run                // Información de sesión
race:practice1:event              // Información del evento/pista
race:practice1:class:GT3          // Información de clases
race:practice1:global             // Estado global (banderas, etc.)
```

### **Estructura de Driver Catalog**
```javascript
// race:{S}:driver:{rid}:catalog
{
  "registration": "101",
  "transponder_id": "123456",
  "number": "101",
  "first_name": "Juan",
  "last_name": "Pérez",
  "full_name": "Juan Pérez",
  "class_id": "GT3",
  "team": "Racing Team",
  "created_at": "2025-09-09T10:00:00.000Z"
}
```

### **Estructura de Driver State**
```javascript
// race:{S}:driver:{rid}:state
{
  "laps": "15",
  "total_time": "900000",      // Tiempo total en ms
  "last_lap_time": "60000",    // Último tiempo de vuelta en ms
  "best_lap_time": "58500",    // Mejor tiempo en ms
  "best_lap_number": "8",
  "current_segment": "2",
  "last_sector_time": "18000",
  "penalty_time": "0",
  "corrected_time": "0",
  "position": "3",
  "gap_to_leader": "5.2",
  "gap_to_ahead": "1.8",
  "last_updated": "2025-09-09T10:15:30.000Z"
}
```

---

## ⚙️ **Configuración Inicial**

### **1. Configuración de Redis en NodeCG**

```javascript
// nodecg/bundles/your-bundle/extension/redis-client.js
const Redis = require('ioredis');

const redisConfig = {
  host: 'localhost',
  port: 6379,
  db: 0,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
};

const redis = new Redis(redisConfig);
const subscriber = new Redis(redisConfig); // Para subscripciones

module.exports = { redis, subscriber };
```

### **2. Configuración de Session Key**

```javascript
// Configurar la sesión activa
const SESSION_KEY = 'practice1'; // o 'qualifying1', 'race1', etc.

// Helper para generar claves oficiales
class OfficialKeyGenerator {
  constructor(sessionKey) {
    this.sessionKey = sessionKey;
  }
  
  driverCatalog(rid) {
    return `race:${this.sessionKey}:driver:${rid}:catalog`;
  }
  
  driverState(rid) {
    return `race:${this.sessionKey}:driver:${rid}:state`;
  }
  
  posStandings() {
    return `race:${this.sessionKey}:pos`;
  }
  
  passStream() {
    return `race:${this.sessionKey}:x:pass`;
  }
  
  sessionInfo() {
    return `race:${this.sessionKey}:run`;
  }
  
  eventInfo() {
    return `race:${this.sessionKey}:event`;
  }
  
  globalState() {
    return `race:${this.sessionKey}:global`;
  }
}

const keyGen = new OfficialKeyGenerator(SESSION_KEY);
```

---

## 🏁 **Extracción del Leaderboard**

### **Método 1: Leaderboard Completo por Posiciones**

```javascript
// extension/leaderboard-service.js
class LeaderboardService {
  constructor(redis, keyGenerator) {
    this.redis = redis;
    this.keyGen = keyGenerator;
  }

  async getFullLeaderboard() {
    try {
      // 1. Obtener posiciones ordenadas
      const positions = await this.redis.zrange(
        this.keyGen.posStandings(), 
        0, -1, 
        'WITHSCORES'
      );
      
      const leaderboard = [];
      
      // 2. Procesar en pares [rid, position]
      for (let i = 0; i < positions.length; i += 2) {
        const rid = positions[i];
        const position = parseInt(positions[i + 1]);
        
        // 3. Obtener datos del driver
        const [catalog, state] = await Promise.all([
          this.redis.hgetall(this.keyGen.driverCatalog(rid)),
          this.redis.hgetall(this.keyGen.driverState(rid))
        ]);
        
        // 4. Combinar datos
        const driverData = {
          position: position,
          rid: rid,
          registration: catalog.registration || 'N/A',
          number: catalog.number || 'N/A',
          name: catalog.full_name || `${catalog.first_name} ${catalog.last_name}`,
          team: catalog.team || '',
          class: catalog.class_id || '',
          
          // Datos de timing
          laps: parseInt(state.laps) || 0,
          totalTime: parseInt(state.total_time) || 0,
          lastLapTime: parseInt(state.last_lap_time) || 0,
          bestLapTime: parseInt(state.best_lap_time) || 0,
          bestLapNumber: parseInt(state.best_lap_number) || 0,
          
          // Gaps (se calcularán después)
          gapToLeader: 0,
          gapToAhead: 0,
          
          // Metadata
          lastUpdated: state.last_updated
        };
        
        leaderboard.push(driverData);
      }
      
      // 5. Ordenar por posición
      leaderboard.sort((a, b) => a.position - b.position);
      
      // 6. Calcular gaps
      this.calculateGaps(leaderboard);
      
      return leaderboard;
      
    } catch (error) {
      console.error('Error getting leaderboard:', error);
      return [];
    }
  }
}
```

### **Método 2: Leaderboard por Clase**

```javascript
async getLeaderboardByClass(classId) {
  const fullLeaderboard = await this.getFullLeaderboard();
  return fullLeaderboard.filter(driver => driver.class === classId);
}
```

---

## 📏 **Cálculo de Gaps**

### **Implementación de Gaps Automáticos**

```javascript
// extension/gap-calculator.js
class GapCalculator {
  
  /**
   * Calcula gaps en el leaderboard
   * @param {Array} leaderboard - Array de drivers ordenado por posición
   */
  calculateGaps(leaderboard) {
    if (leaderboard.length === 0) return;
    
    // El líder no tiene gap
    const leader = leaderboard[0];
    leader.gapToLeader = 0;
    leader.gapToAhead = 0;
    
    for (let i = 1; i < leaderboard.length; i++) {
      const currentDriver = leaderboard[i];
      const aheadDriver = leaderboard[i - 1];
      
      // Gap con el líder (en milisegundos)
      const gapToLeaderMs = currentDriver.totalTime - leader.totalTime;
      
      // Gap con el driver de adelante (en milisegundos)
      const gapToAheadMs = currentDriver.totalTime - aheadDriver.totalTime;
      
      // Convertir a formato legible
      currentDriver.gapToLeader = this.formatGap(gapToLeaderMs);
      currentDriver.gapToAhead = this.formatGap(gapToAheadMs);
      
      // También mantener valores en ms para cálculos
      currentDriver.gapToLeaderMs = gapToLeaderMs;
      currentDriver.gapToAheadMs = gapToAheadMs;
    }
  }
  
  /**
   * Convierte milisegundos a formato de gap legible
   * @param {number} milliseconds - Diferencia en milisegundos
   * @returns {string} - Gap formateado (ej: "+1.234" o "+1L" para vuelta completa)
   */
  formatGap(milliseconds) {
    if (milliseconds === 0) return "0.000";
    
    // Si es más de 60 segundos, probablemente es una vuelta de diferencia
    if (milliseconds > 60000) {
      const laps = Math.floor(milliseconds / 60000); // Asumiendo ~60s por vuelta
      return `+${laps}L`;
    }
    
    // Convertir a segundos con 3 decimales
    const seconds = (milliseconds / 1000).toFixed(3);
    return `+${seconds}`;
  }
  
  /**
   * Calcula gap por vueltas cuando no hay tiempo total
   * @param {Object} driver1 - Driver base
   * @param {Object} driver2 - Driver a comparar
   * @returns {string} - Gap en vueltas
   */
  calculateLapGap(driver1, driver2) {
    const lapDifference = driver1.laps - driver2.laps;
    
    if (lapDifference === 0) {
      // Misma vuelta, usar diferencia de tiempo si está disponible
      if (driver1.totalTime && driver2.totalTime) {
        return this.formatGap(Math.abs(driver1.totalTime - driver2.totalTime));
      }
      return "0.000";
    }
    
    return `${Math.abs(lapDifference)}L`;
  }
}
```

---

## ⏱️ **Comparación de Tiempos**

### **Comparador de Tiempos de Vuelta**

```javascript
// extension/lap-time-comparator.js
class LapTimeComparator {
  constructor(redis, keyGenerator) {
    this.redis = redis;
    this.keyGen = keyGenerator;
  }
  
  /**
   * Compara tiempos de vuelta entre dos drivers
   * @param {string} rid1 - RID del primer driver
   * @param {string} rid2 - RID del segundo driver
   * @returns {Object} - Comparación detallada
   */
  async compareDrivers(rid1, rid2) {
    try {
      // Obtener datos de ambos drivers
      const [driver1State, driver1Catalog, driver2State, driver2Catalog] = await Promise.all([
        this.redis.hgetall(this.keyGen.driverState(rid1)),
        this.redis.hgetall(this.keyGen.driverCatalog(rid1)),
        this.redis.hgetall(this.keyGen.driverState(rid2)),
        this.redis.hgetall(this.keyGen.driverCatalog(rid2))
      ]);
      
      const comparison = {
        driver1: {
          rid: rid1,
          name: driver1Catalog.full_name || 'Unknown',
          registration: driver1Catalog.registration,
          lastLapTime: parseInt(driver1State.last_lap_time) || 0,
          bestLapTime: parseInt(driver1State.best_lap_time) || 0,
          bestLapNumber: parseInt(driver1State.best_lap_number) || 0,
          totalLaps: parseInt(driver1State.laps) || 0,
          totalTime: parseInt(driver1State.total_time) || 0
        },
        driver2: {
          rid: rid2,
          name: driver2Catalog.full_name || 'Unknown',
          registration: driver2Catalog.registration,
          lastLapTime: parseInt(driver2State.last_lap_time) || 0,
          bestLapTime: parseInt(driver2State.best_lap_time) || 0,
          bestLapNumber: parseInt(driver2State.best_lap_number) || 0,
          totalLaps: parseInt(driver2State.laps) || 0,
          totalTime: parseInt(driver2State.total_time) || 0
        }
      };
      
      // Calcular diferencias
      comparison.lastLapDifference = this.calculateTimeDifference(
        comparison.driver1.lastLapTime, 
        comparison.driver2.lastLapTime
      );
      
      comparison.bestLapDifference = this.calculateTimeDifference(
        comparison.driver1.bestLapTime, 
        comparison.driver2.bestLapTime
      );
      
      comparison.totalTimeDifference = this.calculateTimeDifference(
        comparison.driver1.totalTime, 
        comparison.driver2.totalTime
      );
      
      // Determinar quién es más rápido
      comparison.fasterLastLap = comparison.driver1.lastLapTime < comparison.driver2.lastLapTime ? 'driver1' : 'driver2';
      comparison.fasterBestLap = comparison.driver1.bestLapTime < comparison.driver2.bestLapTime ? 'driver1' : 'driver2';
      
      return comparison;
      
    } catch (error) {
      console.error('Error comparing drivers:', error);
      return null;
    }
  }
  
  /**
   * Calcula diferencia de tiempo y la formatea
   * @param {number} time1 - Tiempo en ms
   * @param {number} time2 - Tiempo en ms
   * @returns {Object} - Diferencia formateada
   */
  calculateTimeDifference(time1, time2) {
    const diffMs = Math.abs(time1 - time2);
    const diffSeconds = (diffMs / 1000).toFixed(3);
    
    return {
      milliseconds: diffMs,
      seconds: parseFloat(diffSeconds),
      formatted: `${diffSeconds}s`,
      faster: time1 < time2 ? 'first' : 'second'
    };
  }
  
  /**
   * Obtiene el tiempo de una vuelta específica de un driver
   * @param {string} rid - RID del driver
   * @param {number} lapNumber - Número de vuelta (opcional, usa última si no se especifica)
   * @returns {Object} - Información del tiempo de vuelta
   */
  async getDriverLapTime(rid, lapNumber = null) {
    try {
      const state = await this.redis.hgetall(this.keyGen.driverState(rid));
      const catalog = await this.redis.hgetall(this.keyGen.driverCatalog(rid));
      
      // Si no se especifica vuelta, usar la última
      const targetLap = lapNumber || parseInt(state.laps) || 0;
      
      return {
        rid: rid,
        name: catalog.full_name || 'Unknown',
        registration: catalog.registration,
        lapNumber: targetLap,
        lastLapTime: parseInt(state.last_lap_time) || 0,
        bestLapTime: parseInt(state.best_lap_time) || 0,
        bestLapNumber: parseInt(state.best_lap_number) || 0,
        totalLaps: parseInt(state.laps) || 0,
        lastLapFormatted: this.formatTime(parseInt(state.last_lap_time) || 0),
        bestLapFormatted: this.formatTime(parseInt(state.best_lap_time) || 0)
      };
      
    } catch (error) {
      console.error('Error getting driver lap time:', error);
      return null;
    }
  }
  
  /**
   * Formatea tiempo en milisegundos a formato MM:SS.mmm
   * @param {number} milliseconds - Tiempo en ms
   * @returns {string} - Tiempo formateado
   */
  formatTime(milliseconds) {
    if (milliseconds === 0) return '00:00.000';
    
    const totalSeconds = Math.floor(milliseconds / 1000);
    const ms = milliseconds % 1000;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${ms.toString().padStart(3, '0')}`;
  }
}
```

---

## 🔄 **Streams en Tiempo Real**

### **Subscripción a Eventos de Timing**

```javascript
// extension/real-time-service.js
class RealTimeService {
  constructor(subscriber, keyGenerator, nodecg) {
    this.subscriber = subscriber;
    this.keyGen = keyGenerator;
    this.nodecg = nodecg;
    this.setupSubscriptions();
  }
  
  setupSubscriptions() {
    // Suscribirse a canales de notificaciones oficiales
    this.subscriber.subscribe([
      `${this.keyGen.sessionKey}:ch:pass`,    // Eventos de paso
      `${this.keyGen.sessionKey}:ch:pos`,     // Cambios de posición
      `${this.keyGen.sessionKey}:ch:best`,    // Mejores tiempos
      `${this.keyGen.sessionKey}:ch:flag`,    // Cambios de bandera
      `${this.keyGen.sessionKey}:ch:session`  // Info de sesión
    ]);
    
    this.subscriber.on('message', (channel, message) => {
      this.handleRealtimeMessage(channel, message);
    });
  }
  
  handleRealtimeMessage(channel, message) {
    try {
      const data = JSON.parse(message);
      const channelType = channel.split(':').pop(); // Obtener último segmento
      
      switch (channelType) {
        case 'pass':
          this.handlePassingEvent(data);
          break;
        case 'pos':
          this.handlePositionChange(data);
          break;
        case 'best':
          this.handleBestLap(data);
          break;
        case 'flag':
          this.handleFlagChange(data);
          break;
        case 'session':
          this.handleSessionUpdate(data);
          break;
      }
    } catch (error) {
      console.error('Error handling realtime message:', error);
    }
  }
  
  handlePassingEvent(data) {
    // Emitir evento a NodeCG
    this.nodecg.sendMessage('passing-event', {
      rid: data.rid,
      registration: data.registration,
      lapTime: data.lap_time,
      totalTime: data.total_time,
      timestamp: data.timestamp
    });
  }
  
  handlePositionChange(data) {
    this.nodecg.sendMessage('position-change', {
      rid: data.rid,
      registration: data.registration,
      newPosition: data.position,
      previousPosition: data.previous_position,
      timestamp: data.timestamp
    });
  }
  
  handleBestLap(data) {
    this.nodecg.sendMessage('best-lap', {
      rid: data.rid,
      registration: data.registration,
      bestLapTime: data.best_lap_time_ms,
      bestLapNumber: data.best_lap_number,
      timestamp: data.timestamp
    });
  }
}
```

### **Monitoreo de Streams**

```javascript
// extension/stream-monitor.js
class StreamMonitor {
  constructor(redis, keyGenerator) {
    this.redis = redis;
    this.keyGen = keyGenerator;
  }
  
  /**
   * Obtiene los últimos eventos del stream de passing
   * @param {number} count - Número de eventos a obtener
   * @returns {Array} - Array de eventos
   */
  async getLatestPassingEvents(count = 10) {
    try {
      const streamKey = this.keyGen.passStream();
      const events = await this.redis.xrevrange(streamKey, '+', '-', 'COUNT', count);
      
      return events.map(([id, fields]) => {
        const event = {};
        
        // Convertir array de campos a objeto
        for (let i = 0; i < fields.length; i += 2) {
          event[fields[i]] = fields[i + 1];
        }
        
        return {
          id: id,
          timestamp: new Date(event.timestamp),
          ...event
        };
      });
      
    } catch (error) {
      console.error('Error getting latest passing events:', error);
      return [];
    }
  }
  
  /**
   * Monitorea nuevos eventos en tiempo real
   * @param {Function} callback - Función a llamar con nuevos eventos
   */
  async monitorNewEvents(callback) {
    const streamKey = this.keyGen.passStream();
    let lastId = '$'; // Comenzar desde el final
    
    while (true) {
      try {
        const result = await this.redis.xread('BLOCK', 1000, 'STREAMS', streamKey, lastId);
        
        if (result && result.length > 0) {
          const [, events] = result[0];
          
          for (const [id, fields] of events) {
            const event = {};
            for (let i = 0; i < fields.length; i += 2) {
              event[fields[i]] = fields[i + 1];
            }
            
            callback({
              id: id,
              timestamp: new Date(event.timestamp),
              ...event
            });
            
            lastId = id;
          }
        }
      } catch (error) {
        console.error('Error monitoring stream:', error);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
  }
}
```

---

## 🔧 **Ejemplos Prácticos para NodeCG**

### **1. Extension Principal**

```javascript
// extension/index.js
const { redis, subscriber } = require('./redis-client');
const OfficialKeyGenerator = require('./official-key-generator');
const LeaderboardService = require('./leaderboard-service');
const GapCalculator = require('./gap-calculator');
const LapTimeComparator = require('./lap-time-comparator');
const RealTimeService = require('./real-time-service');

module.exports = function (nodecg) {
  const SESSION_KEY = 'practice1'; // Configurable
  const keyGen = new OfficialKeyGenerator(SESSION_KEY);
  
  // Servicios
  const leaderboardService = new LeaderboardService(redis, keyGen);
  const gapCalculator = new GapCalculator();
  const lapTimeComparator = new LapTimeComparator(redis, keyGen);
  const realTimeService = new RealTimeService(subscriber, keyGen, nodecg);
  
  // Replicantes
  const leaderboardReplicant = nodecg.Replicant('leaderboard', { defaultValue: [] });
  const sessionInfoReplicant = nodecg.Replicant('sessionInfo', { defaultValue: {} });
  
  // Actualizar leaderboard cada 2 segundos
  setInterval(async () => {
    try {
      const leaderboard = await leaderboardService.getFullLeaderboard();
      leaderboardReplicant.value = leaderboard;
    } catch (error) {
      console.error('Error updating leaderboard:', error);
    }
  }, 2000);
  
  // Mensajes desde el dashboard
  nodecg.listenFor('get-driver-comparison', async (data, ack) => {
    try {
      const comparison = await lapTimeComparator.compareDrivers(data.rid1, data.rid2);
      ack(null, comparison);
    } catch (error) {
      ack(error);
    }
  });
  
  nodecg.listenFor('get-driver-lap-time', async (data, ack) => {
    try {
      const lapTime = await lapTimeComparator.getDriverLapTime(data.rid, data.lapNumber);
      ack(null, lapTime);
    } catch (error) {
      ack(error);
    }
  });
  
  // Obtener información de sesión
  nodecg.listenFor('get-session-info', async (data, ack) => {
    try {
      const sessionInfo = await redis.hgetall(keyGen.sessionInfo());
      const eventInfo = await redis.hgetall(keyGen.eventInfo());
      const globalState = await redis.hgetall(keyGen.globalState());
      
      ack(null, {
        session: sessionInfo,
        event: eventInfo,
        global: globalState
      });
    } catch (error) {
      ack(error);
    }
  });
};
```

### **2. Dashboard para Comparar Drivers**

```html
<!-- dashboard/compare-drivers.html -->
<!DOCTYPE html>
<html>
<head>
    <title>Comparador de Drivers</title>
</head>
<body>
    <div>
        <h3>Comparar Drivers</h3>
        <input type="text" id="driver1" placeholder="RID Driver 1">
        <input type="text" id="driver2" placeholder="RID Driver 2">
        <button onclick="compareDrivers()">Comparar</button>
        
        <div id="results"></div>
    </div>

    <script>
        function compareDrivers() {
            const rid1 = document.getElementById('driver1').value;
            const rid2 = document.getElementById('driver2').value;
            
            nodecg.sendMessage('get-driver-comparison', { rid1, rid2 }, (error, comparison) => {
                if (error) {
                    console.error('Error:', error);
                    return;
                }
                
                displayComparison(comparison);
            });
        }
        
        function displayComparison(comparison) {
            const resultsDiv = document.getElementById('results');
            resultsDiv.innerHTML = `
                <h4>Comparación de Drivers</h4>
                <div>
                    <strong>${comparison.driver1.name}</strong> vs <strong>${comparison.driver2.name}</strong>
                </div>
                <div>
                    Última vuelta: ${formatTime(comparison.driver1.lastLapTime)} vs ${formatTime(comparison.driver2.lastLapTime)}
                    (Diferencia: ${comparison.lastLapDifference.formatted})
                </div>
                <div>
                    Mejor vuelta: ${formatTime(comparison.driver1.bestLapTime)} vs ${formatTime(comparison.driver2.bestLapTime)}
                    (Diferencia: ${comparison.bestLapDifference.formatted})
                </div>
            `;
        }
        
        function formatTime(ms) {
            const totalSeconds = Math.floor(ms / 1000);
            const milliseconds = ms % 1000;
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            
            return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
        }
    </script>
</body>
</html>
```

### **3. Graphic para Mostrar Leaderboard**

```html
<!-- graphics/leaderboard.html -->
<!DOCTYPE html>
<html>
<head>
    <title>Leaderboard</title>
    <style>
        .leaderboard {
            font-family: Arial, sans-serif;
            background: rgba(0,0,0,0.8);
            color: white;
            padding: 20px;
        }
        .driver-row {
            display: flex;
            justify-content: space-between;
            padding: 5px 0;
            border-bottom: 1px solid #333;
        }
        .position { width: 50px; }
        .name { width: 200px; }
        .gap { width: 100px; text-align: right; }
        .best-lap { width: 100px; text-align: right; }
    </style>
</head>
<body>
    <div class="leaderboard">
        <h2>Leaderboard</h2>
        <div id="leaderboard-content"></div>
    </div>

    <script>
        // Replicante del leaderboard
        const leaderboardRep = nodecg.Replicant('leaderboard');
        
        leaderboardRep.on('change', (newValue) => {
            updateLeaderboard(newValue);
        });
        
        function updateLeaderboard(leaderboard) {
            const content = document.getElementById('leaderboard-content');
            
            content.innerHTML = leaderboard.map(driver => `
                <div class="driver-row">
                    <div class="position">${driver.position}</div>
                    <div class="name">${driver.name}</div>
                    <div class="gap">${driver.gapToLeader}</div>
                    <div class="best-lap">${formatTime(driver.bestLapTime)}</div>
                </div>
            `).join('');
        }
        
        function formatTime(ms) {
            if (ms === 0) return '--:---.---';
            
            const totalSeconds = Math.floor(ms / 1000);
            const milliseconds = ms % 1000;
            const minutes = Math.floor(totalSeconds / 60);
            const seconds = totalSeconds % 60;
            
            return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
        }
    </script>
</body>
</html>
```

---

## 🎯 **Mejores Prácticas**

### **1. Gestión de Conexiones Redis**

```javascript
// Usar pool de conexiones
const redisPool = {
  read: new Redis(config), // Para lecturas
  write: new Redis(config), // Para escrituras (si necesario)
  subscribe: new Redis(config) // Para subscripciones
};

// Manejar reconexiones
redis.on('error', (err) => {
  console.error('Redis error:', err);
});

redis.on('connect', () => {
  console.log('Connected to Redis');
});
```

### **2. Caché y Optimización**

```javascript
// Cache local para evitar consultas repetitivas
class CachedLeaderboardService {
  constructor(redis, keyGenerator) {
    this.redis = redis;
    this.keyGen = keyGenerator;
    this.cache = new Map();
    this.cacheTimeout = 1000; // 1 segundo
  }
  
  async getDriverState(rid) {
    const cacheKey = `driver_state_${rid}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      return cached.data;
    }
    
    const state = await this.redis.hgetall(this.keyGen.driverState(rid));
    this.cache.set(cacheKey, {
      data: state,
      timestamp: Date.now()
    });
    
    return state;
  }
}
```

### **3. Manejo de Errores**

```javascript
// Wrapper para manejo robusto de errores
class SafeRedisClient {
  constructor(redis) {
    this.redis = redis;
  }
  
  async safeGet(key, defaultValue = null) {
    try {
      const result = await this.redis.hgetall(key);
      return Object.keys(result).length > 0 ? result : defaultValue;
    } catch (error) {
      console.error(`Error getting ${key}:`, error);
      return defaultValue;
    }
  }
  
  async safeZRange(key, start = 0, stop = -1) {
    try {
      return await this.redis.zrange(key, start, stop, 'WITHSCORES');
    } catch (error) {
      console.error(`Error getting range ${key}:`, error);
      return [];
    }
  }
}
```

### **4. Configuración de Session Keys**

```javascript
// Gestión dinámica de sesiones
class SessionManager {
  constructor() {
    this.currentSession = 'practice1';
    this.availableSessions = ['practice1', 'practice2', 'qualifying1', 'race1'];
  }
  
  setSession(sessionKey) {
    if (this.availableSessions.includes(sessionKey)) {
      this.currentSession = sessionKey;
      return true;
    }
    return false;
  }
  
  getKeyGenerator() {
    return new OfficialKeyGenerator(this.currentSession);
  }
}
```

---

## 📞 **Soporte y Contacto**

Para dudas sobre la implementación:

- **Estructura de datos**: Revisar `COPILOT_INSTRUCTIONS.md`
- **Atomizers**: Consultar archivos en `/src/atomizers/`
- **KeyGenerator**: Ver `/src/utils/KeyGenerator.js`

---

**© 2025 - MYLAPS Middleware v2.0 - Estructura Oficial Redis**
