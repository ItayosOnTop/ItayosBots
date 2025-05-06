/**
 * ItayosBot - Advanced Minecraft Bot System
 * Main entry point for the application
 */

const { startBotSystem } = require('./src/core/botSystem');
const config = require('./config/config');
const { logger } = require('./src/utils/logger');

// Start the bot system with the provided configuration
startBotSystem(config)
  .then(() => {
    logger.info('Bot system started successfully');
  })
  .catch((error) => {
    logger.error('Failed to start bot system:', error);
    process.exit(1);
  }); 