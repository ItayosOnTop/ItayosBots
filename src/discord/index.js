/**
 * Discord Integration - Entry point
 * 
 * This file exports the Discord integration components.
 */

const DiscordBot = require('./DiscordBot');
const { discordConfig, embedTemplates } = require('./discordConfig');

/**
 * Create and initialize the Discord integration
 * @param {Object} options - Initialization options
 * @param {function} options.handleCommand - Command handler function
 * @param {Object} options.botManager - Bot manager instance
 * @param {Object} options.dataStore - Data store instance
 * @returns {Promise<Object>} - Discord integration components
 */
async function createDiscordIntegration({ handleCommand, botManager, dataStore }) {
  // Create Discord bot
  const discordBot = new DiscordBot({
    handleCommand,
    botManager,
    dataStore
  });
  
  // Connect to Discord
  const connected = await discordBot.connect();
  
  if (!connected) {
    console.warn('Failed to connect to Discord. Integration will not be available.');
  }
  
  return {
    discordBot,
    discordConfig,
    embedTemplates,
    isConnected: connected
  };
}

module.exports = createDiscordIntegration; 