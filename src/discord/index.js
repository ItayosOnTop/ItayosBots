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
 * @param {Object} options.commandParser - Command parser instance
 * @returns {Promise<Object>} - Discord integration components
 */
async function createDiscordIntegration({ handleCommand, botManager, dataStore, commandParser }) {
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
    return {
      discordBot,
      discordConfig,
      embedTemplates,
      isConnected: false
    };
  }
  
  // Register slash commands if command parser is provided
  if (commandParser) {
    try {
      const registered = await discordBot.registerSlashCommands(commandParser);
      if (!registered) {
        console.warn('Failed to register slash commands, but Discord connection is active.');
        console.warn('Commands may not be available until registration is fixed.');
      }
    } catch (error) {
      console.error('Failed to register slash commands:', error);
      console.warn('Discord connection is active, but commands may not be available.');
      // Continue with connection even if command registration fails
      // This allows the bot to still receive events and send messages
    }
  } else {
    console.warn('No command parser provided. Discord slash commands will not be registered.');
  }
  
  return {
    discordBot,
    discordConfig,
    embedTemplates,
    isConnected: connected
  };
}

module.exports = createDiscordIntegration; 