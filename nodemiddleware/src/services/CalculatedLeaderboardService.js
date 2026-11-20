/**
 * CalculatedLeaderboardService.js
 * Servicio para calcular posiciones automáticamente basado en tiempos totales
 * Se activa cuando llegan mensajes $J (pasadas) y calcula posiciones dinámicamente
 * 
 * LÓGICA DE POSICIONAMIENTO:
 * 1. Ordena drivers por tiempo total acumulado (menor tiempo = mejor posición)
 * 2. En caso de empate en tiempo, usa el número de vueltas como criterio secundario
 * 3. Actualiza las posiciones en el NewLeaderboardService cuando hay cambios
 */

const LoggerUtils = require('../utils/LoggerUtils');

class CalculatedLeaderboardService {
  constructor(redisClient, newLeaderboardService, driverService, logger = console, sessionKey = 'default') {
    this.redis = redisClient;
    this.newLeaderboardService = newLeaderboardService;
    this.driverService = driverService;
    this.logger = logger;
    this.sessionKey = sessionKey;
    
    // Control de recálculo para evitar spam
    this.lastCalculation = 0;
    this.calculationDelay = 500; // 500ms entre recálculos
    this.pendingCalculation = false;
    
    this.logger.info('✅ CalculatedLeaderboardService initialized');
  }

  /**
   * Procesa una nueva vuelta y recalcula posiciones si es necesario
   * @param {Object} lapData - Datos de la vuelta completada
   */
  async processLapAndRecalculate(lapData) {
    try {
      const { driverid, total_ms, laps } = lapData;
      
      this.logger.debug(`🔄 Processing lap for position calculation: ${driverid} - ${total_ms}ms, ${laps} laps`);
      
      // Evitar recálculos muy frecuentes
      const now = Date.now();
      if (this.pendingCalculation || (now - this.lastCalculation) < this.calculationDelay) {
        this.logger.debug('⏳ Skipping calculation - too frequent');
        return;
      }

      this.pendingCalculation = true;
      
      // Esperar un poco para agrupar múltiples updates
      setTimeout(async () => {
        await this.recalculateAllPositions();
        this.pendingCalculation = false;
        this.lastCalculation = Date.now();
      }, 100);

    } catch (error) {
      this.logger.error('❌ Error processing lap for position calculation:', error);
      this.pendingCalculation = false;
    }
  }

  /**
   * Recalcula todas las posiciones basándose en los tiempos actuales
   */
  async recalculateAllPositions() {
    try {
      this.logger.debug('🧮 Recalculating all positions...');

      // 1. Obtener todos los drivers con datos de estado
      const allDrivers = await this.getAllDriverStates();
      
      if (allDrivers.length === 0) {
        this.logger.debug('📭 No drivers found for position calculation');
        return;
      }

      // 2. Filtrar drivers que tienen al menos una vuelta completada
      const activeDrivers = allDrivers.filter(driver => 
        driver.laps > 0 && driver.total_ms > 0
      );

      if (activeDrivers.length === 0) {
        this.logger.debug('📭 No active drivers found for position calculation');
        return;
      }

      // 3. Ordenar por criterios de posición
      const sortedDrivers = this.sortDriversByPosition(activeDrivers);
      
      // 4. Asignar nuevas posiciones y actualizar si hay cambios
      const positionChanges = await this.updatePositionsIfChanged(sortedDrivers);
      
      if (positionChanges > 0) {
        this.logger.info(`🏁 Positions recalculated: ${positionChanges} changes for ${activeDrivers.length} drivers`);
      }

    } catch (error) {
      this.logger.error('❌ Error recalculating positions:', error);
    }
  }

  /**
   * Obtiene estados de todos los drivers registrados
   */
  async getAllDriverStates() {
    try {
      // Buscar todas las claves de estado de drivers
      const pattern = `${this.sessionKey}:driver:*:state`;
      const stateKeys = await this.redis.keys(pattern);
      
      const drivers = [];
      
      for (const key of stateKeys) {
        const stateData = await this.redis.hgetall(key);
        
        if (stateData && Object.keys(stateData).length > 0) {
          // Extraer driverid de la clave
          const keyParts = key.split(':');
          const rid = keyParts[2]; // default:driver:[RID]:state
          
          const driver = {
            driverid: stateData.driverid || stateData.registration || `RID_${rid}`,
            rid: parseInt(rid),
            laps: parseInt(stateData.laps) || 0,
            total_ms: parseInt(stateData.total_ms) || 0,
            best_ms: parseInt(stateData.best_ms) || 0,
            currentPosition: parseInt(stateData.position) || 0,
            registration: stateData.registration || stateData.driverid,
            number: stateData.number || stateData.driverid,
            first_name: stateData.first_name || '',
            last_name: stateData.last_name || '',
            class_number: parseInt(stateData.class) || 0,
            transponder_id: parseInt(stateData.transponder_id) || 0
          };
          
          drivers.push(driver);
        }
      }
      
      return drivers;
      
    } catch (error) {
      this.logger.error('❌ Error getting all driver states:', error);
      return [];
    }
  }

  /**
   * Ordena drivers por criterios de posición
   * 1. Más vueltas completadas
   * 2. Si empate en vueltas, menor tiempo total
   * 3. Si empate en tiempo, por driverid (estabilidad)
   */
  sortDriversByPosition(drivers) {
    return drivers.sort((a, b) => {
      // Criterio 1: Más vueltas es mejor
      if (a.laps !== b.laps) {
        return b.laps - a.laps; // Descendente (más vueltas primero)
      }
      
      // Criterio 2: Si mismo número de vueltas, menor tiempo total es mejor
      if (a.total_ms !== b.total_ms) {
        return a.total_ms - b.total_ms; // Ascendente (menor tiempo primero)
      }
      
      // Criterio 3: Desempate por driverid para estabilidad
      return a.driverid.localeCompare(b.driverid);
    });
  }

  /**
   * Actualiza posiciones solo si hay cambios
   */
  async updatePositionsIfChanged(sortedDrivers) {
    let changes = 0;
    
    for (let i = 0; i < sortedDrivers.length; i++) {
      const driver = sortedDrivers[i];
      const newPosition = i + 1; // Posiciones empiezan en 1
      
      // Solo actualizar si la posición cambió
      if (driver.currentPosition !== newPosition) {
        this.logger.debug(`📍 Position change: ${driver.driverid} ${driver.currentPosition} → ${newPosition}`);
        
        // Actualizar a través del NewLeaderboardService
        const updateResult = await this.newLeaderboardService.updatePosition(
          driver.driverid,
          newPosition,
          {
            laps: driver.laps,
            total_ms: driver.total_ms,
            best_ms: driver.best_ms
          }
        );
        
        if (updateResult.success) {
          changes++;
        } else {
          this.logger.warn(`⚠️ Failed to update position for ${driver.driverid}:`, updateResult.error);
        }
      }
    }
    
    return changes;
  }

  /**
   * Fuerza un recálculo inmediato (para usar en casos especiales)
   */
  async forceRecalculation() {
    this.logger.info('🔄 Forcing immediate position recalculation...');
    this.lastCalculation = 0;
    this.pendingCalculation = false;
    await this.recalculateAllPositions();
  }

  /**
   * Obtiene el leaderboard calculado actual
   */
  async getCurrentCalculatedLeaderboard() {
    try {
      const allDrivers = await this.getAllDriverStates();
      const activeDrivers = allDrivers.filter(driver => driver.laps > 0 && driver.total_ms > 0);
      const sortedDrivers = this.sortDriversByPosition(activeDrivers);
      
      return sortedDrivers.map((driver, index) => ({
        position: index + 1,
        driverid: driver.driverid,
        name: `${driver.first_name} ${driver.last_name}`.trim() || `Driver ${driver.driverid}`,
        laps: driver.laps,
        total_ms: driver.total_ms,
        best_ms: driver.best_ms,
        gap_to_leader: index === 0 ? 0 : driver.total_ms - sortedDrivers[0].total_ms
      }));
      
    } catch (error) {
      this.logger.error('❌ Error getting calculated leaderboard:', error);
      return [];
    }
  }
}

module.exports = CalculatedLeaderboardService;
