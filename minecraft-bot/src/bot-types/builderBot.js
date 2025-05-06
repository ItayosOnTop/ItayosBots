/**
 * Builder Bot - Specialized bot for construction and terraforming
 */

const BaseBot = require('./baseBot');
const { logger } = require('../utils/logger');
const { goals } = require('mineflayer-pathfinder');
const fs = require('fs');
const path = require('path');
const { Schematic } = require('prismarine-schematic');
const Vec3 = require('vec3').Vec3;

class BuilderBot extends BaseBot {
  /**
   * Create a new builder bot instance
   * @param {Object} bot - Mineflayer bot instance
   * @param {Object} typeConfig - Type-specific configuration
   * @param {Object} globalConfig - Global configuration
   * @param {Object} dataStore - Shared data store
   */
  constructor(bot, typeConfig, globalConfig, dataStore) {
    super(bot, typeConfig, globalConfig, dataStore);
    
    // Builder-specific state
    this.state = {
      ...this.state,
      buildTarget: null,
      placedBlocks: 0,
      missingBlocks: {},
    };
    
    // Configure builder behavior
    this.schematicsFolder = typeConfig.schematicsFolder || './schematics';
    this.maxBuildHeight = typeConfig.maxBuildHeight || 256;
    this.autoCraftMissingItems = typeConfig.autoCraftMissingItems !== false; // Default to true
    
    // Ensure schematics folder exists
    if (!fs.existsSync(this.schematicsFolder)) {
      fs.mkdirSync(this.schematicsFolder, { recursive: true });
    }
    
    // Register event handlers
    this.setupBuilderEvents();
  }
  
  /**
   * Set up builder-specific event handlers
   */
  setupBuilderEvents() {
    // Update inventory data when it changes
    this.bot.on('playerCollect', () => {
      this.updateInventoryData();
    });
    
    // Check for missing blocks during build
    this.bot.on('physicsTick', () => {
      // Every 5 seconds (100 ticks)
      if (this.bot.time.age % 100 === 0 && this.state.buildTarget) {
        this.checkMissingBlocks();
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
   * Check if we're missing blocks for the current build
   */
  checkMissingBlocks() {
    if (!this.state.buildTarget || !this.state.buildTarget.missingBlocks) return;
    
    const { missingBlocks } = this.state.buildTarget;
    const inventory = this.bot.inventory.items();
    
    // Update missing blocks based on inventory
    for (const [blockName, count] of Object.entries(missingBlocks)) {
      const availableItems = inventory.filter(item => item.name === blockName);
      const availableCount = availableItems.reduce((sum, item) => sum + item.count, 0);
      
      if (availableCount >= count) {
        delete missingBlocks[blockName];
      } else {
        missingBlocks[blockName] = count - availableCount;
      }
    }
    
    // Update state
    this.state.missingBlocks = { ...missingBlocks };
    
    // If we have missing blocks and auto-craft is enabled, try to craft them
    if (Object.keys(missingBlocks).length > 0 && this.autoCraftMissingItems) {
      this.tryToCraftMissingItems();
    }
  }
  
  /**
   * Try to craft missing items
   */
  async tryToCraftMissingItems() {
    // This is a simplified version - in a real implementation,
    // you would need more complex crafting logic with recipes
    logger.info(`${this.bot.username} needs to craft items: ${JSON.stringify(this.state.missingBlocks)}`);
    
    // For now, just notify about missing items
    for (const [blockName, count] of Object.entries(this.state.missingBlocks)) {
      this.bot.chat(`I need ${count} more ${blockName} to complete the build`);
    }
  }
  
  /**
   * Build a structure from a schematic
   * @param {string} schematicName - Name of the schematic file
   * @param {Object} buildLocation - Location where to build
   * @param {number} [yaw=0] - Rotation in degrees
   * @returns {Promise} - Resolves when building is complete
   */
  async buildSchematic(schematicName, buildLocation, yaw = 0) {
    try {
      this.state.buildTarget = { schematicName, location: buildLocation, yaw };
      this.state.currentTask = `Building ${schematicName}`;
      this.state.placedBlocks = 0;
      
      logger.info(`${this.bot.username} starting to build ${schematicName}`);
      
      // Check if schematic exists
      const schematicPath = path.join(this.schematicsFolder, schematicName);
      if (!schematicPath.endsWith('.schem') && !schematicPath.endsWith('.schematic')) {
        schematicPath += '.schem';
      }
      
      if (!fs.existsSync(schematicPath)) {
        throw new Error(`Schematic file not found: ${schematicPath}`);
      }
      
      // Load the schematic
      const schematic = await Schematic.read(fs.readFileSync(schematicPath));
      
      // Make sure it's not too high
      if (buildLocation.y + schematic.height > this.maxBuildHeight) {
        throw new Error(`Build would exceed maximum height (${this.maxBuildHeight})`);
      }
      
      // Go to the build location
      await this.goToLocation(buildLocation);
      
      // Analyze the schematic
      const blocks = [];
      for (let y = 0; y < schematic.height; y++) {
        for (let z = 0; z < schematic.length; z++) {
          for (let x = 0; x < schematic.width; x++) {
            const block = schematic.getBlock(new Vec3(x, y, z));
            if (block.name !== 'air') {
              blocks.push({
                position: new Vec3(
                  buildLocation.x + x,
                  buildLocation.y + y,
                  buildLocation.z + z
                ),
                name: block.name,
                metadata: block.metadata
              });
            }
          }
        }
      }
      
      // Sort blocks from bottom to top
      blocks.sort((a, b) => a.position.y - b.position.y);
      
      // Check if we have enough blocks
      const requiredBlocks = {};
      for (const block of blocks) {
        requiredBlocks[block.name] = (requiredBlocks[block.name] || 0) + 1;
      }
      
      // Check inventory against required blocks
      const inventory = this.bot.inventory.items();
      const missingBlocks = {};
      
      for (const [blockName, count] of Object.entries(requiredBlocks)) {
        const availableItems = inventory.filter(item => item.name === blockName);
        const availableCount = availableItems.reduce((sum, item) => sum + item.count, 0);
        
        if (availableCount < count) {
          missingBlocks[blockName] = count - availableCount;
        }
      }
      
      if (Object.keys(missingBlocks).length > 0) {
        this.state.buildTarget.missingBlocks = missingBlocks;
        this.state.missingBlocks = { ...missingBlocks };
        
        const missingMessage = Object.entries(missingBlocks)
          .map(([name, count]) => `${count} ${name}`)
          .join(', ');
        
        this.bot.chat(`I need more materials to build this: ${missingMessage}`);
        
        if (this.autoCraftMissingItems) {
          this.tryToCraftMissingItems();
        }
        
        // Continue with what we have
      }
      
      // Place blocks
      let placedCount = 0;
      for (const block of blocks) {
        try {
          // Check if we have this block type
          const item = this.bot.inventory.findInventoryItem(block.name);
          if (!item) {
            logger.warn(`${this.bot.username} is missing ${block.name} for building`);
            continue;
          }
          
          // Check if we can reach this position
          const placementPos = block.position.clone();
          
          // Find a position to stand to place this block
          const offsets = [
            { x: 1, y: 0, z: 0 },
            { x: -1, y: 0, z: 0 },
            { x: 0, y: 0, z: 1 },
            { x: 0, y: 0, z: -1 },
            { x: 0, y: -1, z: 0 }, // Below
            { x: 0, y: 1, z: 0 }   // Above
          ];
          
          let canPlace = false;
          for (const offset of offsets) {
            const standPos = placementPos.clone().offset(offset.x, offset.y, offset.z);
            const standBlock = this.bot.blockAt(standPos);
            
            if (standBlock && standBlock.name === 'air') {
              // Check if we can stand here
              const standingPos = standPos.clone().offset(0, -1, 0);
              const standingBlock = this.bot.blockAt(standingPos);
              
              if (standingBlock && standingBlock.name !== 'air') {
                // Go to this position
                await this.goToLocation({ 
                  x: standPos.x, 
                  y: standPos.y, 
                  z: standPos.z 
                });
                
                // Equip the block
                await this.bot.equip(item, 'hand');
                
                // Place the block
                const targetBlock = this.bot.blockAt(standPos.offset(offset.x * -1, offset.y * -1, offset.z * -1));
                await this.bot.placeBlock(targetBlock, new Vec3(offset.x, offset.y, offset.z));
                
                placedCount++;
                this.state.placedBlocks = placedCount;
                this.state.currentTask = `Building ${schematicName} (${placedCount}/${blocks.length})`;
                
                canPlace = true;
                break;
              }
            }
          }
          
          if (!canPlace) {
            logger.warn(`${this.bot.username} couldn't find a position to place block at ${placementPos}`);
          }
        } catch (err) {
          logger.warn(`Error placing block at ${block.position}: ${err.message}`);
          // Continue with next block
        }
      }
      
      this.bot.chat(`Placed ${placedCount} out of ${blocks.length} blocks for ${schematicName}`);
      this.state.buildTarget = null;
      this.state.currentTask = null;
      
      return placedCount;
    } catch (err) {
      logger.error(`Building error:`, err);
      this.state.buildTarget = null;
      this.state.currentTask = null;
      throw err;
    }
  }
  
  /**
   * Get the current status of the builder bot
   * @returns {Object} - Bot status information
   */
  getStatus() {
    return {
      ...super.getStatus(),
      type: 'builder',
      buildTarget: this.state.buildTarget,
      placedBlocks: this.state.placedBlocks,
      missingBlocks: this.state.missingBlocks,
    };
  }
  
  /**
   * Handle a command directed at this builder bot
   * @param {string} command - Command name
   * @param {Array} args - Command arguments
   * @returns {*} - Command response
   */
  handleCommand(command, args) {
    // Check for builder-specific commands
    switch (command) {
      case 'build':
        if (args.length >= 4) {
          const schematicName = args[0];
          const x = parseInt(args[1]);
          const y = parseInt(args[2]);
          const z = parseInt(args[3]);
          const yaw = args.length >= 5 ? parseInt(args[4]) : 0;
          
          if (isNaN(x) || isNaN(y) || isNaN(z) || isNaN(yaw)) {
            return 'Invalid coordinates. Usage: build <schematic> <x> <y> <z> [yaw]';
          }
          
          const location = { x, y, z };
          this.buildSchematic(schematicName, location, yaw)
            .then((placedCount) => {
              this.bot.chat(`Build complete: placed ${placedCount} blocks`);
            })
            .catch((err) => {
              this.bot.chat(`Failed to build ${schematicName}: ${err.message}`);
            });
          
          return `Starting to build ${schematicName} at ${x},${y},${z}`;
        } else {
          return 'Invalid arguments. Usage: build <schematic> <x> <y> <z> [yaw]';
        }
      
      case 'place':
        if (args.length >= 4) {
          const blockName = args[0];
          const x = parseInt(args[1]);
          const y = parseInt(args[2]);
          const z = parseInt(args[3]);
          
          if (isNaN(x) || isNaN(y) || isNaN(z)) {
            return 'Invalid coordinates. Usage: place <block> <x> <y> <z>';
          }
          
          // Find the block in inventory
          const item = this.bot.inventory.findInventoryItem(blockName);
          if (!item) {
            return `I don't have any ${blockName} in my inventory`;
          }
          
          const location = { x, y, z };
          this.goToLocation(location, 3)
            .then(async () => {
              try {
                // Look for a placeable face
                const blockPos = new Vec3(x, y, z);
                const offsets = [
                  { x: 1, y: 0, z: 0 },
                  { x: -1, y: 0, z: 0 },
                  { x: 0, y: 0, z: 1 },
                  { x: 0, y: 0, z: -1 },
                  { x: 0, y: 1, z: 0 },
                  { x: 0, y: -1, z: 0 }
                ];
                
                let placed = false;
                for (const offset of offsets) {
                  const adjacentPos = blockPos.clone().offset(offset.x, offset.y, offset.z);
                  const adjacentBlock = this.bot.blockAt(adjacentPos);
                  
                  if (adjacentBlock && adjacentBlock.name !== 'air') {
                    // Equip the block
                    await this.bot.equip(item, 'hand');
                    
                    // Place the block
                    await this.bot.placeBlock(adjacentBlock, new Vec3(-offset.x, -offset.y, -offset.z));
                    
                    this.bot.chat(`Placed ${blockName} at ${x},${y},${z}`);
                    placed = true;
                    break;
                  }
                }
                
                if (!placed) {
                  this.bot.chat(`Couldn't find a face to place the block against`);
                }
              } catch (err) {
                this.bot.chat(`Failed to place block: ${err.message}`);
              }
            })
            .catch((err) => {
              this.bot.chat(`Failed to reach location: ${err.message}`);
            });
          
          return `Going to place ${blockName} at ${x},${y},${z}`;
        } else {
          return 'Invalid arguments. Usage: place <block> <x> <y> <z>';
        }
      
      default:
        // If not a builder command, try base commands
        return super.handleCommand(command, args);
    }
  }
}

module.exports = BuilderBot; 