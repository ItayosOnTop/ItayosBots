/**
 * Miner Bot - Specialized bot for resource gathering and processing
 */

const BaseBot = require('./baseBot');
const { logger } = require('../utils/logger');
const { goals } = require('mineflayer-pathfinder');
const collectBlock = require('mineflayer-collectblock').plugin;

class MinerBot extends BaseBot {
  /**
   * Create a new miner bot instance
   * @param {Object} bot - Mineflayer bot instance
   * @param {Object} typeConfig - Type-specific configuration
   * @param {Object} globalConfig - Global configuration
   * @param {Object} dataStore - Shared data store
   */
  constructor(bot, typeConfig, globalConfig, dataStore) {
    super(bot, typeConfig, globalConfig, dataStore);
    
    // Add collect block plugin
    bot.loadPlugin(collectBlock);
    
    // Mining-specific state
    this.state = {
      ...this.state,
      miningTarget: null,
      collectedItems: {},
      currentPattern: null,
    };
    
    // Configure mining behavior
    this.resourcePriorities = typeConfig.resourcePriorities || ['diamond', 'iron', 'gold', 'coal'];
    this.returnWhenInventoryFull = typeConfig.returnWhenInventoryFull !== false; // Default to true
    
    // Register event handlers
    this.setupMinerEvents();
  }
  
  /**
   * Set up miner-specific event handlers
   */
  setupMinerEvents() {
    // Handle inventory changes
    this.bot.on('playerCollect', (collector, collected) => {
      if (collector.username === this.bot.username) {
        const item = collected.getDroppedItem();
        if (item) {
          const itemName = item.name;
          this.state.collectedItems[itemName] = (this.state.collectedItems[itemName] || 0) + item.count;
          logger.debug(`${this.bot.username} collected ${item.count} ${itemName}`);
          
          // Share inventory data
          this.updateInventoryData();
        }
      }
    });
    
    // Check for full inventory
    this.bot.on('physicsTick', () => {
      // Every 5 seconds (100 ticks)
      if (this.bot.time.age % 100 === 0) {
        // If inventory is almost full and we have a mining target, consider returning
        if (this.returnWhenInventoryFull && 
            this.state.miningTarget && 
            this.bot.inventory.emptySlotCount() < 5) {
          logger.info(`${this.bot.username} inventory almost full, returning to storage`);
          this.returnToStorage();
        }
      }
    });
  }
  
  /**
   * Update inventory data in the shared data store
   */
  updateInventoryData() {
    const items = this.bot.inventory.items().map(item => ({
      name: item.name,
      count: item.count,
      stackSize: item.stackSize,
    }));
    
    this.dataStore.updateInventory(this.bot.username, items);
  }
  
  /**
   * Mine a specific block type
   * @param {string} blockType - Type of block to mine
   * @param {number} count - Number of blocks to mine
   * @returns {Promise} - Resolves when mining is complete
   */
  async mineBlock(blockType, count = 1) {
    try {
      this.state.miningTarget = { blockType, count };
      this.state.currentTask = `Mining ${count} ${blockType}`;
      
      logger.info(`${this.bot.username} starting to mine ${count} ${blockType}`);
      
      // Find the block
      const blocksByName = Object.entries(this.bot.registry.blocksByName)
        .filter(([name]) => name.includes(blockType))
        .map(([_, block]) => block.id);
      
      if (blocksByName.length === 0) {
        throw new Error(`Unknown block type: ${blockType}`);
      }
      
      // Track how many we've mined
      let mined = 0;
      
      while (mined < count) {
        // Find blocks within reasonable distance
        const blocks = this.bot.findBlocks({
          matching: blocksByName,
          maxDistance: 64,
          count: 10,
        });
        
        if (blocks.length === 0) {
          this.bot.chat(`I couldn't find any ${blockType} nearby`);
          break;
        }
        
        // Mine each block
        for (const blockPos of blocks) {
          try {
            // Check if we already reached the target
            if (mined >= count) break;
            
            // Go to the block (with some distance to mine it)
            const block = this.bot.blockAt(blockPos);
            if (!block) continue;
            
            // Use collectBlock for easier mining
            await this.bot.collectBlock.collect(block);
            
            // Increment counter
            mined++;
            
            // Update task status
            this.state.currentTask = `Mining ${blockType} (${mined}/${count})`;
            
            // Check if inventory is getting full
            if (this.returnWhenInventoryFull && this.bot.inventory.emptySlotCount() < 5) {
              await this.returnToStorage();
            }
            
          } catch (err) {
            logger.warn(`Error mining block at ${blockPos.x},${blockPos.y},${blockPos.z}: ${err.message}`);
            // Continue with next block
          }
        }
        
        // If we didn't find enough, move to a new area
        if (mined < count) {
          // Move in a random direction to find more blocks
          const randomOffset = (Math.random() * 20) - 10;
          const pos = this.bot.entity.position;
          await this.goToLocation({ 
            x: pos.x + randomOffset, 
            y: pos.y, 
            z: pos.z + randomOffset 
          });
        }
      }
      
      this.bot.chat(`Finished mining ${mined} ${blockType}`);
      this.state.miningTarget = null;
      this.state.currentTask = null;
      
      return mined;
    } catch (err) {
      logger.error(`Mining error:`, err);
      this.state.miningTarget = null;
      this.state.currentTask = null;
      throw err;
    }
  }
  
  /**
   * Return to storage location to deposit items
   */
  async returnToStorage() {
    try {
      const storage = this.globalConfig.storage?.chestLocations?.valuables;
      
      if (!storage) {
        logger.warn(`No storage location configured for ${this.bot.username}`);
        return false;
      }
      
      // Remember original task
      const originalTask = this.state.currentTask;
      this.state.currentTask = 'Returning to storage';
      
      // Go to storage
      await this.goToLocation(storage);
      
      // Look for a chest
      const chestBlock = this.bot.findBlock({
        matching: block => block.name.includes('chest'),
        maxDistance: 5,
      });
      
      if (!chestBlock) {
        logger.warn(`${this.bot.username} couldn't find a chest at storage location`);
        this.state.currentTask = originalTask;
        return false;
      }
      
      // Open the chest
      const chest = await this.bot.openChest(chestBlock);
      
      // Deposit valuable items (ores, ingots, etc.)
      const valuableItems = this.bot.inventory.items().filter(item => {
        return item.name.includes('ore') || 
               item.name.includes('ingot') || 
               this.resourcePriorities.some(r => item.name.includes(r));
      });
      
      // Deposit items one by one
      for (const item of valuableItems) {
        await chest.deposit(item.type, null, item.count);
        logger.info(`${this.bot.username} deposited ${item.count} ${item.name}`);
      }
      
      // Close the chest
      await chest.close();
      
      // Restore original task
      this.state.currentTask = originalTask;
      return true;
    } catch (err) {
      logger.error(`Error returning to storage:`, err);
      return false;
    }
  }
  
  /**
   * Get the current status of the miner bot
   * @returns {Object} - Bot status information
   */
  getStatus() {
    return {
      ...super.getStatus(),
      type: 'miner',
      miningTarget: this.state.miningTarget,
      collectedItems: this.state.collectedItems,
    };
  }
  
  /**
   * Handle a command directed at this miner bot
   * @param {string} command - Command name
   * @param {Array} args - Command arguments
   * @returns {*} - Command response
   */
  handleCommand(command, args) {
    // Check for miner-specific commands
    switch (command) {
      case 'mine':
        if (args.length >= 1) {
          const blockType = args[0];
          const count = args.length >= 2 ? parseInt(args[1]) : 1;
          
          if (args.length >= 2 && isNaN(count)) {
            return 'Invalid count. Usage: mine <blockType> [count]';
          }
          
          this.mineBlock(blockType, count)
            .then((mined) => {
              this.bot.chat(`Mined ${mined} ${blockType}`);
            })
            .catch((err) => {
              this.bot.chat(`Failed to mine ${blockType}: ${err.message}`);
            });
          
          return `Started mining ${count} ${blockType}`;
        } else {
          return 'Invalid arguments. Usage: mine <blockType> [count]';
        }
      
      case 'store':
        this.returnToStorage()
          .then((success) => {
            if (success) {
              this.bot.chat('Items stored successfully');
            } else {
              this.bot.chat('Failed to store items');
            }
          })
          .catch((err) => {
            this.bot.chat(`Error storing items: ${err.message}`);
          });
        
        return 'Returning to storage to deposit items';
      
      default:
        // If not a miner command, try base commands
        return super.handleCommand(command, args);
    }
  }
}

module.exports = MinerBot; 