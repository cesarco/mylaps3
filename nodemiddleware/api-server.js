/**
 * api-server.js
 * Servidor HTTP para controlar externamente el middleware y simulador
 */
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const fs = require('fs').promises;
const { MylapsMiddleware } = require('./app');
const Logger = require('./src/utils/Logger');
const udpIngestorRoutes = require('./src/routes/udpIngestorRoutes');

// Configuración
const PORT = process.env.API_PORT || 3001;

// Inicializar logger
const logger = new Logger('API-SERVER');

// Inicializar Express
const app = express();
app.use(bodyParser.json());
app.use(cors());

// Servir archivos estáticos (para la interfaz web)
app.use(express.static(path.join(__dirname, 'public')));

// Instancia del middleware
let middleware = null;
let isRunning = false;

// Instancia del servicio de configuración
let configService = null;

// Inicializar servicio de configuración
const ConfigService = require('./src/services/ConfigService');
configService = new ConfigService();

// Registrar rutas de la API para los ingestores UDP
app.use('/api/udp-ingestor', udpIngestorRoutes);

// ===== ENDPOINTS DE CONFIGURACIÓN =====

// Obtener configuración actual
app.get('/api/config', async (req, res) => {
  try {
    const config = await configService.getConfig();
    res.json({
      success: true,
      data: config,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error obteniendo configuración', error);
    res.status(500).json({
      success: false,
      error: `Error obteniendo configuración: ${error.message}`
    });
  }
});

// Actualizar configuración local
app.put('/api/config', async (req, res) => {
  try {
    const newConfig = req.body;
    const result = await configService.updateConfig(newConfig);

    if (result.success) {
      logger.info('Configuración actualizada localmente');
      res.json({
        success: true,
        message: 'Configuración actualizada correctamente',
        data: result.config,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    logger.error('Error actualizando configuración', error);
    res.status(500).json({
      success: false,
      error: `Error actualizando configuración: ${error.message}`
    });
  }
});

// Publicar configuración a Redis stream
app.post('/api/config/publish', async (req, res) => {
  try {
    const configToPublish = req.body;
    const result = await configService.publishConfig(configToPublish);

    if (result.success) {
      logger.info('Configuración publicada a Redis stream');
      res.json({
        success: true,
        message: 'Configuración publicada correctamente',
        streamKey: result.streamKey,
        messageId: result.messageId,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    logger.error('Error publicando configuración', error);
    res.status(500).json({
      success: false,
      error: `Error publicando configuración: ${error.message}`
    });
  }
});

// Restaurar configuración por defecto
app.post('/api/config/reset', async (req, res) => {
  try {
    const result = await configService.resetConfig();

    if (result.success) {
      logger.info('Configuración restaurada a valores por defecto');
      res.json({
        success: true,
        message: 'Configuración restaurada correctamente',
        data: result.config,
        timestamp: new Date().toISOString()
      });
    } else {
      res.status(400).json({
        success: false,
        error: result.error
      });
    }
  } catch (error) {
    logger.error('Error restaurando configuración', error);
    res.status(500).json({
      success: false,
      error: `Error restaurando configuración: ${error.message}`
    });
  }
});

// Obtener estado de sincronización
app.get('/api/config/sync-status', async (req, res) => {
  try {
    const status = await configService.getSyncStatus();
    res.json({
      success: true,
      data: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    logger.error('Error obteniendo estado de sincronización', error);
    res.status(500).json({
      success: false,
      error: `Error obteniendo estado de sincronización: ${error.message}`
    });
  }
});

// ===== ENDPOINTS LEGACY =====

// Endpoint de estado
app.get('/status', (req, res) => {
  res.json({
    status: isRunning ? 'running' : 'stopped',
    middleware: middleware ? 'initialized' : 'not initialized',
    timestamp: new Date().toISOString()
  });
});

// Inicializar middleware
app.post('/init', async (req, res) => {
  if (middleware) {
    return res.status(400).json({ error: 'Middleware already initialized' });
  }
  
  try {
    logger.info('Initializing MYLAPS middleware...');
    middleware = new MylapsMiddleware();
    const initialized = await middleware.init();
    
    if (initialized) {
      logger.info('Middleware initialized successfully');
      res.json({ status: 'success', message: 'Middleware initialized' });
    } else {
      logger.error('Failed to initialize middleware');
      middleware = null;
      res.status(500).json({ error: 'Failed to initialize middleware' });
    }
  } catch (error) {
    logger.error('Error initializing middleware', error);
    middleware = null;
    res.status(500).json({ error: `Initialization error: ${error.message}` });
  }
});

// Iniciar middleware y simulador
app.post('/start', async (req, res) => {
  if (!middleware) {
    return res.status(400).json({ error: 'Middleware not initialized. Call /init first' });
  }
  
  if (isRunning) {
    return res.status(400).json({ error: 'Middleware already running' });
  }
  
  try {
    logger.info('Starting MYLAPS middleware...');
    
    // Iniciar en segundo plano para no bloquear la respuesta
    isRunning = true;
    middleware.start().catch((error) => {
      logger.error('Error in middleware execution', error);
      isRunning = false;
    });
    
    res.json({ status: 'success', message: 'Middleware started' });
  } catch (error) {
    logger.error('Error starting middleware', error);
    isRunning = false;
    res.status(500).json({ error: `Start error: ${error.message}` });
  }
});

// Detener middleware
app.post('/stop', async (req, res) => {
  if (!middleware) {
    return res.status(400).json({ error: 'Middleware not initialized' });
  }
  
  if (!isRunning) {
    return res.status(400).json({ error: 'Middleware not running' });
  }
  
  try {
    logger.info('Stopping MYLAPS middleware...');
    await middleware.stop();
    isRunning = false;
    res.json({ status: 'success', message: 'Middleware stopped' });
  } catch (error) {
    logger.error('Error stopping middleware', error);
    res.status(500).json({ error: `Stop error: ${error.message}` });
  }
});

// Listar archivos de datos disponibles
app.get('/data-files', async (req, res) => {
  try {
    const dataDir = path.join(__dirname, 'data');
    const files = await fs.readdir(dataDir);
    
    // Filtrar solo archivos .txt
    const dataFiles = files.filter(file => file.endsWith('.txt'));
    
    // Obtener información adicional de cada archivo
    const filesInfo = await Promise.all(dataFiles.map(async (file) => {
      const filePath = path.join(dataDir, file);
      const stats = await fs.stat(filePath);
      
      // Leer primeras líneas para mostrar ejemplo
      const content = await fs.readFile(filePath, 'utf-8');
      const lines = content.split('\n').filter(line => line.trim().length > 0);
      
      return {
        name: file,
        path: `data/${file}`,
        size: stats.size,
        lines: lines.length,
        sample: lines.length > 0 ? lines[0].substring(0, 50) + '...' : ''
      };
    }));
    
    res.json(filesInfo);
  } catch (error) {
    logger.error('Error listing data files', error);
    res.status(500).json({ error: `Error listing data files: ${error.message}` });
  }
});

// Iniciar servidor
async function startServer() {
  try {
    app.listen(PORT, () => {
      logger.info(`🚀 API Server running on port ${PORT}`);
      logger.info(`Available endpoints:
- GET  /status       - Check middleware status
- POST /init         - Initialize middleware
- POST /start        - Start middleware
- POST /stop         - Stop middleware
- GET  /data-files   - List available data files
- GET  /api/udp-ingestor/devices               - List UDP Python ingestors
- GET  /api/udp-ingestor/devices/:deviceId     - Get specific ingestor status
- PATCH /api/udp-ingestor/devices/:deviceId/config - Update ingestor config
- POST /api/udp-ingestor/devices/:deviceId/command - Send command to ingestor`);
    });
  } catch (error) {
    logger.error('Failed to start API server', error);
    process.exit(1);
  }
}

// Iniciar servidor si se ejecuta directamente
if (require.main === module) {
  startServer();
}

module.exports = { app, startServer };
