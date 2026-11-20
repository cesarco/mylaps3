const mysql = require('mysql2/promise');
const config = require('../config');

class MySQLService {
  constructor() {
    this.connection = null;
    this.isConnected = false;
  }

  async connect() {
    console.log('🔍 [DEBUG] MySQL config:', { enabled: config.mysql.enabled, type: typeof config.mysql.enabled });
    
    if (!config.mysql.enabled) {
      console.log('ℹ️  MySQL disabled by configuration (MYSQL_ENABLED=false)');
      this.isConnected = false;
      return false;
    }

    try {
      // Crear configuración sin el campo 'enabled' para mysql2
      const mysqlConfig = {
        host: config.mysql.host,
        user: config.mysql.user,
        password: config.mysql.password,
        database: config.mysql.database,
        connectionLimit: config.mysql.connectionLimit
      };
      
      this.connection = await mysql.createConnection(mysqlConfig);
      this.isConnected = true;
      console.log('✅ Connected to MySQL for historical data');
      return true;
    } catch (error) {
      console.log('⚠️  MySQL connection failed, running in Redis-only mode:', error.message);
      console.log('ℹ️  Historical data will not be saved to MySQL');
      this.isConnected = false;
      return false;
    }
  }

  async disconnect() {
    if (this.connection && this.isConnected) {
      await this.connection.end();
      this.isConnected = false;
      console.log('✅ MySQL connection closed');
    }
  }

  async ensureDriverExists(driverId) {
    if (!this.enabled) return true;
    
    try {
      // Verificar si el piloto existe
      const [existing] = await this.pool.execute(
        'SELECT driver_id FROM drivers WHERE driver_id = ?',
        [driverId]
      );

      if (existing.length === 0) {
        // Crear piloto con datos básicos
        await this.pool.execute(
          `INSERT INTO drivers (driver_id, driver_name, created_at, updated_at) 
           VALUES (?, ?, NOW(), NOW())`,
          [driverId, `Driver ${driverId}`]
        );
        this.logger.info(`✨ Created new driver: ${driverId}`);
      }

      return true;
    } catch (error) {
      this.logger.error(`Error ensuring driver exists for ${driverId}:`, error);
      return false;
    }
  }

  async updateDriverInfo(driverId, info) {
    if (!this.enabled) return true;
    
    try {
      // Asegurar que el piloto existe
      await this.ensureDriverExists(driverId);
      
      // Preparar campos para actualizar
      const updateFields = [];
      const values = [];
      
      if (info.transponder_id) {
        updateFields.push('transponder_id = ?');
        values.push(info.transponder_id);
      }
      
      if (info.driver_name) {
        updateFields.push('driver_name = ?');
        values.push(info.driver_name);
      }
      
      if (info.first_name) {
        updateFields.push('first_name = ?');
        values.push(info.first_name);
      }
      
      if (info.last_name) {
        updateFields.push('last_name = ?');
        values.push(info.last_name);
      }
      
      if (info.driver_class !== undefined) {
        updateFields.push('driver_class = ?');
        values.push(info.driver_class);
      }
      
      if (info.nationality) {
        updateFields.push('nationality = ?');
        values.push(info.nationality);
      }
      
      if (info.additional) {
        updateFields.push('additional = ?');
        values.push(info.additional);
      }

      if (updateFields.length > 0) {
        updateFields.push('updated_at = NOW()');
        values.push(driverId);

        const query = `UPDATE drivers SET ${updateFields.join(', ')} WHERE driver_id = ?`;
        await this.pool.execute(query, values);
        
        this.logger.debug(`👤 Updated driver info ${driverId} in MySQL`);
      }

      return true;
    } catch (error) {
      this.logger.error(`Error updating driver info for ${driverId}:`, error);
      return false;
    }
  }

  async savePositionData(data) {
    if (!this.isConnected) return false;

    try {
      const query = `
        INSERT INTO position_data (
          driver_id, driver_name, transponder_id, passing_number,
          timestamp, race_time, current_position, total_laps, 
          current_lap_time, best_lap_time, last_lap_time
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          driver_name = VALUES(driver_name),
          timestamp = VALUES(timestamp),
          race_time = VALUES(race_time),
          current_position = VALUES(current_position),
          total_laps = VALUES(total_laps),
          current_lap_time = VALUES(current_lap_time),
          best_lap_time = VALUES(best_lap_time),
          last_lap_time = VALUES(last_lap_time)
      `;

      await this.connection.execute(query, [
        data.driver_id || null,
        data.driver_name || null,
        data.transponder_id || null,
        data.passing_number || null,
        data.timestamp || new Date().toISOString(),
        data.race_time || null,
        data.current_position || null,
        data.total_laps || null,
        data.current_lap_time || null,
        data.best_lap_time || null,
        data.last_lap_time || null
      ]);

      return true;
    } catch (error) {
      console.error('❌ Failed to save position data to MySQL:', error.message);
      return false;
    }
  }

  async saveLapData(data) {
    if (!this.isConnected) return false;

    try {
      const query = `
        INSERT INTO lap_data (
          driver_id, driver_name, transponder_id, lap_number,
          lap_time, timestamp, race_time, sector_times, 
          lap_status, session_type
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `;

      await this.connection.execute(query, [
        data.driver_id || null,
        data.driver_name || null,
        data.transponder_id || null,
        data.lap_number || null,
        data.lap_time || null,
        data.timestamp || new Date().toISOString(),
        data.race_time || null,
        JSON.stringify(data.sector_times || []),
        data.lap_status || null,
        data.session_type || null
      ]);

      return true;
    } catch (error) {
      console.error('❌ Failed to save lap data to MySQL:', error.message);
      return false;
    }
  }

  async saveSessionInfo(data) {
    if (!this.isConnected) return false;

    try {
      const query = `
        INSERT INTO session_info (
          session_id, session_name, session_type, start_time,
          duration, track_name, event_name, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          session_name = VALUES(session_name),
          session_type = VALUES(session_type),
          start_time = VALUES(start_time),
          duration = VALUES(duration),
          track_name = VALUES(track_name),
          event_name = VALUES(event_name),
          status = VALUES(status)
      `;

      await this.connection.execute(query, [
        data.session_id,
        data.session_name,
        data.session_type,
        data.start_time,
        data.duration,
        data.track_name,
        data.event_name,
        data.status
      ]);

      return true;
    } catch (error) {
      console.error('❌ Failed to save session info to MySQL:', error.message);
      return false;
    }
  }

  getConnection() {
    return this.connection;
  }
}

module.exports = MySQLService;
