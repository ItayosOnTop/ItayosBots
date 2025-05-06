/**
 * Bot Factory - Responsible for creating appropriate bot type instances
 */

const BaseBot = require('./BaseBot');
const { logger } = require('../utils/logger');

/**
 * Create a bot instance based on the specified type
 * @param {string} type - Bot type ('miner', 'builder', 'protector', etc)
 * @param {Object} bot - Mineflayer bot instance
 * @param {Object} config - Global configuration
 * @param {Object} dataStore - Shared data store
 * @returns {Object} - Instance of the specific bot type
 */
function createBotByType(type, bot, config, dataStore) {
  // Log bot creation
  logger.info(`Creating bot of type: ${type}`);
  
  // Currently we only have the BaseBot implementation
  // This will be extended with actual bot types in the future
  switch (type.toLowerCase()) {
    case 'base':
      return new BaseBot(bot, config, dataStore);
    case 'miner':
      // This would be a MinerBot class when implemented
      logger.warn('MinerBot type not yet implemented, using BaseBot');
      return new BaseBot(bot, config, dataStore);
    case 'builder':
      // This would be a BuilderBot class when implemented
      logger.warn('BuilderBot type not yet implemented, using BaseBot');
      return new BaseBot(bot, config, dataStore);
    case 'protector':
      // This would be a ProtectorBot class when implemented
      logger.warn('ProtectorBot type not yet implemented, using BaseBot');
      return new BaseBot(bot, config, dataStore);
    default:
      logger.warn(`Unknown bot type: ${type}, using BaseBot as fallback`);
      return new BaseBot(bot, config, dataStore);
  }
}

module.exports = {
  createBotByType
}; 