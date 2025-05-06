/**
 * ItayosBot - Advanced Minecraft Bot System
 * Main entry point for the application
 */

const { startBotSystem } = require('./src/core/botSystem');
const config = require('./config/config');

// Start the bot system with the provided configuration
startBotSystem(config)
  .then(() => {
    console.log('Bot system started successfully');
  })
  .catch((error) => {
    console.error('Failed to start bot system:', error);
    process.exit(1);
  }); 