/**
 * Shared Data System - Entry point
 * 
 * This file exports the shared data system components.
 */

const DataStore = require('./DataStore');
const BotDataInterface = require('./BotDataInterface');
const authConfig = require('./authConfig');
const botConfig = require('./botConfig');

/**
 * Create and initialize the shared data system
 * @param {Object} options - Initialization options
 * @param {string} [options.storageDir] - Data storage directory
 * @returns {Promise<Object>} - Shared data system components
 */
async function createSharedDataSystem(options = {}) {
  // Create data store
  const dataStore = new DataStore({
    storageDir: options.storageDir
  });
  
  // Initialize data store
  await dataStore.initialize();
  
  /**
   * Create a data interface for a bot
   * @param {string} botName - Bot name
   * @param {string} botType - Bot type
   * @returns {BotDataInterface} - Bot data interface
   */
  const createBotDataInterface = (botName, botType) => {
    return new BotDataInterface({
      dataStore,
      botName,
      botType
    });
  };
  
  return {
    dataStore,
    createBotDataInterface,
    authConfig,
    botConfig
  };
}

module.exports = createSharedDataSystem; 