/**
 * BaseBot - Core Bot Class
 * 
 * This class provides the foundation for all specialized bots,
 * implementing core functionality shared across all bot types.
 */

const mineflayer = require('mineflayer');
const pathfinder = require('mineflayer-pathfinder').pathfinder;
const Movements = require('mineflayer-pathfinder').Movements;
const { GoalNear, GoalBlock, GoalXZ, GoalY } = require('mineflayer-pathfinder').goals;
const autoeat = require('mineflayer-auto-eat');
const pvp = require('mineflayer-pvp').plugin;
const collectBlock = require('mineflayer-collectblock').plugin;
const armorManager = require('mineflayer-armor-manager');
const toolPlugin = require('mineflayer-tool').plugin;
const totemPlugin = require('mineflayer-totem-auto');

const mainConfig = require('../../../config');
const EventEmitter = require('events');

class BaseBot extends EventEmitter {
  /**
   * Create a new BaseBot instance
   * @param {Object} options - Configuration options for the bot
   * @param {string} options.username - Bot username
   * @param {string} options.type - Bot type (miner, builder, protector)
   * @param {Object} options.server - Server configuration
   * @param {string} options.server.host - Server hostname
   * @param {number} options.server.port - Server port
   * @param {string} options.server.version - Minecraft version
   */
  constructor(options) {
    super();
    
    this.username = options.username;
    this.type = options.type;
    this.server = options.server || mainConfig.server;
    this.active = false;
    this.currentTask = null;
    
    // Initialize logger
    this.log = this._setupLogger();
    
    // Bind methods to avoid 'this' context issues
    this.start = this.start.bind(this);
    this.stop = this.stop.bind(this);
    this._handleError = this._handleError.bind(this);
    this._setupEventHandlers = this._setupEventHandlers.bind(this);
    
    this.log.info(`BaseBot instance created: ${this.username} (${this.type})`);
  }
  
  /**
   * Start the bot and connect to the server
   * @returns {Promise} - Resolves when bot is logged in and initialized
   */
  async start() {
    try {
      this.log.info(`Starting bot ${this.username}`);
      
      // Create the bot instance
      this.bot = mineflayer.createBot({
        host: this.server.host,
        port: this.server.port,
        username: this.username,
        version: this.server.version
      });
      
      // Wait for spawn event
      await new Promise((resolve, reject) => {
        this.bot.once('spawn', () => {
          this.log.info(`Bot ${this.username} spawned in the world`);
          resolve();
        });
        
        this.bot.once('error', (error) => {
          this.log.error(`Failed to spawn bot: ${error.message}`);
          reject(error);
        });
      });
      
      // Set up plugins and event handlers
      this._setupPlugins();
      this._setupEventHandlers();
      
      this.active = true;
      this.emit('started', { username: this.username, type: this.type });
      
      return true;
    } catch (error) {
      this._handleError('Failed to start bot', error);
      return false;
    }
  }
  
  /**
   * Stop the bot and disconnect from the server
   */
  stop() {
    try {
      this.log.info(`Stopping bot ${this.username}`);
      
      if (this.bot) {
        this.bot.quit();
        this.bot = null;
      }
      
      this.active = false;
      this.currentTask = null;
      
      this.emit('stopped', { username: this.username });
      
      return true;
    } catch (error) {
      this._handleError('Failed to stop bot', error);
      return false;
    }
  }
  
  /**
   * Get current bot status
   * @returns {Object} - Status information
   */
  getStatus() {
    if (!this.bot) {
      return {
        username: this.username,
        type: this.type,
        active: false,
        status: 'offline'
      };
    }
    
    return {
      username: this.username,
      type: this.type,
      active: this.active,
      status: this.currentTask ? 'busy' : 'idle',
      health: this.bot.health,
      food: this.bot.food,
      position: this.bot.entity.position,
      inventory: this._getInventoryStatus(),
      currentTask: this.currentTask
    };
  }
  
  /**
   * Navigate to specific coordinates
   * @param {Object} position - Target position
   * @param {number} position.x - X coordinate
   * @param {number} position.y - Y coordinate
   * @param {number} position.z - Z coordinate
   * @param {number} [range=2] - How close to get to the target (blocks)
   * @returns {Promise} - Resolves when navigation is complete
   */
  async goTo(position, range = 2) {
    if (!this.bot || !this.active) {
      throw new Error('Bot is not active');
    }
    
    try {
      this.currentTask = `Moving to ${position.x}, ${position.y}, ${position.z}`;
      this.log.info(this.currentTask);
      
      const goal = new GoalNear(position.x, position.y, position.z, range);
      await this.bot.pathfinder.goto(goal);
      
      this.currentTask = null;
      return true;
    } catch (error) {
      this._handleError('Navigation failed', error);
      this.currentTask = null;
      return false;
    }
  }
  
  /**
   * Make the bot chat a message
   * @param {string} message - Message to send
   */
  chat(message) {
    if (this.bot && this.active) {
      this.bot.chat(message);
      this.log.info(`Chat: ${message}`);
    }
  }
  
  /**
   * Handle bot errors
   * @private
   * @param {string} context - Error context
   * @param {Error} error - Error object
   */
  _handleError(context, error) {
    this.log.error(`${context}: ${error.message}`);
    
    // Emit error event with details
    this.emit('error', {
      username: this.username,
      context: context,
      error: error.message,
      stack: error.stack
    });
  }
  
  /**
   * Set up mineflayer plugins
   * @private
   */
  _setupPlugins() {
    // Pathfinder
    this.bot.loadPlugin(pathfinder);
    const mcData = require('minecraft-data')(this.bot.version);
    const movements = new Movements(this.bot, mcData);
    
    // Adjust movement settings
    movements.canDig = true;
    movements.scafoldingBlocks = [];
    
    this.bot.pathfinder.setMovements(movements);
    
    // Auto eat
    this.bot.loadPlugin(autoeat);
    this.bot.autoEat.options = {
      priority: 'foodPoints',
      startAt: 14,
      bannedFood: []
    };
    
    // PVP
    this.bot.loadPlugin(pvp);
    
    // Block collection
    this.bot.loadPlugin(collectBlock);
    
    // Armor manager
    this.bot.loadPlugin(armorManager);
    
    // Tool plugin
    this.bot.loadPlugin(toolPlugin);
    
    // Totem plugin
    this.bot.loadPlugin(totemPlugin);
    
    this.log.info('All plugins loaded successfully');
  }
  
  /**
   * Set up event handlers for the bot
   * @private
   */
  _setupEventHandlers() {
    if (!this.bot) return;
    
    // Handle chat messages
    this.bot.on('chat', (username, message) => {
      if (username === this.bot.username) return;
      
      this.log.info(`Chat from ${username}: ${message}`);
      this.emit('chat', { username, message });
      
      // Command handling will be implemented later
    });
    
    // Handle server connection events
    this.bot.on('kicked', (reason) => {
      this.log.warn(`Bot was kicked: ${reason}`);
      this.active = false;
      this.emit('kicked', { reason });
    });
    
    this.bot.on('error', (error) => {
      this._handleError('Bot error', error);
    });
    
    this.bot.on('death', () => {
      this.log.warn(`Bot died at ${JSON.stringify(this.bot.entity.position)}`);
      this.emit('death', { position: this.bot.entity.position });
    });
    
    // Handle health and hunger
    this.bot.on('health', () => {
      if (this.bot.health <= 5) {
        this.log.warn(`Low health: ${this.bot.health}`);
        this.emit('lowHealth', { health: this.bot.health });
      }
    });
    
    // Handle inventory
    this.bot.inventory.on('updateSlot', (slot, oldItem, newItem) => {
      if (oldItem?.name !== newItem?.name) {
        this.log.debug(`Inventory update: ${oldItem?.name || 'empty'} -> ${newItem?.name || 'empty'}`);
      }
    });
  }
  
  /**
   * Get inventory status (space used, etc)
   * @private
   * @returns {Object} - Inventory status
   */
  _getInventoryStatus() {
    if (!this.bot || !this.bot.inventory) {
      return { full: 0, slots: { total: 0, used: 0, free: 0 } };
    }
    
    const items = this.bot.inventory.items();
    const usedSlots = items.length;
    const totalSlots = 36; // Inventory slots (excluding armor and offhand)
    const freeSlots = totalSlots - usedSlots;
    const fullPercentage = Math.floor((usedSlots / totalSlots) * 100);
    
    return {
      full: fullPercentage,
      slots: {
        total: totalSlots,
        used: usedSlots,
        free: freeSlots
      },
      items: items.map(item => ({
        name: item.name,
        count: item.count
      }))
    };
  }
  
  /**
   * Set up the logger
   * @private
   * @returns {Object} - Logger object
   */
  _setupLogger() {
    return {
      info: (message) => console.log(`[${this.username}] INFO: ${message}`),
      warn: (message) => console.warn(`[${this.username}] WARN: ${message}`),
      error: (message) => console.error(`[${this.username}] ERROR: ${message}`),
      debug: (message) => console.debug(`[${this.username}] DEBUG: ${message}`)
    };
  }
}

module.exports = BaseBot; 