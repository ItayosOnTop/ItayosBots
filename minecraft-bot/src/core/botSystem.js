/**
 * Bot System - Core module for managing and coordinating bots
 */

const mineflayer = require('mineflayer');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');
const armorManager = require('mineflayer-armor-manager');
const { setupDiscord } = require('./discordIntegration');
const { createBotByType } = require('../bot-types/botFactory');
const { createDataStore } = require('./dataStore');
const { setupCommandHandler } = require('./commandHandler');
const { logger } = require('../utils/logger');

// Stores all active bot instances
const activeBots = new Map();

// Shared data store for all bots
let dataStore;

// Let's declare a global config variable for the module
let config;

/**
 * Initialize and start the bot system
 * @param {Object} configObj - Configuration object
 * @returns {Promise} - Resolves when bot system is ready
 */
async function startBotSystem(configObj) {
  try {
    // Store config globally for access by other functions
    config = configObj;
    
    // Initialize shared data store
    dataStore = createDataStore();
    
    // Setup Discord integration if enabled
    if (config.discord && config.discord.enabled) {
      try {
        // Make sure we have a prefix even if config is incomplete
        const prefix = config.system && config.system.commandPrefix ? config.system.commandPrefix : '#';
        
        await setupDiscord(
          config.discord, 
          (command, source, sender) => handleCommand(command, source, sender, config),
          prefix
        );
        logger.info('Discord integration initialized');
      } catch (err) {
        logger.error('Failed to initialize Discord integration:', err);
      }
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
  bot.loadPlugin(armorManager);
  
  // Setup event listeners
  bot.once('spawn', () => {
    logger.info(`Bot ${username} (${type}) has spawned`);
    
    // Configure pathfinder with default movements
    const mcData = require('minecraft-data')(bot.version);
    const movements = new Movements(bot, mcData);
    movements.canDig = true;
    movements.allowSprinting = true;
    movements.scafoldingBlocks = ['dirt', 'cobblestone', 'stone'];
    
    bot.pathfinder.setMovements(movements);
    
    // Auto-equip best armor on spawn
    bot.armorManager.equipAll();
    
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
function handleCommand(command, source, sender, configObj) {
  // Ensure we have a valid config object
  const cfg = configObj || config || { system: { commandPrefix: '#' } };
  
  // Verify the sender is authorized
  if (source === 'discord' && !sender.isOwner) {
    return 'You are not authorized to control the bots.';
  }
  
  // Parse the command
  const prefix = cfg.system.commandPrefix || '#'; 
  if (!command.startsWith(prefix)) {
    return; // Not a command
  }
  
  const parts = command.trim().split(' ');
  const cmd = parts[0].substring(prefix.length);
  const args = parts.slice(1);
  
  // Handle system-wide commands
  if (cmd === 'help') {
    return getHelpText(args[0], cfg);
  }
  else if (cmd === 'list') {
    // Check if list targets a specific bot
    return args.length > 0 ? listBots(args[0]) : listBots();
  }
  else if (cmd === 'stop') {
    return args.length > 0 ? stopBot(args[0]) : stopAllBots();
  }
  else if (cmd === 'status' || cmd === 'goto' || cmd === 'come') {
    // These are global commands that may target specific bots
    
    // Check if a target bot is specified
    const targetBot = args.length > 0 ? args[0] : null;
    
    if (targetBot && activeBots.has(targetBot)) {
      // Command targeted at a specific bot
      const { instance } = activeBots.get(targetBot);
      const response = instance.handleCommand(cmd, args.slice(1), targetBot);
      
      // Return the response or a fallback message
      return response || `Command ${cmd} sent to ${targetBot}`;
    } else {
      // Send to all bots, collect responses
      const responses = [];
      
      for (const [botName, { instance }] of activeBots) {
        const response = instance.handleCommand(cmd, args, null);
        if (response) {
          responses.push(`${botName}: ${response}`);
        }
      }
      
      return responses.length > 0 ? responses.join('\n') : 'No bot responses received';
    }
  }
  
  // For bot-specific commands (mine, guard, buildwall, etc.)
  const responses = [];
  let validCommand = false;
  
  // Try sending to all bots - only the one that recognizes the command will respond
  for (const [botName, { instance }] of activeBots) {
    // If a target bot is specified, only send to that bot
    if (args.length > 0 && args[0] === botName) {
      const response = instance.handleCommand(cmd, args.slice(1), botName);
      if (response) {
        return `${botName}: ${response}`;
      }
      return `Command ${cmd} sent to ${botName}`;
    }
    
    // If no target specified, send to all bots
    if (args.length === 0 || !activeBots.has(args[0])) {
      const response = instance.handleCommand(cmd, args, null);
      if (response) {
        validCommand = true;
        responses.push(`${botName}: ${response}`);
      }
    }
  }
  
  if (responses.length > 0) {
    return responses.join('\n');
  }
  
  // If we reached here, no bot recognized the command
  if (!validCommand) {
    return `Unknown command: ${cmd}. Type ${prefix}help for assistance.`;
  }
  
  return null;
}

/**
 * Get help text for commands
 * @param {string} command - Specific command to get help for
 * @param {Object} config - Global configuration
 * @returns {string} - Help text
 */
function getHelpText(command, config) {
  // Safety check - if config is missing, use a default prefix
  const prefix = config && config.system && config.system.commandPrefix ? config.system.commandPrefix : '#';
  
  const generalHelp = [
    '**ItayosBot Command Help**',
    '',
    '**Global Commands:**',
    `\`${prefix}help [command]\` - Show this help message`,
    `\`${prefix}list\` - List all active bots and their status`,
    `\`${prefix}stop [bot_name]\` - Stop all bots or a specific bot`,
    `\`${prefix}goto [bot_name] [x] [y] [z]\` - Command bot(s) to move to coordinates`,
    `\`${prefix}come [bot_name]\` - Command bot(s) to come to your location`,
    `\`${prefix}status [bot_name]\` - Get detailed status of bot(s)`,
    '',
    '**Bot Type-Specific Commands:**',
    `For Miner bot: mine, store, minearea`,
    `For Builder bot: buildwall, blueprint`,
    `For Protector bot: guard, patrol`,
    '',
    `Use \`${prefix}help [command]\` for details on a specific command.`
  ].join('\n');

  // If no specific command, return general help
  if (!command) {
    return generalHelp;
  }

  // Help text for specific commands
  const helpTexts = {
    // Global commands
    'help': `Usage: ${prefix}help [command]\nShow help information for commands.`,
    'list': `Usage: ${prefix}list\nList all active bots and their status.`,
    'stop': `Usage: ${prefix}stop [bot_name]\nStop all bots or a specific bot.`,
    'goto': `Usage: ${prefix}goto [bot_name] [x] [y] [z]\nCommand bot(s) to move to specific coordinates.`,
    'come': `Usage: ${prefix}come [bot_name]\nCommand bot(s) to come to your location.`,
    'status': `Usage: ${prefix}status [bot_name]\nGet detailed status of bot(s).`,
    
    // Miner commands
    'mine': `Usage: ${prefix}mine [block_type] [count]\nMine specific blocks until count reached.`,
    'store': `Usage: ${prefix}store\nStore items in a storage chest.`,
    'minearea': `Usage: ${prefix}minearea <x1> <y1> <z1> <x2> <y2> <z2>\nMine all blocks in an area.`,
    
    // Builder commands
    'buildwall': `Usage: ${prefix}buildwall [block_type] [height] [x1] [z1] [x2] [z2]\nBuild wall between points.`,
    'blueprint': `Usage: ${prefix}blueprint [name] [x1] [y1] [z1] [x2] [y2] [z2]\nCreate new schematic from area.`,
    
    // Protector commands
    'guard': `Usage: ${prefix}guard [x] [y] [z] or [player_name]\nGuard location or player.`,
    'patrol': `Usage: ${prefix}patrol [x1] [z1] [x2] [z2]\nPatrol rectangular area.`,
  };

  return helpTexts[command] || `No help available for command: ${command}`;
}

/**
 * List all active bots and their status
 * @param {string} [targetBot] - Optional specific bot to list
 * @returns {string} - Formatted bot list
 */
function listBots(targetBot = null) {
  if (activeBots.size === 0) {
    return "No bots are currently active.";
  }

  const botList = [];
  
  for (const [name, { instance, config }] of activeBots) {
    // Skip if a specific bot was requested and this isn't it
    if (targetBot && name !== targetBot) continue;
    
    const status = instance.getStatus();
    botList.push({
      name,
      type: config.type,
      status: status,
    });
  }
  
  // If specific bot was requested but not found
  if (targetBot && botList.length === 0) {
    return `Bot '${targetBot}' not found.`;
  }
  
  // Format the output nicely for Discord
  const formattedList = [
    '**Active Bots:**',
    ''
  ];

  for (const bot of botList) {
    const health = bot.status.health !== undefined ? `❤️ ${bot.status.health}` : '';
    const task = bot.status.currentTask ? `🔄 ${bot.status.currentTask}` : '🔄 Idle';
    const position = bot.status.position ? 
      `📍 ${Math.floor(bot.status.position.x)},${Math.floor(bot.status.position.y)},${Math.floor(bot.status.position.z)}` : '';
    
    formattedList.push(`**${bot.name}** (${bot.type}) - ${health} ${task} ${position}`);
    
    // Add type-specific details
    if (bot.type === 'miner' && bot.status.miningTarget) {
      formattedList.push(`   Mining: ${bot.status.miningTarget.blockType} (${bot.status.miningTarget.count})`);
    }
    else if (bot.type === 'builder' && bot.status.buildTarget) {
      formattedList.push(`   Building: ${bot.status.buildTarget.schematicName}`);
    }
    else if (bot.type === 'protector' && bot.status.guardTarget) {
      const target = bot.status.guardTarget.type === 'player' ? 
        `Player: ${bot.status.guardTarget.username}` : 
        `Location: ${bot.status.guardTarget.x},${bot.status.guardTarget.y},${bot.status.guardTarget.z}`;
      formattedList.push(`   Guarding: ${target}`);
    }
  }
  
  return formattedList.join('\n');
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
  getHelpText,
}; 