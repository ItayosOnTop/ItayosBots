/**
 * CommandParser - Parses and validates commands
 * 
 * This class handles command parsing, validation, and execution for both
 * in-game chat and Discord interfaces.
 */

const mainConfig = require('../../config');
const { hasPermission } = require('../shared/authConfig');

class CommandParser {
  /**
   * Create a new CommandParser
   * @param {Object} options - Configuration options
   * @param {string} options.prefix - Command prefix character
   */
  constructor(options = {}) {
    this.prefix = options.prefix || mainConfig.system.commandPrefix;
    this.commands = new Map();
    this.commandGroups = {};
  }
  
  /**
   * Register a command in the system
   * @param {Object} commandData - Command data
   * @param {string} commandData.name - Command name
   * @param {string} commandData.description - Command description
   * @param {Array<string>} [commandData.aliases=[]] - Command aliases
   * @param {string} commandData.usage - Command usage example
   * @param {string} [commandData.group='global'] - Command group
   * @param {Array<string>} [commandData.platforms=['minecraft', 'discord']] - Platforms the command is available on
   * @param {Function} commandData.execute - Command execution function
   */
  registerCommand(commandData) {
    if (!commandData.name) {
      throw new Error('Command must have a name');
    }
    
    if (!commandData.execute || typeof commandData.execute !== 'function') {
      throw new Error('Command must have an execute function');
    }
    
    // Set defaults for optional fields
    const command = {
      name: commandData.name,
      description: commandData.description || 'No description provided',
      aliases: commandData.aliases || [],
      usage: commandData.usage || `${this.prefix}${commandData.name}`,
      group: commandData.group || 'global',
      platforms: commandData.platforms || ['minecraft', 'discord'],
      execute: commandData.execute
    };
    
    // Register command
    this.commands.set(command.name, command);
    
    // Register aliases
    command.aliases.forEach(alias => {
      this.commands.set(alias, command);
    });
    
    // Add to command group
    if (!this.commandGroups[command.group]) {
      this.commandGroups[command.group] = [];
    }
    
    // Only add the command once to its group (not aliases)
    if (!this.commandGroups[command.group].find(cmd => cmd.name === command.name)) {
      this.commandGroups[command.group].push({
        name: command.name,
        description: command.description,
        usage: command.usage
      });
    }
    
    return this;
  }
  
  /**
   * Parse a message and extract command and arguments
   * @param {string} message - The message to parse
   * @returns {Object|null} - Command data or null if not a command
   */
  parseMessage(message) {
    if (!message.startsWith(this.prefix)) {
      return null;
    }
    
    // Remove prefix and split into command and arguments
    const parts = message.slice(this.prefix.length).trim().split(/\s+/);
    const commandName = parts[0].toLowerCase();
    const args = parts.slice(1);
    
    // Find the command
    const command = this.commands.get(commandName);
    
    if (!command) {
      return null;
    }
    
    return {
      command,
      args
    };
  }
  
  /**
   * Execute a command from a message
   * @param {Object} options - Execution options
   * @param {string} options.message - The message to parse
   * @param {string} options.platform - Platform the message came from ('minecraft' or 'discord')
   * @param {string} options.sender - ID or username of sender
   * @param {Object} options.context - Additional context for command execution
   * @returns {Promise<Object>} - Result of command execution
   */
  async executeCommand({ message, platform, sender, context = {} }) {
    const parsed = this.parseMessage(message);
    
    if (!parsed) {
      return { success: false, error: 'Not a valid command' };
    }
    
    const { command, args } = parsed;
    
    // Check if command is available on this platform
    if (!command.platforms.includes(platform)) {
      return {
        success: false,
        error: `This command is not available on ${platform}`
      };
    }
    
    // Check permissions
    if (!hasPermission(platform, sender, command.name)) {
      return {
        success: false,
        error: 'You do not have permission to use this command'
      };
    }
    
    try {
      // Execute the command
      const result = await command.execute({ args, sender, platform, context });
      
      return {
        success: true,
        result
      };
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  /**
   * Get all commands in a specific group
   * @param {string} [group] - Group name (or all if not specified)
   * @returns {Array} - Array of commands
   */
  getCommands(group) {
    if (group && this.commandGroups[group]) {
      return this.commandGroups[group];
    }
    
    if (!group) {
      // Return all commands grouped by category
      return this.commandGroups;
    }
    
    return [];
  }
}

module.exports = CommandParser; 