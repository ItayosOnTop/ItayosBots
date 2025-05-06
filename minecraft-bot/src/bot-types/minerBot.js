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
   * @param {string} [targetBot] - Optional target bot username
   * @returns {*} - Command response or null if command not applicable to this bot
   */
  handleCommand(command, args, targetBot = null) {
    // First check global commands via parent class
    const baseResponse = super.handleCommand(command, args, targetBot);
    if (baseResponse !== null) {
      return baseResponse;
    }
    
    // If a target is specified and it's not this bot, don't respond
    if (targetBot && targetBot !== this.bot.username) {
      return null;
    }

    // Miner-specific commands
    const minerCommands = ['mine', 'store', 'minearea'];
    
    // If not a miner command, don't respond
    if (!minerCommands.includes(command)) {
      return null;
    }

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
      
      case 'minearea':
        if (args.length >= 6) {
          const x1 = parseInt(args[0]);
          const y1 = parseInt(args[1]);
          const z1 = parseInt(args[2]);
          const x2 = parseInt(args[3]);
          const y2 = parseInt(args[4]);
          const z2 = parseInt(args[5]);
          
          if ([x1, y1, z1, x2, y2, z2].some(isNaN)) {
            return 'Invalid coordinates. Usage: minearea <x1> <y1> <z1> <x2> <y2> <z2>';
          }
          
          this.mineArea({ x: x1, y: y1, z: z1 }, { x: x2, y: y2, z: z2 })
            .then((count) => {
              this.bot.chat(`Mined ${count} blocks in the specified area`);
            })
            .catch((err) => {
              this.bot.chat(`Failed to mine area: ${err.message}`);
            });
          
          return `Started mining area from (${x1},${y1},${z1}) to (${x2},${y2},${z2})`;
        } else {
          return 'Invalid arguments. Usage: minearea <x1> <y1> <z1> <x2> <y2> <z2>';
        }
        
      default:
        return null;
    }
  }

  /**
   * Collect specific items like plants or drops
   * @param {string} itemType - Type of item to collect
   * @param {number} count - Number of items to collect
   * @returns {Promise<number>} - Number of items collected
   */
  async collectItem(itemType, count = 1) {
    try {
      this.state.currentTask = `Collecting ${count} ${itemType}`;
      logger.info(`${this.bot.username} starting to collect ${count} ${itemType}`);
      
      // Define a list of items that can be collected (crops, flowers, etc.)
      const collectableItems = {
        'wheat': ['wheat_seeds', 'wheat'],
        'carrot': ['carrot', 'carrots'],
        'potato': ['potato', 'potatoes'],
        'beetroot': ['beetroot', 'beetroot_seeds'],
        'melon': ['melon_slice'],
        'pumpkin': ['pumpkin'],
        'sugarcane': ['sugar_cane'],
        'flower': ['poppy', 'dandelion', 'blue_orchid', 'allium', 'azure_bluet', 'red_tulip', 'orange_tulip', 'white_tulip', 'pink_tulip', 'oxeye_daisy', 'cornflower', 'lily_of_the_valley', 'wither_rose', 'sunflower', 'lilac', 'rose_bush', 'peony'],
      };
      
      // Find matching items
      const itemsToCollect = collectableItems[itemType.toLowerCase()] || [itemType.toLowerCase()];
      let collected = 0;
      
      while (collected < count) {
        // Look for blocks to collect
        const blockToCollect = this.bot.findBlock({
          matching: (block) => {
            return itemsToCollect.some(item => block.name.includes(item));
          },
          maxDistance: 64,
        });
        
        if (!blockToCollect) {
          logger.info(`${this.bot.username} couldn't find any more ${itemType} to collect`);
          break;
        }
        
        // Go to the block
        await this.goToLocation({ x: blockToCollect.position.x, y: blockToCollect.position.y, z: blockToCollect.position.z }, 2);
        
        // Try to harvest/collect the block
        try {
          await this.bot.dig(blockToCollect);
          collected++;
          this.state.currentTask = `Collecting ${itemType} (${collected}/${count})`;
        } catch (error) {
          logger.warn(`${this.bot.username} couldn't harvest ${blockToCollect.name}: ${error.message}`);
        }
        
        // Check if inventory is getting full
        if (this.returnWhenInventoryFull && this.bot.inventory.emptySlotCount() < 5) {
          await this.returnToStorage();
        }
      }
      
      this.state.currentTask = null;
      return collected;
    } catch (error) {
      logger.error(`Error collecting ${itemType}:`, error);
      this.state.currentTask = null;
      throw error;
    }
  }

  /**
   * Craft an item
   * @param {string} itemType - Type of item to craft
   * @param {number} count - Number of items to craft
   * @returns {Promise<number>} - Number of items crafted
   */
  async craftItem(itemType, count = 1) {
    try {
      this.state.currentTask = `Crafting ${count} ${itemType}`;
      logger.info(`${this.bot.username} attempting to craft ${count} ${itemType}`);
      
      let crafted = 0;
      
      // Load recipe
      const recipe = this.bot.recipesFor(itemType);
      if (!recipe || recipe.length === 0) {
        throw new Error(`No recipe found for ${itemType}`);
      }
      
      // Use the first recipe found (may need to be more selective in the future)
      const selectedRecipe = recipe[0];
      
      // Craft the items
      for (let i = 0; i < count; i++) {
        // Check if we have the ingredients
        const hasMaterials = selectedRecipe.delta.every(d => {
          // If it's a required ingredient (negative delta value)
          if (d.count < 0) {
            const available = this.bot.inventory.count(d.id, d.metadata);
            return available >= Math.abs(d.count);
          }
          return true;
        });
        
        if (!hasMaterials) {
          logger.warn(`${this.bot.username} doesn't have all materials to craft ${itemType}`);
          break;
        }
        
        // Craft the item
        try {
          await this.bot.craft(selectedRecipe, 1, null);
          crafted++;
          logger.info(`${this.bot.username} crafted ${itemType}`);
        } catch (error) {
          logger.warn(`${this.bot.username} failed to craft ${itemType}: ${error.message}`);
          break;
        }
      }
      
      this.state.currentTask = null;
      return crafted;
    } catch (error) {
      logger.error(`Error crafting ${itemType}:`, error);
      this.state.currentTask = null;
      throw error;
    }
  }

  /**
   * Find the nearest ore of a specific type
   * @param {string} oreType - Type of ore to find
   * @returns {Promise<Object|null>} - Position of the ore or null if not found
   */
  async findOre(oreType) {
    try {
      this.state.currentTask = `Finding ${oreType}`;
      logger.info(`${this.bot.username} searching for ${oreType}`);
      
      // Create a list of block names to look for based on the ore type
      const blockNames = [];
      
      // Handle different ore types
      const oreName = oreType.toLowerCase();
      
      if (oreName === 'diamond') {
        blockNames.push('diamond_ore', 'deepslate_diamond_ore');
      } else if (oreName === 'iron') {
        blockNames.push('iron_ore', 'deepslate_iron_ore');
      } else if (oreName === 'gold') {
        blockNames.push('gold_ore', 'deepslate_gold_ore', 'nether_gold_ore');
      } else if (oreName === 'coal') {
        blockNames.push('coal_ore', 'deepslate_coal_ore');
      } else if (oreName === 'redstone') {
        blockNames.push('redstone_ore', 'deepslate_redstone_ore');
      } else if (oreName === 'lapis') {
        blockNames.push('lapis_ore', 'deepslate_lapis_ore');
      } else if (oreName === 'emerald') {
        blockNames.push('emerald_ore', 'deepslate_emerald_ore');
      } else if (oreName === 'copper') {
        blockNames.push('copper_ore', 'deepslate_copper_ore');
      } else if (oreName === 'quartz') {
        blockNames.push('nether_quartz_ore');
      } else if (oreName === 'ancient_debris') {
        blockNames.push('ancient_debris');
      } else {
        // Try to use the direct name
        blockNames.push(oreName, `deepslate_${oreName}`, `${oreName}_ore`, `deepslate_${oreName}_ore`);
      }
      
      // Find blocks matching any of the names
      const matchingBlocks = [];
      for (const blockName of blockNames) {
        try {
          const blocksByName = Object.values(this.bot.registry.blocksByName)
            .filter(block => block.name === blockName)
            .map(block => block.id);
          
          if (blocksByName.length > 0) {
            const found = this.bot.findBlocks({
              matching: blocksByName,
              maxDistance: 64,
              count: 5,
            });
            
            matchingBlocks.push(...found);
          }
        } catch (error) {
          // Continue with other block names
          logger.debug(`Error finding blocks with name ${blockName}: ${error.message}`);
        }
      }
      
      if (matchingBlocks.length === 0) {
        logger.info(`${this.bot.username} couldn't find any ${oreType} nearby`);
        this.state.currentTask = null;
        return null;
      }
      
      // Find the closest block
      const botPosition = this.bot.entity.position;
      matchingBlocks.sort((a, b) => {
        const distA = Math.sqrt(
          Math.pow(a.x - botPosition.x, 2) +
          Math.pow(a.y - botPosition.y, 2) +
          Math.pow(a.z - botPosition.z, 2)
        );
        
        const distB = Math.sqrt(
          Math.pow(b.x - botPosition.x, 2) +
          Math.pow(b.y - botPosition.y, 2) +
          Math.pow(b.z - botPosition.z, 2)
        );
        
        return distA - distB;
      });
      
      const closest = matchingBlocks[0];
      logger.info(`${this.bot.username} found ${oreType} at ${closest.x}, ${closest.y}, ${closest.z}`);
      
      this.state.currentTask = null;
      return closest;
    } catch (error) {
      logger.error(`Error finding ${oreType}:`, error);
      this.state.currentTask = null;
      throw error;
    }
  }

  /**
   * Mine all blocks in a specified area
   * @param {Object} start - Start coordinates {x, y, z}
   * @param {Object} end - End coordinates {x, y, z}
   * @returns {Promise<number>} - Number of blocks mined
   */
  async mineArea(start, end) {
    try {
      this.state.currentTask = `Mining area from (${start.x},${start.y},${start.z}) to (${end.x},${end.y},${end.z})`;
      logger.info(`${this.bot.username} starting to mine area from (${start.x},${start.y},${start.z}) to (${end.x},${end.y},${end.z})`);
      
      // Make sure start coordinates are smaller than end coordinates
      const minX = Math.min(start.x, end.x);
      const minY = Math.min(start.y, end.y);
      const minZ = Math.min(start.z, end.z);
      const maxX = Math.max(start.x, end.x);
      const maxY = Math.max(start.y, end.y);
      const maxZ = Math.max(start.z, end.z);
      
      let mined = 0;
      
      // Create a list of blocks to mine
      const blocksToMine = [];
      
      // Skip air and bedrock blocks
      const skipBlocks = ['air', 'cave_air', 'void_air', 'bedrock'];
      
      // Go to the start position first
      await this.goToLocation({ x: minX, y: minY, z: minZ });
      
      // Scan the area for blocks to mine
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          for (let z = minZ; z <= maxZ; z++) {
            const block = this.bot.blockAt(new this.bot.vec3(x, y, z));
            
            if (block && !skipBlocks.includes(block.name)) {
              blocksToMine.push(block);
            }
          }
        }
      }
      
      // Sort blocks from top to bottom to prevent cave-ins
      blocksToMine.sort((a, b) => b.position.y - a.position.y);
      
      // Mine each block
      for (const block of blocksToMine) {
        try {
          // Check if inventory is getting full
          if (this.returnWhenInventoryFull && this.bot.inventory.emptySlotCount() < 5) {
            await this.returnToStorage();
          }
          
          // Get close to the block
          await this.goToLocation({ 
            x: block.position.x, 
            y: block.position.y, 
            z: block.position.z 
          }, 3);
          
          // Dig the block
          await this.bot.dig(block);
          mined++;
          
          // Update task status
          this.state.currentTask = `Mining area (${mined}/${blocksToMine.length})`;
        } catch (error) {
          logger.warn(`Error mining block at ${block.position.x},${block.position.y},${block.position.z}: ${error.message}`);
          // Continue with the next block
        }
      }
      
      logger.info(`${this.bot.username} mined ${mined} blocks in the area`);
      this.state.currentTask = null;
      return mined;
    } catch (error) {
      logger.error(`Error mining area:`, error);
      this.state.currentTask = null;
      throw error;
    }
  }
}

module.exports = MinerBot; 