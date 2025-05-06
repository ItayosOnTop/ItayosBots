/**
 * Bot Factory - Creates specialized bot instances based on type
 */

const { logger } = require('../utils/logger');
const MinerBot = require('./minerBot');
const BuilderBot = require('./builderBot');
const ProtectorBot = require('./protectorBot');

/**
 * Create a specialized bot instance based on type
 * @param {string} type - Bot type ('miner', 'builder', 'protector')
 * @param {Object} bot - Mineflayer bot instance
 * @param {Object} config - Global configuration
 * @param {Object} dataStore - Shared data store
 * @returns {Object} - Specialized bot instance
 */
function createBotByType(type, bot, config, dataStore) {
  logger.info(`Creating bot of type: ${type}`);
  
  // Get type-specific configuration
  const typeConfig = config.botTypes[type] || {};
  
  // Create the appropriate bot type
  switch (type.toLowerCase()) {
    case 'miner':
      return new MinerBot(bot, typeConfig, config, dataStore);
      
    case 'builder':
      return new BuilderBot(bot, typeConfig, config, dataStore);
      
    case 'protector':
      return new ProtectorBot(bot, typeConfig, config, dataStore);
      
    default:
      logger.warn(`Unknown bot type: ${type}, defaulting to base functionality`);
      return {
        type: 'unknown',
        bot,
        handleCommand(command, args) {
          logger.warn(`Command ${command} not implemented for unknown bot type`);
          return `Command ${command} not implemented for this bot type`;
        },
        getStatus() {
          return {
            type: 'unknown',
            health: bot.health,
            food: bot.food,
            position: bot.entity.position,
          };
        },
      };
  }
}

module.exports = {
  createBotByType,
}; 