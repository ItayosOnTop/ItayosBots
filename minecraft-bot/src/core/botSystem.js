/**
 * Bot System - Core module for managing and coordinating bots
 */

const mineflayer = require('mineflayer');
const { pathfinder } = require('mineflayer-pathfinder');
const { setupDiscord } = require('./discordIntegration');
const { createBotByType } = require('../bot-types/botFactory');
const { createDataStore } = require('./dataStore');
const { setupCommandHandler } = require('./commandHandler');
const { logger } = require('../utils/logger');

// Stores all active bot instances
const activeBots = new Map();

// Shared data store for all bots
let dataStore;

/**
 * Initialize and start the bot system
 * @param {Object} config - Configuration object
 * @returns {Promise} - Resolves when bot system is ready
 */
async function startBotSystem(config) {
  try {
    // Initialize shared data store
    dataStore = createDataStore();
    
    // Setup Discord integration if enabled
    if (config.discord.enabled) {
      await setupDiscord(config.discord, (command, source, sender) => handleCommand(command, source, sender, config));
      logger.info('Discord integration initialized');
    }
    
    // Create each bot defined in the configuration
    for (const botConfig of config.bots.instances) {
      await createBot(botConfig, config);
    }
    
    logger.info(`Bot system initialized with ${activeBots.size} bots`);
    return Promise.resolve();
  } catch (error) {
    logger.error('Failed to initialize bot system:', error);
    return Promise.reject(error);
  }
}

/**
 * Create a new bot instance
 * @param {Object} botConfig - Bot-specific configuration
 * @param {Object} globalConfig - Global system configuration
 * @returns {Promise} - Resolves when bot is connected
 */
async function createBot(botConfig, globalConfig) {
  const { username, type, password } = botConfig;
  
  // Create bot instance with Mineflayer
  const bot = mineflayer.createBot({
    host: globalConfig.server.host,
    port: globalConfig.server.port,
    username,
    password,
    version: globalConfig.server.version,
    viewDistance: globalConfig.bots.defaults.viewDistance,
  });
  
  // Add necessary plugins
  bot.loadPlugin(pathfinder);
  
  // Setup event listeners
  bot.once('spawn', () => {
    logger.info(`Bot ${username} (${type}) has spawned`);
    
    // Initialize bot type specific functionality
    const botInstance = createBotByType(type, bot, globalConfig, dataStore);
    
    // Setup command handler
    setupCommandHandler(bot, botInstance, globalConfig.system.commandPrefix, globalConfig.owner);
    
    // Save bot instance to active bots map
    activeBots.set(username, {
      bot,
      instance: botInstance,
      config: botConfig
    });
  });
  
  bot.on('error', (err) => {
    logger.error(`Bot ${username} encountered an error:`, err);
  });
  
  bot.on('end', () => {
    logger.warn(`Bot ${username} disconnected, attempting to reconnect...`);
    setTimeout(() => {
      // Attempt to reconnect
      activeBots.delete(username);
      createBot(botConfig, globalConfig).catch(err => {
        logger.error(`Failed to reconnect bot ${username}:`, err);
      });
    }, 5000);
  });
  
  // Return a promise that resolves when the bot has spawned
  return new Promise((resolve, reject) => {
    bot.once('spawn', resolve);
    
    // Reject if there's an error before spawn
    const timeout = setTimeout(() => {
      bot.removeListener('spawn', resolve);
      reject(new Error(`Timed out while connecting bot ${username}`));
    }, 30000);
    
    bot.once('spawn', () => clearTimeout(timeout));
  });
}

/**
 * Handle commands from any source (Minecraft or Discord)
 * @param {string} command - The command text
 * @param {string} source - The source of the command ('minecraft' or 'discord')
 * @param {Object} sender - Information about who sent the command
 * @param {Object} config - Global configuration
 */
function handleCommand(command, source, sender, config) {
  // Verify the sender is authorized
  if (source === 'discord' && sender.id !== config.owner.discordId) {
    return;
  }
  
  // Parse the command
  const parts = command.trim().split(' ');
  const cmd = parts[0].substring(config.system.commandPrefix.length);
  const args = parts.slice(1);
  
  // Handle system-wide commands
  switch (cmd) {
    case 'list':
      return listBots();
    case 'stop':
      return args.length > 0 ? stopBot(args[0]) : stopAllBots();
    // Add more system commands here
  }
  
  // Route command to specific bot(s)
  const targetBot = args.length > 0 && activeBots.has(args[0]) ? args[0] : null;
  
  if (targetBot) {
    // Command targeted at a specific bot
    const { instance } = activeBots.get(targetBot);
    instance.handleCommand(cmd, args.slice(1));
  } else {
    // Command for all bots or a specific type
    for (const [_, { instance }] of activeBots) {
      instance.handleCommand(cmd, args);
    }
  }
}

/**
 * List all active bots and their status
 */
function listBots() {
  const botList = [];
  
  for (const [name, { instance, config }] of activeBots) {
    botList.push({
      name,
      type: config.type,
      status: instance.getStatus(),
    });
  }
  
  return botList;
}

/**
 * Stop a specific bot
 * @param {string} botName - Name of the bot to stop
 */
function stopBot(botName) {
  if (activeBots.has(botName)) {
    const { bot } = activeBots.get(botName);
    bot.quit();
    activeBots.delete(botName);
    logger.info(`Bot ${botName} has been stopped`);
    return true;
  }
  
  logger.warn(`No bot named ${botName} found`);
  return false;
}

/**
 * Stop all active bots
 */
function stopAllBots() {
  for (const [name, { bot }] of activeBots) {
    bot.quit();
    logger.info(`Bot ${name} has been stopped`);
  }
  
  activeBots.clear();
  return true;
}

module.exports = {
  startBotSystem,
  listBots,
  stopBot,
  stopAllBots,
}; 