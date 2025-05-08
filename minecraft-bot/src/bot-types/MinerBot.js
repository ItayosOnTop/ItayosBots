/**
 * MinerBot - Specialized bot for mining and resource gathering
 */

const BaseBot = require('./BaseBot');
const Vec3 = require('vec3');
const { logger } = require('../utils/logger');

class MinerBot extends BaseBot {
  /**
   * Create a new MinerBot instance
   * @param {Object} bot - Mineflayer bot instance
   * @param {Object} config - Global configuration
   * @param {Object} dataStore - Shared data store
   */
  constructor(bot, config, dataStore) {
    super(bot, config, dataStore);
    this.type = 'miner';
    this.miningTarget = null;
    this.collectedItems = {};
    this.miningArea = null;
    this.isMining = false;
    
    // Initialize miner-specific event handlers
    this.setupMinerEvents();
  }
  
  /**
   * Set up miner-specific event handlers
   */
  setupMinerEvents() {
    // Handle collected items
    this.bot.on('playerCollect', (collector, collected) => {
      if (collector.username === this.bot.username) {
        const item = collected.metadata[10];
        if (item) {
          const itemName = item.displayName;
          this.collectedItems[itemName] = (this.collectedItems[itemName] || 0) + 1;
          logger.info(`${this.bot.username} collected ${itemName}`);
        }
      }
    });
  }
  
  /**
   * Handle miner-specific commands
   * @param {string} command - Command name
   * @param {Array} args - Command arguments
   * @returns {string|null} - Command response
   */
  handleCommand(command, args) {
    switch (command) {
      case 'mine':
        return this.handleMineCommand(args);
      case 'collect':
        return this.handleCollectCommand(args);
      case 'store':
        return this.handleStoreCommand(args);
      case 'craft':
        return this.handleCraftCommand(args);
      case 'findore':
        return this.handleFindOreCommand(args);
      case 'minearea':
        return this.handleMineAreaCommand(args);
      default:
        return super.handleCommand(command, args);
    }
  }
  
  /**
   * Handle the mine command
   * @param {Array} args - Command arguments
   * @returns {string} - Command response
   */
  handleMineCommand(args) {
    if (args.length < 1) {
      return 'Usage: #mine [block_type] [count]';
    }
    
    const blockType = args[0];
    const count = args.length > 1 ? parseInt(args[1], 10) : 64;
    
    if (args.length > 1 && (isNaN(count) || count <= 0)) {
      return 'Invalid count. Usage: #mine [block_type] [count]';
    }
    
    this.miningTarget = { blockType, count };
    this.currentTask = `Mining ${blockType} (${count})`;
    
    return `Started mining ${blockType}, target: ${count}`;
  }
  
  /**
   * Handle the collect command
   * @param {Array} args - Command arguments
   * @returns {string} - Command response
   */
  handleCollectCommand(args) {
    if (args.length < 1) {
      return 'Usage: #collect [item_type] [count]';
    }
    
    const itemType = args[0];
    const count = args.length > 1 ? parseInt(args[1], 10) : 64;
    
    if (args.length > 1 && (isNaN(count) || count <= 0)) {
      return 'Invalid count. Usage: #collect [item_type] [count]';
    }
    
    this.currentTask = `Collecting ${itemType} (${count})`;
    
    return `Started collecting ${itemType}, target: ${count}`;
  }
  
  /**
   * Handle the store command
   * @param {Array} args - Command arguments
   * @returns {string} - Command response
   */
  handleStoreCommand(args) {
    if (args.length < 1) {
      return 'Usage: #store [item] [chest_coords/name]';
    }
    
    const item = args[0];
    const target = args.length > 1 ? args[1] : 'nearest_chest';
    
    this.currentTask = `Storing ${item} in ${target}`;
    
    return `Storing ${item} in ${target}`;
  }
  
  /**
   * Handle the craft command
   * @param {Array} args - Command arguments
   * @returns {string} - Command response
   */
  handleCraftCommand(args) {
    if (args.length < 1) {
      return 'Usage: #craft [item] [count]';
    }
    
    const item = args[0];
    const count = args.length > 1 ? parseInt(args[1], 10) : 1;
    
    if (args.length > 1 && (isNaN(count) || count <= 0)) {
      return 'Invalid count. Usage: #craft [item] [count]';
    }
    
    this.currentTask = `Crafting ${item} (${count})`;
    
    return `Crafting ${item}, quantity: ${count}`;
  }
  
  /**
   * Handle the findore command
   * @param {Array} args - Command arguments
   * @returns {string} - Command response
   */
  handleFindOreCommand(args) {
    if (args.length < 1) {
      return 'Usage: #findore [ore_type]';
    }
    
    const oreType = args[0];
    this.currentTask = `Finding ${oreType} ore`;
    
    return `Searching for ${oreType} ore`;
  }
  
  /**
   * Handle the minearea command
   * @param {Array} args - Command arguments
   * @returns {string} - Command response
   */
  handleMineAreaCommand(args) {
    if (args.length < 6) {
      return 'Usage: #minearea [x1] [y1] [z1] [x2] [y2] [z2]';
    }
    
    try {
      const x1 = parseInt(args[0], 10);
      const y1 = parseInt(args[1], 10);
      const z1 = parseInt(args[2], 10);
      const x2 = parseInt(args[3], 10);
      const y2 = parseInt(args[4], 10);
      const z2 = parseInt(args[5], 10);
      
      if (isNaN(x1) || isNaN(y1) || isNaN(z1) || isNaN(x2) || isNaN(y2) || isNaN(z2)) {
        return 'Invalid coordinates. Usage: #minearea [x1] [y1] [z1] [x2] [y2] [z2]';
      }
      
      this.miningArea = { x1, y1, z1, x2, y2, z2 };
      this.currentTask = `Mining area (${x1},${y1},${z1}) to (${x2},${y2},${z2})`;
      
      return `Started mining area from (${x1},${y1},${z1}) to (${x2},${y2},${z2})`;
    } catch (err) {
      logger.error('Error in minearea command:', err);
      return `Error: ${err.message}`;
    }
  }
  
  /**
   * Start the miner bot
   * @returns {boolean} - Success status
   */
  async start() {
    this.isActive = true;
    this.currentTask = 'Miner bot activated';
    return true;
  }
  
  getTypeSpecificHelp() {
    return [
      `\`${this.config.system.commandPrefix}mine [block_type] [count]\` - Mine specific blocks`,
      `\`${this.config.system.commandPrefix}collect [item_type] [count]\` - Collect specific items`,
      `\`${this.config.system.commandPrefix}store [item] [chest_name]\` - Store items in chest`,
      `\`${this.config.system.commandPrefix}craft [item] [count]\` - Craft specific items`,
      `\`${this.config.system.commandPrefix}findore [ore_type]\` - Locate nearest ore`,
      `\`${this.config.system.commandPrefix}minearea [x1] [y1] [z1] [x2] [y2] [z2]\` - Mine area`
    ];
  }
  
  getTypeSpecificCommandHelp() {
    return {
      'mine': `Usage: ${this.config.system.commandPrefix}mine [block_type] [count]\nMine specific blocks until count reached`,
      'collect': `Usage: ${this.config.system.commandPrefix}collect [item_type] [count]\nCollect specific items (plants, drops)`,
      'store': `Usage: ${this.config.system.commandPrefix}store [item] [chest_coords/name]\nStore items in specific container`,
      'craft': `Usage: ${this.config.system.commandPrefix}craft [item] [count]\nCraft specific item`,
      'findore': `Usage: ${this.config.system.commandPrefix}findore [ore_type]\nLocate nearest ore of specified type`,
      'minearea': `Usage: ${this.config.system.commandPrefix}minearea [x1] [y1] [z1] [x2] [y2] [z2]\nMine all blocks in an area`
    };
  }
}

module.exports = MinerBot; 