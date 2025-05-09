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
const Vec3 = require('vec3').Vec3;

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
   * Make the bot look at a specific position or entity
   * @param {Object|Entity} target - Target position or entity to look at 
   * @returns {Promise<boolean>} - Whether the look operation was successful
   */
  async lookAt(target) {
    if (!this.bot || !this.active) {
      throw new Error('Bot is not active');
    }
    
    try {
      let position;
      
      if (target.position) {
        // Target is an entity with a position property
        position = target.position;
        // Store the entity for continuous tracking
        this.lookingAtEntity = target;
      } else if (target.x !== undefined && target.y !== undefined && target.z !== undefined) {
        // Target is a position object with x, y, z coordinates
        position = target;
        // Set fixed position for continuous tracking
        this.lookingAtPos = new Vec3(position.x, position.y, position.z);
        this.lookingAtEntity = null;
      } else {
        throw new Error('Invalid target to look at');
      }
      
      // Create Vec3 from position if needed
      if (!(position instanceof Vec3)) {
        position = new Vec3(position.x, position.y, position.z);
      }
      
      // Look at position
      await this.bot.lookAt(position);
      
      this.log.info(`Looking at ${position.x.toFixed(1)}, ${position.y.toFixed(1)}, ${position.z.toFixed(1)}`);
      return true;
    } catch (error) {
      this._handleError('Failed to look at target', error);
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
    try {
      // Safe plugin loading helper
      const safeLoadPlugin = (plugin, name) => {
        try {
          if (typeof plugin === 'function') {
            this.bot.loadPlugin(plugin);
            return true;
          } else if (plugin && typeof plugin.plugin === 'function') {
            this.bot.loadPlugin(plugin.plugin);
            return true;
          } else {
            this.log.warn(`${name} plugin is not a function, skipping`);
            return false;
          }
        } catch (err) {
          this.log.warn(`Error loading ${name} plugin: ${err.message}`);
          return false;
        }
      };
      
      // Pathfinder
      safeLoadPlugin(pathfinder, 'Pathfinder');
      try {
        const mcData = require('minecraft-data')(this.bot.version);
        const movements = new Movements(this.bot, mcData);
        
        // Adjust movement settings
        movements.canDig = true;
        movements.scafoldingBlocks = [];
        
        if (this.bot.pathfinder) {
          this.bot.pathfinder.setMovements(movements);
        } else {
          this.log.warn('Pathfinder not properly initialized');
        }
      } catch (err) {
        this.log.warn(`Error configuring pathfinder: ${err.message}`);
      }
      
      // Auto eat
      safeLoadPlugin(autoeat, 'AutoEat');
      if (this.bot.autoEat) {
        this.bot.autoEat.options = {
          priority: 'foodPoints',
          startAt: 14,
          bannedFood: []
        };
      }
      
      // PVP
      safeLoadPlugin(pvp, 'PVP');
      
      // Block collection
      safeLoadPlugin(collectBlock, 'CollectBlock');
      
      // Armor manager
      safeLoadPlugin(armorManager, 'ArmorManager');
      
      // Tool plugin
      safeLoadPlugin(toolPlugin, 'Tool');
      
      // Totem plugin
      safeLoadPlugin(totemPlugin, 'Totem');
      
      this.log.info('Plugins loaded successfully');
    } catch (error) {
      this._handleError('Failed to set up plugins', error);
    }
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
      
      // Look at player who sent the message
      this._lookAtPlayerWhoSentMessage(username);
      
      // Check if the message is directed to this bot (contains the bot's name)
      if (message.toLowerCase().includes(this.username.toLowerCase())) {
        this.chat(`I'm here, ${username}! Type ${mainConfig.system.commandPrefix}help for commands.`);
      }
      
      // Process commands if they start with the prefix
      const prefix = mainConfig.system.commandPrefix;
      if (message.startsWith(prefix)) {
        this._handleCommand(username, message.slice(prefix.length));
      }
    });
    
    // Handle server connection events
    this.bot.on('kicked', (reason, loggedIn) => {
      try {
        // Properly log the kicked reason as string, handling JSON objects
        let readableReason = reason;
        if (typeof reason === 'object') {
          readableReason = JSON.stringify(reason);
        }
        this.log.warn(`Bot was kicked: ${readableReason}`);
        this.active = false;
        this.emit('kicked', { reason: readableReason });
      } catch (error) {
        this.log.error(`Error handling kicked event: ${error.message}`);
      }
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
    
    // Setup continuous looking with physicsTick
    this.bot.on('physicsTick', () => {
      try {
        // Process entity tracking for looking
        if (this.lookingAtEntity && this.lookingAtEntity.position) {
          this.bot.lookAt(this.lookingAtEntity.position).catch(err => {
            this.log.debug(`Look error: ${err.message}`);
          });
        } else if (this.lookingAtPos) {
          this.bot.lookAt(this.lookingAtPos).catch(err => {
            this.log.debug(`Look error: ${err.message}`);
          });
        }
      } catch (error) {
        // Don't let errors in physicsTick crash the bot
        this.log.debug(`Error in physicsTick: ${error.message}`);
      }
    });
  }

  /**
   * Look at player who sent a message
   * @private
   * @param {string} username - Username of the player
   */
  async _lookAtPlayerWhoSentMessage(username) {
    if (!this.bot || !this.active) return;
    
    try {
      const player = this.bot.players[username];
      if (player && player.entity && player.entity.position) {
        await this.lookAt(player.entity);
      }
    } catch (error) {
      // Silently handle error, looking at players is a nice-to-have
      this.log.debug(`Could not look at player ${username}: ${error.message}`);
    }
  }

  /**
   * Handle a command sent by a player
   * @private
   * @param {string} username - Username of the player who sent the command
   * @param {string} commandString - Command string (without prefix)
   */
  _handleCommand(username, commandString) {
    // Base implementation - subclasses will override with specific command handling
    const args = commandString.trim().split(/\s+/);
    const command = args.shift().toLowerCase();
    
    this.log.info(`Command received from ${username}: ${command} ${args.join(' ')}`);
    
    // Check if the bot-specific command handler exists
    if (typeof this.handleCommand === 'function') {
      this.handleCommand(username, command, args);
    } else {
      // Basic commands all bots should respond to
      switch (command) {
        case 'status':
          this._respondWithStatus(username);
          break;
        case 'come':
          this._goToPlayer(username);
          break;
        case 'stop':
          this._stopCurrentTask(username);
          break;
        case 'look':
          this._handleLookCommand(username, args);
          break;
        default:
          // Unknown command for base bot
          if (username === this.bot.players[username]?.username) {
            this.chat(`I don't understand that command. Try ${mainConfig.system.commandPrefix}help`);
          }
      }
    }
  }

  /**
   * Handle the look command
   * @private
   * @param {string} username - Username of the player who sent the command
   * @param {Array<string>} args - Command arguments
   */
  async _handleLookCommand(username, args) {
    if (args.length === 0) {
      // Look at the player who sent the command
      const player = this.bot.players[username];
      if (player && player.entity) {
        await this.lookAt(player.entity);
        this.chat(`Looking at you, ${username}!`);
      } else {
        this.chat(`I'm sorry, I can't see you right now.`);
      }
    } else {
      // Look at a specific position
      const position = args.map(Number);
      await this.lookAt({ x: position[0], y: position[1], z: position[2] });
      this.chat(`Looking at position: ${position.join(', ')}`);
    }
  }
}

module.exports = BaseBot;