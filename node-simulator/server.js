// @ts-nocheck
const express = require('express');
const Redis = require('ioredis');
const http = require('http');
const socketIO = require('socket.io');
const fs = require('fs').promises;
const path = require('path');
const cors = require('cors');
require('dotenv').config();

class MyLapsSimulator {
  constructor() {
    this.app = express();
    this.server = http.createServer(this.app);
    this.io = socketIO(this.server, {
      cors: {
        origin: "*",
        methods: ["GET", "POST"]
      }
    });
    
    const redisConfig = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      db: parseInt(process.env.REDIS_DB) || 0,
      lazyConnect: true,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3
    };
    
    // Solo agregar password si está definida
    if (process.env.REDIS_PASSWORD) {
      redisConfig.password = process.env.REDIS_PASSWORD;
    }
    
    this.redis = new Redis(redisConfig);
    
    this.config = {
      redisStream: process.env.REDIS_STREAM || 'mylaps:stream',
      redisGroup: process.env.REDIS_GROUP || 'mylaps-middleware-group',
      webPort: process.env.WEB_PORT || 3001,
      simulatorSpeed: parseInt(process.env.SIMULATOR_SPEED) || 100,
      dataFolder: process.env.DATA_FOLDER || '../data'
    };
    
    this.simulatorState = {
      isRunning: false,
      currentFile: null,
      currentIndex: 0,
      totalLines: 0,
      sentCount: 0,
      intervalId: null,
      lines: [],
      startTime: null,
      loopCount: 0,
      // Nuevas configuraciones con toggles
      loopEnabled: true,     // Toggle para habilitar/deshabilitar loop
      cleanRedisOnStart: true // Toggle para limpiar Redis al iniciar
    };
    
    this.setupMiddleware();
    this.setupRoutes();
    this.setupWebSockets();
  }
  
  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, 'public')));
  }
  
  setupRoutes() {
    // Get available data files
    this.app.get('/api/files', async (req, res) => {
      try {
        const dataPath = path.resolve(__dirname, this.config.dataFolder);
        const files = await fs.readdir(dataPath);
        const txtFiles = files.filter(file => file.endsWith('.txt'));
        
        const filesWithInfo = await Promise.all(
          txtFiles.map(async (file) => {
            try {
              const filePath = path.join(dataPath, file);
              const content = await fs.readFile(filePath, 'utf-8');
              const lines = content.split('\n').filter(line => line.trim() && !line.startsWith('#'));
              return {
                name: file,
                path: filePath,
                lines: lines.length,
                size: (await fs.stat(filePath)).size
              };
            } catch (error) {
              return {
                name: file,
                path: path.join(dataPath, file),
                lines: 0,
                size: 0,
                error: error.message
              };
            }
          })
        );
        
        res.json(filesWithInfo);
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Get simulator status
    this.app.get('/api/status', (req, res) => {
      res.json({
        ...this.simulatorState,
        redisConnected: this.redis.status === 'ready',
        config: this.config
      });
    });
    
    // Start simulator
    this.app.post('/api/start', async (req, res) => {
      try {
        const { filename, speed, loopEnabled, cleanRedisOnStart } = req.body;
        
        if (this.simulatorState.isRunning) {
          return res.status(400).json({ error: 'Simulator is already running' });
        }
        
        if (speed) {
          this.config.simulatorSpeed = parseInt(speed);
        }
        
        // Actualizar configuraciones desde el request
        if (typeof loopEnabled !== 'undefined') {
          this.simulatorState.loopEnabled = loopEnabled;
        }
        if (typeof cleanRedisOnStart !== 'undefined') {
          this.simulatorState.cleanRedisOnStart = cleanRedisOnStart;
        }
        
        await this.startSimulator(filename);
        res.json({ message: 'Simulator started', status: this.simulatorState });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Stop simulator
    this.app.post('/api/stop', (req, res) => {
      try {
        this.stopSimulator();
        res.json({ message: 'Simulator stopped', status: this.simulatorState });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Reset Redis
    this.app.post('/api/reset-redis', async (req, res) => {
      try {
        await this.resetRedis();
        res.json({ message: 'Redis reset completed' });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Update simulator settings
    this.app.post('/api/settings', (req, res) => {
      try {
        const { loopEnabled, cleanRedisOnStart, speed } = req.body;
        
        if (typeof loopEnabled !== 'undefined') {
          this.simulatorState.loopEnabled = loopEnabled;
        }
        if (typeof cleanRedisOnStart !== 'undefined') {
          this.simulatorState.cleanRedisOnStart = cleanRedisOnStart;
        }
        if (speed) {
          this.config.simulatorSpeed = parseInt(speed);
        }
        
        this.broadcastStatus();
        res.json({ 
          message: 'Settings updated', 
          settings: {
            loopEnabled: this.simulatorState.loopEnabled,
            cleanRedisOnStart: this.simulatorState.cleanRedisOnStart,
            speed: this.config.simulatorSpeed
          }
        });
      } catch (error) {
        res.status(500).json({ error: error.message });
      }
    });
  }
  
  setupWebSockets() {
    this.io.on('connection', (socket) => {
      console.log('Client connected');
      
      // Send current status
      socket.emit('status', this.simulatorState);
      
      socket.on('disconnect', () => {
        console.log('Client disconnected');
      });
    });
  }
  
  async startSimulator(filename) {
    try {
      // Connect to Redis if not connected
      if (this.redis.status !== 'ready') {
        await this.redis.connect();
      }
      
      // Limpiar Redis solo si está habilitado el toggle
      if (this.simulatorState.cleanRedisOnStart) {
        console.log('🧹 Cleaning Redis before starting simulator...');
        await this.resetRedis();
        console.log('✅ Redis cleaned successfully');
      } else {
        console.log('⏭️ Skipping Redis cleanup (disabled in settings)');
      }
      
      // Load data file
      const filePath = path.resolve(__dirname, this.config.dataFolder, filename);
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n')
        .map(line => line.trim())
        .filter(line => line && !line.startsWith('#'));
      
      if (lines.length === 0) {
        throw new Error('No valid lines found in the file');
      }
      
      // Reset state (preservando configuraciones de toggles)
      const loopEnabled = this.simulatorState.loopEnabled;
      const cleanRedisOnStart = this.simulatorState.cleanRedisOnStart;
      
      this.simulatorState = {
        isRunning: true,
        currentFile: filename,
        currentIndex: 0,
        totalLines: lines.length,
        sentCount: 0,
        intervalId: null,
        lines: lines,
        startTime: Date.now(),
        loopCount: 0,
        loopEnabled: loopEnabled,
        cleanRedisOnStart: cleanRedisOnStart,
        // Reiniciar estadísticas de timing
        lastSendTime: null,
        lastScheduleTime: null,
        delayStats: {
          count: 0,
          totalDelay: 0,
          minDelay: Number.MAX_VALUE,
          maxDelay: 0
        }
      };
      
      console.log(`🚀 Starting simulator with ${lines.length} lines from ${filename}`);
      if (this.simulatorState.loopEnabled) {
        console.log('🔄 Loop mode enabled - will restart from line 0 when finished');
      } else {
        console.log('🔚 Single run mode - will stop when file is completed');
      }
      this.broadcastStatus();
      
      // Start simulation loop
      this.scheduleNextMessage();
      
    } catch (error) {
      console.error('Error starting simulator:', error);
      throw error;
    }
  }
  
  stopSimulator() {
    if (this.simulatorState.intervalId) {
      clearTimeout(this.simulatorState.intervalId);
    }
    
    const finalLoopCount = this.simulatorState.loopCount;
    const finalSentCount = this.simulatorState.sentCount;
    
    // Mostrar estadísticas de los delays si hay datos disponibles
    if (this.simulatorState.delayStats && this.simulatorState.delayStats.count > 0) {
      const stats = this.simulatorState.delayStats;
      const avgDelay = stats.totalDelay / stats.count;
      
      console.log('📊 Mensaje timing statistics:');
      console.log(`   Messages sent: ${stats.count}`);
      console.log(`   Average delay: ${avgDelay.toFixed(2)}ms (Configured: ${this.config.simulatorSpeed}ms)`);
      console.log(`   Min delay: ${stats.minDelay}ms`);
      console.log(`   Max delay: ${stats.maxDelay}ms`);
      console.log(`   Delay variance: ${stats.maxDelay - stats.minDelay}ms`);
      
      // Detección de envío en batch
      const suspectedBatch = stats.minDelay < (this.config.simulatorSpeed * 0.5) || 
                            stats.maxDelay > (this.config.simulatorSpeed * 1.5);
      
      if (suspectedBatch) {
        console.log('⚠️ WARNING: Significant delay variations detected. Messages may be sent in batches or system load affecting timing.');
      } else {
        console.log('✅ Timing looks normal. Messages were likely sent individually with consistent delays.');
      }
    }
    
    this.simulatorState.isRunning = false;
    this.simulatorState.intervalId = null;
    
    console.log(`🛑 Simulator stopped after ${finalLoopCount} complete loops and ${finalSentCount} total messages sent`);
    this.broadcastStatus();
  }
  
  scheduleNextMessage() {
    // Registrar el tiempo actual para análisis de timing
    const scheduleTime = Date.now();
    
    if (!this.simulatorState.isRunning) {
      console.log('❌ Simulation stopped by user');
      this.broadcastStatus();
      return;
    }
    
    // Si hemos llegado al final del archivo
    if (this.simulatorState.currentIndex >= this.simulatorState.totalLines) {
      if (this.simulatorState.loopEnabled) {
        // Reiniciar desde el principio si loop está habilitado
        this.simulatorState.currentIndex = 0;
        this.simulatorState.loopCount++;
        console.log(`🔄 Loop ${this.simulatorState.loopCount} completed. Restarting from line 0...`);
        this.broadcastStatus();
      } else {
        // Detener la simulación si loop está deshabilitado
        console.log(`🔚 Simulation completed after processing ${this.simulatorState.totalLines} lines`);
        this.stopSimulator();
        return;
      }
    }
    
    const currentLine = this.simulatorState.lines[this.simulatorState.currentIndex];
    const lineIndex = this.simulatorState.currentIndex;
    
    // Registrar información de debug para cada 20 mensajes o el primero de cada loop
    const isDebugMessage = lineIndex === 0 || lineIndex % 20 === 0;
    if (isDebugMessage) {
      console.log(`📊 Sending message #${lineIndex} at ${new Date().toISOString()} (loop ${this.simulatorState.loopCount})`);
      
      // Verificar si el último envío fue demasiado rápido (posible indicador de procesamiento en batch)
      if (this.simulatorState.lastScheduleTime) {
        const timeSinceLastSchedule = scheduleTime - this.simulatorState.lastScheduleTime;
        if (timeSinceLastSchedule < this.config.simulatorSpeed * 0.9) {
          console.log(`⚠️ Messages being scheduled too fast: Only ${timeSinceLastSchedule}ms since last schedule (should be ~${this.config.simulatorSpeed}ms)`);
        }
      }
    }
    
    // Registrar el tiempo de programación
    this.simulatorState.lastScheduleTime = scheduleTime;
    
    // Enviar mensaje a Redis y registrar el tiempo que toma
    const sendStartTime = Date.now();
    this.sendToRedis(currentLine)
      .then((result) => {
        const sendDuration = Date.now() - sendStartTime;
        
        // Registrar si el envío toma demasiado tiempo (posible indicador de sobrecarga o problemas de red)
        if (sendDuration > 50) { // más de 50ms para enviar es sospechoso
          console.log(`⚠️ Message sending took ${sendDuration}ms (unusually long)`);
        }
        
        if (isDebugMessage) {
          console.log(`✅ Message #${lineIndex} sent successfully with Redis ID: ${result}`);
        }
        
        this.simulatorState.sentCount++;
        this.simulatorState.currentIndex++;
        
        // Broadcast progress every 10 messages or when completing a loop
        if (this.simulatorState.sentCount % 10 === 0 || 
            this.simulatorState.currentIndex >= this.simulatorState.totalLines) {
          this.broadcastStatus();
        }
        
        // Schedule next message (continuar hasta que se detenga o termine el archivo)
        if (this.simulatorState.isRunning) {
          // Calcular el tiempo que ha pasado desde que se programó este mensaje
          const elapsedSinceSchedule = Date.now() - scheduleTime;
          
          // Calcular cuánto tiempo deberíamos esperar para el próximo mensaje
          // Si el procesamiento tomó tiempo, reducimos el delay para compensar
          let nextDelay = Math.max(1, this.config.simulatorSpeed - elapsedSinceSchedule);
          
          // Si el delay resultante es significativamente menor que el configurado, registrarlo
          if (nextDelay < this.config.simulatorSpeed * 0.5 && isDebugMessage) {
            console.log(`ℹ️ Next message scheduled with adjusted delay: ${nextDelay}ms (original: ${this.config.simulatorSpeed}ms)`);
          }
          
          // Programar el próximo mensaje con el delay ajustado
          this.simulatorState.intervalId = setTimeout(
            () => this.scheduleNextMessage(), 
            nextDelay
          );
        }
      })
      .catch((error) => {
        console.error('❌ Error sending message to Redis:', error);
        this.stopSimulator();
      });
  }
  
  async sendToRedis(rawLine) {
    const sendTime = new Date();
    const message = {
      raw_data: rawLine,
      timestamp: sendTime.toISOString(),
      simulator: true,
      send_time_ms: sendTime.getTime() // Añadimos timestamp en ms para tracking preciso
    };
    
    // Convert message to Redis fields format
    const fields = [];
    Object.entries(message).forEach(([key, value]) => {
      fields.push(key, String(value));
    });
    
    // Registramos cada envío para debugging
    if (this.simulatorState.lastSendTime) {
      const actualDelay = sendTime.getTime() - this.simulatorState.lastSendTime;
      const configuredDelay = this.config.simulatorSpeed;
      
      // Registramos si hay una diferencia significativa (más de 5ms) entre el delay configurado y el real
      if (Math.abs(actualDelay - configuredDelay) > 5) {
        console.log(`⚠️ Delay anomaly: Configured=${configuredDelay}ms, Actual=${actualDelay}ms, Diff=${actualDelay - configuredDelay}ms`);
      }
      
      // Almacenar esta información para análisis
      this.simulatorState.delayStats = this.simulatorState.delayStats || {
        count: 0,
        totalDelay: 0,
        minDelay: Number.MAX_VALUE,
        maxDelay: 0
      };
      
      this.simulatorState.delayStats.count++;
      this.simulatorState.delayStats.totalDelay += actualDelay;
      this.simulatorState.delayStats.minDelay = Math.min(this.simulatorState.delayStats.minDelay, actualDelay);
      this.simulatorState.delayStats.maxDelay = Math.max(this.simulatorState.delayStats.maxDelay, actualDelay);
    }
    
    // Actualizar el tiempo del último envío
    this.simulatorState.lastSendTime = sendTime.getTime();
    
    // Enviar a Redis como un único mensaje (no en batch)
    return await this.redis.xadd(this.config.redisStream, '*', ...fields);
  }
  
  async resetRedis() {
    try {
      if (this.redis.status !== 'ready') {
        await this.redis.connect();
      }
      
      console.log('Resetting Redis data...');
      
      // Get all keys with our session pattern
      const keys = await this.redis.keys('*');
      
      if (keys.length > 0) {
        // Delete keys in batches to avoid blocking
        const batchSize = 100;
        for (let i = 0; i < keys.length; i += batchSize) {
          const batch = keys.slice(i, i + batchSize);
          await this.redis.del(...batch);
        }
        console.log(`Deleted ${keys.length} keys from Redis`);
      } else {
        console.log('No keys found to delete');
      }
      
      // Recreate the stream
      try {
        await this.redis.xadd(this.config.redisStream, '*', 'init', 'true');
        console.log('Stream recreated');
      } catch (error) {
        console.log('Stream recreation failed (might already exist):', error.message);
      }
      
      this.broadcastStatus();
      
    } catch (error) {
      console.error('Error resetting Redis:', error);
      throw error;
    }
  }
  
  broadcastStatus() {
    // Preparar estadísticas para enviar al cliente
    let timingStats = null;
    
    if (this.simulatorState.delayStats && this.simulatorState.delayStats.count > 0) {
      const stats = this.simulatorState.delayStats;
      timingStats = {
        count: stats.count,
        avgDelay: stats.totalDelay / stats.count,
        minDelay: stats.minDelay,
        maxDelay: stats.maxDelay,
        variance: stats.maxDelay - stats.minDelay,
        configuredDelay: this.config.simulatorSpeed
      };
    }
    
    this.io.emit('status', {
      ...this.simulatorState,
      redisConnected: this.redis.status === 'ready',
      config: this.config,
      timingStats: timingStats
    });
  }
  
  async start() {
    try {
      // Test Redis connection
      await this.redis.connect();
      console.log('✅ Connected to Redis');
      
      this.server.listen(this.config.webPort, () => {
        console.log(`🎮 MyLaps Simulator running on http://localhost:${this.config.webPort}`);
        console.log(`📁 Data folder: ${path.resolve(__dirname, this.config.dataFolder)}`);
        console.log(`🔴 Redis stream: ${this.config.redisStream}`);
      });
      
    } catch (error) {
      console.error('❌ Error starting simulator:', error);
      process.exit(1);
    }
  }
}

// Start the simulator
const simulator = new MyLapsSimulator();
simulator.start();

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down simulator...');
  simulator.stopSimulator();
  process.exit(0);
});
