/**
 * Command Handler - Processes commands from both Discord and Minecraft chat
 */

const { logger } = require('../utils/logger');

// Map of registered command handlers
const commands = new Map();

/**
 * Setup command handling for a bot
 * @param {Object} bot - Mineflayer bot instance
 * @param {Object} botInstance - Bot type implementation instance
 * @param {string} prefix - Command prefix
 * @param {Object} owner - Owner information
 */
function setupCommandHandler(bot, botInstance, prefix, owner) {
  // Listen for Minecraft chat messages
  bot.on('chat', (username, message) => {
    // Ignore messages from self
    if (username === bot.username) return;
    
    // Check if message starts with command prefix
    if (!message.startsWith(prefix)) return;
    
    // Check if sender is authorized
    const isOwner = username === owner.minecraftUsername;
    if (!isOwner) {
      bot.chat(`Sorry ${username}, only ${owner.minecraftUsername} can control me.`);
      return;
    }
    
    // Process command
    try {
      const sender = {
        username,
        isOwner,
      };
      
      const response = handleCommand(message, 'minecraft', sender, botInstance);
      
      // Send response if there is one
      if (response) {
        if (typeof response === 'string') {
          bot.chat(response);
        } else if (Array.isArray(response)) {
          for (const line of response) {
            bot.chat(line);
          }
        } else if (typeof response === 'object') {
          bot.chat(JSON.stringify(response));
        }
      }
    } catch (err) {
      logger.error(`Error processing command from ${username}:`, err);
      bot.chat(`Error processing command: ${err.message}`);
    }
  });
}

/**
 * Process a command from any source
 * @param {string} message - Raw command message
 * @param {string} source - Source of the command ('minecraft' or 'discord')
 * @param {Object} sender - Information about the sender
 * @param {Object} botInstance - Bot instance to handle type-specific commands
 * @returns {*} - Command response
 */
function handleCommand(message, source, sender, botInstance = null) {
  // Extract command and arguments
  const parts = message.trim().split(' ');
  const fullCommand = parts[0].substring(1); // Remove the prefix
  
  // Split the command into its parts (format may be "command:subcommand")
  const commandParts = fullCommand.split(':');
  const commandName = commandParts[0];
  const subCommand = commandParts.length > 1 ? commandParts[1] : null;
  
  let args = parts.slice(1);
  
  // Check if this is a targeted command for a specific bot
  let targetBot = null;
  if (args.length > 0 && botInstance && args[0] !== botInstance.bot.username) {
    // Check if the first argument could be a bot name
    targetBot = args[0];
  }
  
  // Check if it's a registered global command
  if (commands.has(commandName)) {
    const handler = commands.get(commandName);
    return handler.execute(subCommand, args, sender, source);
  }
  
  // If not a global command and we have a bot instance, try bot-specific commands
  if (botInstance && typeof botInstance.handleCommand === 'function') {
    return botInstance.handleCommand(commandName, args);
  }
  
  // Command not found
  return `Unknown command: ${commandName}`;
}

/**
 * Register a new global command
 * @param {string} name - Command name
 * @param {Object} options - Command options
 */
function registerCommand(name, options) {
  if (!name || typeof name !== 'string') {
    throw new Error('Command name must be a string');
  }
  
  if (!options || typeof options !== 'object') {
    throw new Error('Command options must be an object');
  }
  
  if (typeof options.execute !== 'function') {
    throw new Error('Command must have an execute function');
  }
  
  commands.set(name, {
    name,
    description: options.description || '',
    usage: options.usage || `${name}`,
    minArgs: options.minArgs || 0,
    maxArgs: options.maxArgs || Infinity,
    permissions: options.permissions || [],
    subCommands: options.subCommands || {},
    execute: options.execute,
  });
  
  logger.debug(`Registered command: ${name}`);
}

/**
 * Get all registered commands
 * @returns {Map} - Map of registered commands
 */
function getCommands() {
  return commands;
}

/**
 * Clear all registered commands
 */
function clearCommands() {
  commands.clear();
}

// Register built-in help command
registerCommand('help', {
  description: 'Display help information',
  usage: 'help [command]',
  maxArgs: 1,
  execute: (subCommand, args, sender, source) => {
    if (args.length === 0) {
      // List all commands
      const commandList = Array.from(commands.keys())
        .map(cmd => {
          const command = commands.get(cmd);
          return `${cmd}: ${command.description}`;
        })
        .join('\n');
      
      return `Available commands:\n${commandList}`;
    } else {
      // Show help for specific command
      const commandName = args[0];
      if (commands.has(commandName)) {
        const command = commands.get(commandName);
        return [
          `Command: ${commandName}`,
          `Description: ${command.description}`,
          `Usage: ${command.usage}`,
        ].join('\n');
      } else {
        return `Unknown command: ${commandName}`;
      }
    }
  },
});

module.exports = {
  setupCommandHandler,
  handleCommand,
  registerCommand,
  getCommands,
  clearCommands,
}; 