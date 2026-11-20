/**
 * udpIngestorRoutes.js
 * Rutas de API para control remoto de ingestores UDP Python
 */
const express = require('express');
const UdpIngestorService = require('../services/UdpIngestorService');
const Logger = require('../utils/Logger');

const router = express.Router();
const logger = new Logger('UDP-Ingestor-API');

// Inicializar servicio
const udpIngestorService = new UdpIngestorService();

// Conectar al iniciar
(async () => {
  try {
    await udpIngestorService.connect();
  } catch (error) {
    logger.error('Error al conectar servicio UDP Ingestor', error);
  }
})();

// Middleware para manejo de errores
const asyncHandler = (fn) => (req, res, next) => {
  return Promise.resolve(fn(req, res, next)).catch(next);
};

// Obtener todos los dispositivos
router.get('/devices', asyncHandler(async (req, res) => {
  const devices = await udpIngestorService.getDevices();
  res.json(devices);
}));

// Obtener un dispositivo específico
router.get('/devices/:deviceId', asyncHandler(async (req, res) => {
  const { deviceId } = req.params;
  const device = await udpIngestorService.getDeviceStatus(deviceId);
  
  if (device.error) {
    return res.status(404).json({ error: device.error });
  }
  
  res.json(device);
}));

// Actualizar configuración de un dispositivo
router.patch('/devices/:deviceId/config', asyncHandler(async (req, res) => {
  const { deviceId } = req.params;
  const newConfig = req.body;
  
  try {
    const result = await udpIngestorService.updateDeviceConfig(deviceId, newConfig);
    res.json(result);
  } catch (error) {
    logger.error(`Error actualizando configuración de ${deviceId}`, error);
    res.status(400).json({ error: error.message });
  }
}));

// Enviar comando a un dispositivo
router.post('/devices/:deviceId/command', asyncHandler(async (req, res) => {
  const { deviceId } = req.params;
  const { command, params } = req.body;
  
  if (!command) {
    return res.status(400).json({ error: 'Se requiere un comando' });
  }
  
  const validCommands = ['start', 'stop', 'restart'];
  if (!validCommands.includes(command)) {
    return res.status(400).json({ error: `Comando inválido. Comandos disponibles: ${validCommands.join(', ')}` });
  }
  
  try {
    const result = await udpIngestorService[`${command}Device`](deviceId);
    res.json(result);
  } catch (error) {
    logger.error(`Error enviando comando ${command} a ${deviceId}`, error);
    res.status(500).json({ error: error.message });
  }
}));

// Obtener los últimos datos del stream para un dispositivo específico
router.get('/devices/:deviceId/stream-data', asyncHandler(async (req, res) => {
  const { deviceId } = req.params;
  const count = req.query.count ? parseInt(req.query.count) : 20;
  
  try {
    // Obtener la clave del stream configurada para este dispositivo
    const streamKey = await udpIngestorService.getDeviceStreamKey(deviceId);
    
    if (!streamKey) {
      return res.status(404).json({ error: 'No se encontró la configuración de stream para este dispositivo' });
    }
    
    // Obtener los últimos datos del stream
    const data = await udpIngestorService.getStreamData(streamKey, count);
    res.json(data);
  } catch (error) {
    logger.error(`Error obteniendo datos del stream para ${deviceId}`, error);
    res.status(500).json({ error: error.message });
  }
}));

// Obtener datos de un stream específico (si conocemos la clave directamente)
router.get('/stream-data/:streamKey', asyncHandler(async (req, res) => {
  const { streamKey } = req.params;
  const count = req.query.count ? parseInt(req.query.count) : 20;
  
  try {
    const data = await udpIngestorService.getStreamData(streamKey, count);
    res.json(data);
  } catch (error) {
    logger.error(`Error obteniendo datos del stream ${streamKey}`, error);
    res.status(500).json({ error: error.message });
  }
}));

// Iniciar un escaneo de red
router.post('/devices/:deviceId/scan', asyncHandler(async (req, res) => {
  const { deviceId } = req.params;
  const options = req.body || {};
  
  try {
    const result = await udpIngestorService.scanNetwork(deviceId, options);
    res.json(result);
  } catch (error) {
    logger.error(`Error iniciando escaneo de red con dispositivo ${deviceId}`, error);
    res.status(400).json({ error: error.message });
  }
}));

// Obtener el estado de un escaneo de red
router.get('/devices/:deviceId/scan', asyncHandler(async (req, res) => {
  const { deviceId } = req.params;
  
  try {
    const scanStatus = await udpIngestorService.getScanStatus(deviceId);
    
    if (!scanStatus) {
      return res.status(404).json({ error: 'No hay escaneo en progreso o no se encontró historial de escaneo' });
    }
    
    res.json(scanStatus);
  } catch (error) {
    logger.error(`Error obteniendo estado de escaneo para dispositivo ${deviceId}`, error);
    res.status(500).json({ error: error.message });
  }
}));

module.exports = router;