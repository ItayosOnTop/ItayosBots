/**
 * Command System - Entry point
 * 
 * This file exports the command system components and sets up the commands.
 */

const CommandParser = require('./CommandParser');
const BotManager = require('./BotManager');
const createGlobalCommands = require('./GlobalCommands');
const createProtectorCommands = require('./ProtectorCommands');
const { createProtectorBot } = require('../bots/specialized');

/**
 * Create and initialize the command system
 * @param {Object} options - Initialization options
 * @returns {Object} - Command system components
 */
function createCommandSystem(options = {}) {
  // Create command parser
  const commandParser = new CommandParser({
    prefix: options.prefix
  });
  
  // Create bot manager
  const botManager = new BotManager();
  
  // Register bot factories
  botManager.registerBotFactory('protector', createProtectorBot);
  
  // Register commands
  createGlobalCommands({
    botManager,
    commandParser
  });
  
  createProtectorCommands({
    botManager,
    commandParser
  });
  
  // Command handler function for external use
  const handleCommand = async ({ message, platform, sender, context }) => {
    return await commandParser.executeCommand({
      message,
      platform,
      sender,
      context
    });
  };
  
  return {
    commandParser,
    botManager,
    handleCommand
  };
}

module.exports = createCommandSystem; 