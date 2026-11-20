/**
 * Per-Driver Passings ($J) in Redis - Implementation
 * 
 * This module handles efficient storage and retrieval of driver lap passings
 * using atomic Lua operations for idempotency and performance.
 */

const fs = require('fs');
const path = require('path');

class PassingsService {
  constructor(redisClient, logger = console) {
    this.redis = redisClient;
    this.logger = logger;
    this.jUpdateSha = null;
    this.luaScript = null;
    this.loadScript();
  }

  /**
   * Load the Lua script for atomic $J updates
   */
  async loadScript() {
    try {
      if (!this.luaScript) {
        const scriptPath = path.join(__dirname, '../../lua/j_update.lua');
        this.luaScript = fs.readFileSync(scriptPath, 'utf8');
      }
      
      if (!this.jUpdateSha) {
        this.jUpdateSha = await this.redis.script('LOAD', this.luaScript);
        this.logger.info('✅ Lua script loaded for $J passings');
      }
      
      return this.jUpdateSha;
    } catch (error) {
      this.logger.error('❌ Error loading Lua script:', error.message);
      throw error;
    }
  }

  /**
   * Get or create a RID (internal driver ID) for a registration number
   * @param {string} sessionKey - Session identifier
   * @param {string} reg - Driver registration/transponder number
   * @returns {Promise<number>} Internal driver ID
   */
  async getOrCreateRid(sessionKey, reg) {
    try {
      const mapKey = `${sessionKey}:rid`;
      const seqKey = `${sessionKey}:rid:seq`;

      const existing = await this.redis.hget(mapKey, reg);
      if (existing) {
        return Number(existing);
      }

      const rid = await this.redis.incr(seqKey);
      await this.redis.hset(mapKey, reg, String(rid));
      
      this.logger.info(`🆔 Created new RID ${rid} for registration ${reg}`);
      return rid;
    } catch (error) {
      this.logger.error(`❌ Error getting/creating RID for ${reg}:`, error.message);
      throw error;
    }
  }

  /**
   * Upsert a $J passing for a driver using atomic Lua operation
   * @param {string} sessionKey - Session identifier
   * @param {number} rid - Internal driver ID
   * @param {number} lapMs - Lap time in milliseconds
   * @param {number} totalMs - Cumulative race time in milliseconds
   * @param {number} nowMs - Current timestamp in milliseconds
   * @returns {Promise<string>} Result: lap number or 'SKIP'
   */
  async upsertPassing(sessionKey, rid, lapMs, totalMs, nowMs = Date.now()) {
    try {
      const sha = await this.loadScript();
      const base = `${sessionKey}:driver:${rid}`;
      
      const keys = [
        `${base}:state`,             // KEYS[1]
        `${base}:laps`,              // KEYS[2]
        `${base}:total_ms`,          // KEYS[3]
        `${base}:pass_recent`,       // KEYS[4]
        `${sessionKey}:x:pass`,      // KEYS[5]
        `${sessionKey}:ch:pass`      // KEYS[6]
      ];
      
      const argv = [String(rid), String(lapMs), String(totalMs), String(nowMs)];
      
      const result = await this.redis.evalsha(sha, keys.length, ...keys, ...argv);
      
      if (result === 'SKIP') {
        this.logger.info(`⏭️ Passing skipped for RID ${rid} (duplicate/out-of-order): ${totalMs}ms`);
      } else {
        this.logger.info(`✅ Passing recorded for RID ${rid}: Lap ${result}, ${lapMs}ms, Total ${totalMs}ms`);
      }
      
      return result;
    } catch (error) {
      if (String(error.message || error).includes('NOSCRIPT')) {
        // Script was evicted, reload and retry
        this.jUpdateSha = null;
        const sha = await this.loadScript();
        const base = `${sessionKey}:driver:${rid}`;
        
        const keys = [
          `${base}:state`,
          `${base}:laps`,
          `${base}:total_ms`,
          `${base}:pass_recent`,
          `${sessionKey}:x:pass`,
          `${sessionKey}:ch:pass`
        ];
        const argv = [String(rid), String(lapMs), String(totalMs), String(nowMs)];
        return await this.redis.evalsha(sha, keys.length, ...keys, ...argv);
      }
      
      this.logger.error(`❌ Error upserting passing for RID ${rid}:`, error.message);
      throw error;
    }
  }

  /**
   * Handle a parsed $J message
   * @param {Object} evt - Parsed $J event
   * @param {string} evt.sessionKey - Session identifier
   * @param {string} evt.reg - Driver registration/transponder
   * @param {number} evt.lapMs - Lap time in milliseconds
   * @param {number} evt.totalMs - Cumulative time in milliseconds
   */
  async handleJ(evt) {
    try {
      const { sessionKey, reg, lapMs, totalMs } = evt;
      const rid = await this.getOrCreateRid(sessionKey, reg);
      const result = await this.upsertPassing(sessionKey, rid, lapMs, totalMs);
      
      return {
        success: true,
        rid,
        result,
        skipped: result === 'SKIP'
      };
    } catch (error) {
      this.logger.error('❌ Error handling $J message:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get last N passings for a driver
   * @param {string} sessionKey - Session identifier
   * @param {number} rid - Internal driver ID
   * @param {number} count - Number of recent passings to retrieve (default: 10)
   * @returns {Promise<Array>} Array of recent passings
   */
  async getRecentPassings(sessionKey, rid, count = 10) {
    try {
      const recentKey = `${sessionKey}:driver:${rid}:pass_recent`;
      const rawPassings = await this.redis.lrange(recentKey, 0, count - 1);
      
      return rawPassings.map(passing => {
        const [lap, lapMs, totalMs] = passing.split(',').map(Number);
        return { lap, lapMs, totalMs };
      });
    } catch (error) {
      this.logger.error(`❌ Error getting recent passings for RID ${rid}:`, error.message);
      return [];
    }
  }

  /**
   * Get complete lap history for a driver
   * @param {string} sessionKey - Session identifier
   * @param {number} rid - Internal driver ID
   * @returns {Promise<Array>} Array of all laps with times
   */
  async getLapHistory(sessionKey, rid) {
    try {
      const lapsKey = `${sessionKey}:driver:${rid}:laps`;
      const totalKey = `${sessionKey}:driver:${rid}:total_ms`;
      
      const [rawLaps, rawTotals] = await Promise.all([
        this.redis.hgetall(lapsKey),
        this.redis.hgetall(totalKey)
      ]);
      
      const laps = Object.keys(rawLaps)
        .map(lap => {
          const lapMs = Number(rawLaps[lap]);
          const totalMs = Number(rawTotals[lap]);
          return { lap: Number(lap), lapMs, totalMs };
        })
        .sort((a, b) => a.lap - b.lap);
      
      return laps;
    } catch (error) {
      this.logger.error(`❌ Error getting lap history for RID ${rid}:`, error.message);
      return [];
    }
  }  /**
   * Get driver state (laps completed, last total time, etc.)
   * @param {string} sessionKey - Session identifier
   * @param {number} rid - Internal driver ID
   * @returns {Promise<Object>} Driver state object
   */
  async getDriverState(sessionKey, rid) {
    try {
      const stateKey = `${sessionKey}:driver:${rid}:state`;
      const state = await this.redis.hgetall(stateKey);
      
      return {
        laps: Number(state.laps || 0),
        lastTotalMs: Number(state.last_total_ms || 0),
        updatedAtMs: Number(state.updated_at_ms || 0)
      };
    } catch (error) {
      this.logger.error(`❌ Error getting driver state for RID ${rid}:`, error.message);
      return { laps: 0, lastTotalMs: 0, updatedAtMs: 0 };
    }
  }

  /**
   * Get global timeline of recent passings (audit trail)
   * @param {string} sessionKey - Session identifier
   * @param {number} count - Number of recent events to retrieve (default: 50)
   * @returns {Promise<Array>} Array of timeline events
   */
  async getGlobalTimeline(sessionKey, count = 50) {
    try {
      const streamKey = `${sessionKey}:x:pass`;
      const events = await this.redis.xrevrange(streamKey, '+', '-', 'COUNT', count);
      
      return events.map(([id, fields]) => {
        const data = {};
        for (let i = 0; i < fields.length; i += 2) {
          data[fields[i]] = fields[i + 1];
        }
        return {
          id,
          rid: Number(data.rid),
          lap: Number(data.lap),
          lapMs: Number(data.lap_ms),
          totalMs: Number(data.total_ms),
          tsMs: Number(data.ts_ms)
        };
      });
    } catch (error) {
      this.logger.error(`❌ Error getting global timeline:`, error.message);
      return [];
    }
  }

  /**
   * Get RID mapping for a session
   * @param {string} sessionKey - Session identifier
   * @returns {Promise<Object>} Mapping of registration -> RID
   */
  async getRidMapping(sessionKey) {
    try {
      const mapKey = `${sessionKey}:rid`;
      const mapping = await this.redis.hgetall(mapKey);
      
      // Convert values to numbers
      const result = {};
      Object.entries(mapping).forEach(([reg, rid]) => {
        result[reg] = Number(rid);
      });
      
      return result;
    } catch (error) {
      this.logger.error(`❌ Error getting RID mapping:`, error.message);
      return {};
    }
  }

  /**
   * Subscribe to passing events for real-time updates
   * @param {string} sessionKey - Session identifier
   * @param {Function} callback - Callback function for new passings
   */
  subscribeToPassings(sessionKey, callback) {
    const subscriber = this.redis.duplicate();
    const channel = `${sessionKey}:ch:pass`;
    
    subscriber.subscribe(channel);
    subscriber.on('message', (receivedChannel, message) => {
      if (receivedChannel === channel) {
        try {
          const data = JSON.parse(message);
          callback(data);
        } catch (error) {
          this.logger.error('❌ Error parsing passing message:', error.message);
        }
      }
    });
    
    this.logger.info(`🔔 Subscribed to passing events: ${channel}`);
    return subscriber;
  }
}

module.exports = PassingsService;
