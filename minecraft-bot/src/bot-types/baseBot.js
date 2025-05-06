/**
 * BaseBot - Base class for all bot types
 * Provides common functionality that all bots share
 */

const AutoEat = require('mineflayer-auto-eat').plugin;
const { goals } = require('mineflayer-pathfinder');
const Vec3 = require('vec3');
const { logger } = require('../utils/logger');

class BaseBot {
  /**
   * Create a new BaseBot instance
   * @param {Object} bot - Mineflayer bot instance
   * @param {Object} config - Bot configuration 
   * @param {Object} dataStore - Shared data store
   */
  constructor(bot, config, dataStore) {
    this.bot = bot;
    this.config = config;
    this.dataStore = dataStore;
    this.type = 'base';
    this.enabled = true;
    this.currentTask = null;
    this.taskQueue = [];
    
    // Initialize base functionality
    this.setupAutoEat();
    this.setupEventHandlers();
  }
  
  /**
   * Set up auto eat functionality
   */
  setupAutoEat() {
    // Load the plugin
    this.bot.loadPlugin(AutoEat);
    
    // Configure auto eat
    this.bot.autoEat.options = {
      priority: 'foodPoints',
      startAt: 14,
      bannedFood: [],
    };
  }
  
  /**
   * Set up common event handlers
   */
  setupEventHandlers() {
    // Handle health and hunger changes
    this.bot.on('health', () => {
      if (this.bot.food < 15) {
        this.bot.autoEat.enable();
      }
    });
    
    // Handle inventory changes to update armor
    this.bot.on('playerCollect', (collector, collected) => {
      if (collector.username === this.bot.username) {
        setTimeout(() => {
          this.equipBestArmor();
        }, 150);
      }
    });
  }
  
  /**
   * Equip the best available armor
   */
  equipBestArmor() {
    try {
      this.bot.armorManager.equipAll();
    } catch (err) {
      logger.error(`Error equipping armor: ${err.message}`);
    }
  }
  
  /**
   * Handle a command directed at this bot
   * @param {string} command - Command name
   * @param {Array} args - Command arguments
   * @param {string} targetBot - Target bot name if specified
   * @returns {string|Array|null} - Command response
   */
  handleCommand(command, args, targetBot) {
    // Skip if not enabled
    if (!this.enabled) {
      return 'Bot is currently disabled';
    }
    
    // Base commands all bots should handle
    switch (command) {
      case 'help':
        return this.handleHelpCommand(args);
      case 'stop':
        return this.handleStopCommand();
      case 'goto':
        return this.handleGotoCommand(args);
      case 'come':
        return this.handleComeCommand(args);
      case 'status':
        return this.handleStatusCommand();
      default:
        return `Unknown command: ${command}`;
    }
  }
  
  /**
   * Handle the help command
   * @param {Array} args - Command arguments
   * @returns {string|Array} - Help text
   */
  handleHelpCommand(args) {
    const commandName = args[0];
    
    if (!commandName) {
      // General help
      return [
        'Available commands:',
        '#help [command] - Show this help message',
        '#list - List all active bots and their status',
        '#stop [bot_name] - Stop all bots or a specific bot',
        '#goto [bot_name] [x] [y] [z] - Command bot(s) to move to coordinates',
        '#come [bot_name] - Command bot(s) to come to your location',
        '#status [bot_name] - Get detailed status of bot(s)'
      ];
    }
    
    // Help for specific command
    switch (commandName) {
      case 'help':
        return 'Usage: #help [command] - Display help information for a command';
      case 'list':
        return 'Usage: #list - List all active bots and their status';
      case 'stop':
        return 'Usage: #stop [bot_name] - Stop current activity of all bots or a specific bot';
      case 'goto':
        return 'Usage: #goto [bot_name] [x] [y] [z] - Command bot(s) to move to specific coordinates';
      case 'come':
        return 'Usage: #come [bot_name] - Command bot(s) to come to your location';
      case 'status':
        return 'Usage: #status [bot_name] - Display detailed status of all bots or a specific bot';
      default:
        return `Unknown command: ${commandName}`;
    }
  }
  
  /**
   * Handle the stop command
   * @returns {string} - Command response
   */
  handleStopCommand() {
    // Stop current task
    this.stopCurrentTask();
    return `${this.bot.username} stopped all activities`;
  }
  
  /**
   * Handle the goto command
   * @param {Array} args - Command arguments [x, y, z]
   * @returns {string} - Command response
   */
  handleGotoCommand(args) {
    if (args.length < 3) {
      return 'Usage: #goto [bot_name] [x] [y] [z]';
    }
    
    // Parse coordinates
    try {
      const x = parseInt(args[0], 10);
      const y = parseInt(args[1], 10);
      const z = parseInt(args[2], 10);
      
      if (isNaN(x) || isNaN(y) || isNaN(z)) {
        return 'Invalid coordinates. Usage: #goto [bot_name] [x] [y] [z]';
      }
      
      this.stopCurrentTask();
      this.goToPosition(x, y, z);
      
      return `${this.bot.username} is moving to coordinates [${x}, ${y}, ${z}]`;
    } catch (err) {
      logger.error(`Error in goto command: ${err.message}`);
      return `Error: ${err.message}`;
    }
  }
  
  /**
   * Handle the come command
   * @param {Array} args - Command arguments
   * @returns {string} - Command response
   */
  handleComeCommand(args) {
    // Find the player (owner) position
    const player = this.findOwner();
    
    if (!player) {
      return `${this.bot.username} cannot find the owner in the current world`;
    }
    
    // Move to player position
    this.stopCurrentTask();
    this.goToPosition(player.position.x, player.position.y, player.position.z);
    
    return `${this.bot.username} is coming to your location`;
  }
  
  /**
   * Handle the status command
   * @returns {string|Array} - Status information
   */
  handleStatusCommand() {
    const position = this.bot.entity.position;
    const health = this.bot.health;
    const food = this.bot.food;
    const experience = this.bot.experience;
    
    return [
      `${this.bot.username} (${this.type}) Status:`,
      `Position: [${Math.floor(position.x)}, ${Math.floor(position.y)}, ${Math.floor(position.z)}]`,
      `Health: ${Math.floor(health)}/20`,
      `Food: ${Math.floor(food)}/20`,
      `XP Level: ${Math.floor(experience.level)}`,
      `Current Task: ${this.currentTask || 'None'}`
    ];
  }
  
  /**
   * Find the bot owner in the world
   * @returns {Object|null} - Player object or null if not found
   */
  findOwner() {
    const ownerName = this.config.owner.minecraftUsername;
    return this.bot.players[ownerName]?.entity || null;
  }
  
  /**
   * Move to a specific position
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   * @param {number} z - Z coordinate
   */
  goToPosition(x, y, z) {
    const position = new Vec3(x, y, z);
    this.currentTask = `Moving to [${x}, ${y}, ${z}]`;
    
    // Create a goal to move to the target position
    const goal = new goals.GoalNear(position.x, position.y, position.z, 1);
    
    // Use pathfinder to navigate
    this.bot.pathfinder.setGoal(goal);
    
    // Listen for goal reached
    this.bot.pathfinder.once('goal_reached', () => {
      this.currentTask = null;
      logger.info(`${this.bot.username} reached destination [${x}, ${y}, ${z}]`);
    });
    
    // Listen for goal failed
    this.bot.pathfinder.once('path_update', (results) => {
      if (results.status === 'noPath') {
        this.currentTask = null;
        logger.warn(`${this.bot.username} could not find path to [${x}, ${y}, ${z}]`);
      }
    });
  }
  
  /**
   * Stop the current task
   */
  stopCurrentTask() {
    // Cancel pathfinding
    if (this.bot.pathfinder.isMoving()) {
      this.bot.pathfinder.setGoal(null);
    }
    
    // Reset task state
    this.currentTask = null;
    this.taskQueue = [];
    
    // Stop any auto activities
    this.bot.autoEat.disable();
    
    logger.info(`${this.bot.username} stopped all tasks`);
  }
  
  /**
   * Enable the bot
   */
  enable() {
    this.enabled = true;
    return `${this.bot.username} enabled`;
  }
  
  /**
   * Disable the bot
   */
  disable() {
    this.stopCurrentTask();
    this.enabled = false;
    return `${this.bot.username} disabled`;
  }
}

module.exports = BaseBot; 