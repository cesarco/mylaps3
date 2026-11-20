const MylapsMiddleware = require('./src/MylapsMiddleware');
const Logger = require('./src/utils/Logger');

// Logger principal
const logger = new Logger('MAIN');

// Main execution
async function main() {
  const middleware = new MylapsMiddleware();
  
  // Graceful shutdown handling
  process.on('SIGINT', async () => {
    logger.shutdown('Received SIGINT, shutting down gracefully...');
    await middleware.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.shutdown('Received SIGTERM, shutting down gracefully...');
    await middleware.stop();
    process.exit(0);
  });

  process.on('uncaughtException', async (error) => {
    logger.error('Uncaught Exception', error);
    await middleware.stop();
    process.exit(1);
  });

  process.on('unhandledRejection', async (reason, promise) => {
    logger.error('Unhandled Rejection at:', { promise, reason });
    await middleware.stop();
    process.exit(1);
  });

  // Inicializar y arrancar middleware
  try {
    const initialized = await middleware.init();
    if (initialized) {
      await middleware.start();
    } else {
      logger.error('Failed to initialize middleware');
      process.exit(1);
    }
  } catch (error) {
    logger.error('Failed to start middleware', error);
    process.exit(1);
  }
}

if (require.main === module) {
  main().catch((error) => {
    logger.error('Main process error', error);
    process.exit(1);
  });
}

module.exports = { MylapsMiddleware, main };
