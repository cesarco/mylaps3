/**
 * ServiceRegistry.js
 * Registry centralizado de servicios para inyección en parsers
 */
const DriverService = require('../services/DriverService');
const NewLeaderboardService = require('../services/NewLeaderboardService');
const LapService = require('../services/LapService');
const EventService = require('../services/EventService');
const ClassStatsService = require('../services/ClassStatsService');
const SessionService = require('../services/SessionService');
const PassingsService = require('../services/PassingsService');
const CalculatedLeaderboardService = require('../services/CalculatedLeaderboardService');
const RidService = require('../services/RidService');
const KeyGenerator = require('./KeyGenerator');

class ServiceRegistry {
  constructor(redisClient, logger = console, sessionKey = 'default', debugLogger = null) {
    this.redis = redisClient;
    this.logger = logger;
    this.sessionKey = sessionKey;
    this.debugLogger = debugLogger;
    this.services = {};
    this.keyGen = new KeyGenerator(sessionKey);
    
    this.initializeServices();
  }

  initializeServices() {
    // Crear servicios base primero
    this.services.newLeaderboard = new NewLeaderboardService(this.redis, this.logger, this.sessionKey);
    this.services.passings = new PassingsService(this.redis, this.logger);
    this.services.rid = new RidService(this.redis, this.sessionKey);
    
    // Crear DriverService con referencia a NewLeaderboardService
    this.services.driver = new DriverService(this.redis, this.logger, this.sessionKey, this.services.newLeaderboard);
    
    // Crear CalculatedLeaderboardService que depende de NewLeaderboardService y DriverService
    this.services.calculatedLeaderboard = new CalculatedLeaderboardService(
      this.redis, 
      this.services.newLeaderboard, 
      this.services.driver, 
      this.logger, 
      this.sessionKey
    );
    
    // Crear otros servicios con ServiceRegistry para dependencias cruzadas
    this.services.lap = new LapService(this.redis, this.logger, this.sessionKey, this);
    this.services.event = new EventService(this.redis, this.logger, this.sessionKey);
    this.services.classStats = new ClassStatsService(this.redis, this.logger);
    this.services.session = new SessionService(this.redis, this.logger, this.sessionKey);
  }

  getDriverService() {
    return this.services.driver;
  }

  getNewLeaderboardService() {
    return this.services.newLeaderboard;
  }

  getLapService() {
    return this.services.lap;
  }

  getEventService() {
    return this.services.event;
  }

  getClassStatsService() {
    return this.services.classStats;
  }

  getSessionService() {
    return this.services.session;
  }

  getPassingsService() {
    return this.services.passings;
  }

  getRidService() {
    return this.services.rid;
  }

  getCalculatedLeaderboardService() {
    return this.services.calculatedLeaderboard;
  }

  async initialize() {
    this.logger.info('🔧 ServiceRegistry initializing all services...');
    
    // Ejecutar cualquier inicialización asíncrona necesaria
    if (this.services.calculatedLeaderboard) {
      this.logger.info('✅ CalculatedLeaderboardService ready for position calculations');
    }
    
    this.logger.info('✅ ServiceRegistry initialization complete');
  }

  getAllServices() {
    return this.services;
  }
  
  getDebugLogger() {
    return this.debugLogger;
  }
  
  getStats() {
    return {
      sessionKey: this.sessionKey,
      servicesRegistered: Object.keys(this.services),
      debugLogger: this.debugLogger ? 'available' : 'not available',
      status: 'active',
    };
  }
}

module.exports = ServiceRegistry;
