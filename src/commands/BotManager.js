/**
 * BotManager - Manages bot instances
 * 
 * This class handles creating, tracking, and managing all bot instances
 * in the system, providing a central point of control.
 */

const EventEmitter = require('events');
const mainConfig = require('../../config');

class BotManager extends EventEmitter {
  /**
   * Create a new BotManager
   */
  constructor() {
    super();
    this.bots = new Map();
    this.botFactories = new Map();
  }
  
  /**
   * Register a bot factory for a specific bot type
   * @param {string} type - Bot type
   * @param {Function} factory - Factory function to create bots of this type
   */
  registerBotFactory(type, factory) {
    if (typeof factory !== 'function') {
      throw new Error(`Bot factory for type ${type} must be a function`);
    }
    
    this.botFactories.set(type.toLowerCase(), factory);
    return this;
  }
  
  /**
   * Create a new bot instance
   * @param {Object} options - Bot creation options
   * @param {string} options.username - Bot username
   * @param {string} options.type - Bot type
   * @param {Object} [options.server] - Server configuration (overrides default)
   * @returns {Promise<BaseBot>} - Created bot instance
   */
  async createBot(options) {
    const { username, type, server } = options;
    
    // Check if bot with this name already exists
    if (this.bots.has(username)) {
      throw new Error(`Bot with name ${username} already exists`);
    }
    
    // Get factory for this bot type
    const factory = this.botFactories.get(type.toLowerCase());
    
    if (!factory) {
      throw new Error(`No bot factory registered for type ${type}`);
    }
    
    try {
      // Create bot instance
      const bot = factory({
        username,
        type,
        server: server || mainConfig.server
      });
      
      // Set up event handlers
      this._setupBotEventHandlers(bot);
      
      // Start the bot
      const success = await bot.start();
      
      if (!success) {
        throw new Error(`Failed to start bot ${username}`);
      }
      
      // Store the bot
      this.bots.set(username, bot);
      
      // Emit event
      this.emit('botCreated', { username, type });
      
      return bot;
    } catch (error) {
      this.emit('error', {
        context: `Failed to create bot ${username}`,
        error: error.message
      });
      
      throw error;
    }
  }
  
  /**
   * Get a bot by name
   * @param {string} botName - Bot name
   * @returns {BaseBot|null} - Bot instance or null if not found
   */
  getBot(botName) {
    return this.bots.get(botName) || null;
  }
  
  /**
   * List all bots, optionally filtered by type
   * @param {string} [type] - Bot type to filter by
   * @returns {Array<BaseBot>} - Array of bot instances
   */
  listBots(type) {
    const bots = Array.from(this.bots.values());
    
    if (type) {
      return bots.filter(bot => bot.type.toLowerCase() === type.toLowerCase());
    }
    
    return bots;
  }
  
  /**
   * Stop a specific bot
   * @param {string} botName - Bot name
   * @returns {Promise<boolean>} - Whether stop was successful
   */
  async stopBot(botName) {
    const bot = this.bots.get(botName);
    
    if (!bot) {
      return false;
    }
    
    try {
      const success = bot.stop();
      
      if (success) {
        this.bots.delete(botName);
        this.emit('botStopped', { username: botName });
      }
      
      return success;
    } catch (error) {
      this.emit('error', {
        context: `Failed to stop bot ${botName}`,
        error: error.message
      });
      
      return false;
    }
  }
  
  /**
   * Stop all bots
   * @returns {Promise<number>} - Number of bots successfully stopped
   */
  async stopAllBots() {
    const botNames = Array.from(this.bots.keys());
    let stoppedCount = 0;
    
    for (const botName of botNames) {
      const success = await this.stopBot(botName);
      
      if (success) {
        stoppedCount++;
      }
    }
    
    return stoppedCount;
  }
  
  /**
   * Set up event handlers for a bot
   * @private
   * @param {BaseBot} bot - Bot instance
   */
  _setupBotEventHandlers(bot) {
    // Forward important events
    bot.on('error', (error) => {
      this.emit('botError', {
        username: bot.username,
        error: error
      });
    });
    
    bot.on('kicked', (reason) => {
      this.emit('botKicked', {
        username: bot.username,
        reason: reason
      });
      
      // Remove from tracked bots
      this.bots.delete(bot.username);
    });
    
    bot.on('death', (data) => {
      this.emit('botDeath', {
        username: bot.username,
        position: data.position
      });
    });
    
    bot.on('stopped', () => {
      this.bots.delete(bot.username);
    });
  }
}

module.exports = BotManager; 