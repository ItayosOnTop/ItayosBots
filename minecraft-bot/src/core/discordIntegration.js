/**
 * Discord Integration - Enables bot control through Discord
 */

const { Client, GatewayIntentBits, ActivityType, Events } = require('discord.js');
const { logger } = require('../utils/logger');

let client;
let commandHandler;
let config;
let commandPrefix = '#'; // Default command prefix

/**
 * Setup Discord bot integration
 * @param {Object} discordConfig - Discord configuration
 * @param {Function} cmdHandler - Function to handle commands
 * @param {string} [prefix='#'] - Command prefix
 * @returns {Promise} - Resolves when Discord bot is ready
 */
async function setupDiscord(discordConfig, cmdHandler, prefix = '#') {
  config = discordConfig;
  commandHandler = cmdHandler;
  commandPrefix = prefix;
  
  // Create Discord client with necessary intents
  client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });
  
  // Set up event handlers
  setupEventHandlers();
  
  // Log in to Discord
  return client.login(config.token);
}

/**
 * Set up Discord event handlers
 */
function setupEventHandlers() {
  client.once(Events.ClientReady, () => {
    logger.info(`Discord bot logged in as ${client.user.tag}`);
    
    // Set bot status
    client.user.setPresence({
      activities: [{ 
        name: 'Minecraft',
        type: ActivityType.Playing
      }],
      status: 'online',
    });
  });
  
  client.on(Events.MessageCreate, (message) => {
    // Ignore messages from bots (including self)
    if (message.author.bot) return;
    
    // Only process messages in the configured channel
    if (message.channelId !== config.channelId) return;
    
    // Check if message starts with command prefix
    if (!message.content.startsWith(commandPrefix)) return;
    
    // Process the command
    try {
      const sender = {
        id: message.author.id,
        username: message.author.username,
        isOwner: message.author.id === config.discordId || config.ownerId,
      };
      
      // Pass command to handler
      const response = commandHandler(message.content, 'discord', sender);
      
      // Send response if there is one
      if (response) {
        if (typeof response === 'string') {
          message.reply(response);
        } else if (Array.isArray(response)) {
          message.reply(response.join('\n'));
        } else if (typeof response === 'object') {
          message.reply('```json\n' + JSON.stringify(response, null, 2) + '\n```');
        }
      }
    } catch (err) {
      logger.error('Error processing Discord command:', err);
      message.reply('Error processing command: ' + err.message);
    }
  });
  
  client.on(Events.Error, (error) => {
    logger.error('Discord client error:', error);
  });
}

/**
 * Send a message to the Discord channel
 * @param {string} message - Message to send
 * @returns {Promise} - Resolves when message is sent
 */
async function sendMessage(message) {
  if (!client || !client.isReady()) {
    logger.warn('Cannot send Discord message: client not ready');
    return;
  }
  
  try {
    const channel = await client.channels.fetch(config.channelId);
    if (channel) {
      await channel.send(message);
    }
  } catch (err) {
    logger.error('Failed to send Discord message:', err);
  }
}

/**
 * Shutdown the Discord client
 */
function shutdown() {
  if (client) {
    client.destroy();
    logger.info('Discord client destroyed');
  }
}

// Clean up on exit
process.on('exit', shutdown);

module.exports = {
  setupDiscord,
  sendMessage,
  shutdown,
}; 