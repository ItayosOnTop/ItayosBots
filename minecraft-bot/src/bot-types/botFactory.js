/**
 * Bot Factory - Responsible for creating appropriate bot type instances
 */

const BaseBot = require('./BaseBot');
const BuilderBot = require('./BuilderBot');
const ProtectorBot = require('./ProtectorBot');
const MinerBot = require('./MinerBot');
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
  
  switch (type.toLowerCase()) {
    case 'base':
      return new BaseBot(bot, config, dataStore);
    case 'miner':
      logger.info('Creating MinerBot instance');
      return new MinerBot(bot, config, dataStore);
    case 'builder':
      logger.info('Creating BuilderBot instance');
      return new BuilderBot(bot, config, dataStore);
    case 'protector':
      logger.info('Creating ProtectorBot instance');
      return new ProtectorBot(bot, config, dataStore);
    default:
      logger.warn(`Unknown bot type: ${type}, using BaseBot as fallback`);
      return new BaseBot(bot, config, dataStore);
  }
}

module.exports = {
  createBotByType
}; 