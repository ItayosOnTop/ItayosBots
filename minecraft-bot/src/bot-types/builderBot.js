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
    
    // Builder-specific commands
    const builderCommands = ['buildwall', 'blueprint'];
    
    // If not a builder command, don't respond
    if (!builderCommands.includes(command)) {
      return null;
    }

    // Check for builder-specific commands
    switch (command) {
      case 'buildwall':
        if (args.length >= 6) {
          const blockType = args[0];
          const height = parseInt(args[1]);
          const x1 = parseInt(args[2]);
          const z1 = parseInt(args[3]);
          const x2 = parseInt(args[4]);
          const z2 = parseInt(args[5]);
          
          if (isNaN(height) || isNaN(x1) || isNaN(z1) || isNaN(x2) || isNaN(z2) || height <= 0) {
            return 'Invalid parameters. Usage: buildwall <block_type> <height> <x1> <z1> <x2> <z2>';
          }
          
          this.buildWall(blockType, height, { x: x1, z: z1 }, { x: x2, z: z2 })
            .then((placedCount) => {
              this.bot.chat(`Wall building complete: placed ${placedCount} blocks`);
            })
            .catch((err) => {
              this.bot.chat(`Failed to build wall: ${err.message}`);
            });
          
          return `Starting to build wall from (${x1},${z1}) to (${x2},${z2}) with height ${height}`;
        } else {
          return 'Invalid arguments. Usage: buildwall <block_type> <height> <x1> <z1> <x2> <z2>';
        }
      
      case 'blueprint':
        if (args.length >= 7) {
          const name = args[0];
          const x1 = parseInt(args[1]);
          const y1 = parseInt(args[2]);
          const z1 = parseInt(args[3]);
          const x2 = parseInt(args[4]);
          const y2 = parseInt(args[5]);
          const z2 = parseInt(args[6]);
          
          if ([x1, y1, z1, x2, y2, z2].some(isNaN)) {
            return 'Invalid coordinates. Usage: blueprint <n> <x1> <y1> <z1> <x2> <y2> <z2>';
          }
          
          this.createBlueprint(name, { x: x1, y: y1, z: z1 }, { x: x2, y: y2, z: z2 })
            .then(() => {
              this.bot.chat(`Blueprint "${name}" created successfully`);
            })
            .catch((err) => {
              this.bot.chat(`Failed to create blueprint: ${err.message}`);
            });
          
          return `Creating blueprint "${name}" from area (${x1},${y1},${z1}) to (${x2},${y2},${z2})`;
        } else {
          return 'Invalid arguments. Usage: blueprint <n> <x1> <y1> <z1> <x2> <y2> <z2>';
        }
      
      default:
        return null;
    }
  }

  /**
   * Repair a structure
   * @param {string} structureName - Name of structure to repair
   * @returns {Promise<number>} - Number of blocks repaired
   */
  async repairStructure(structureName) {
    try {
      this.state.currentTask = `Repairing ${structureName}`;
      logger.info(`${this.bot.username} starting to repair ${structureName}`);
      
      // First, check if we have a schematic with this name
      const schematicPath = path.join(this.schematicsFolder, structureName);
      const schematicsToCheck = [
        schematicPath,
        `${schematicPath}.schem`,
        `${schematicPath}.schematic`
      ];
      
      let schematicFile = null;
      for (const file of schematicsToCheck) {
        if (fs.existsSync(file)) {
          schematicFile = file;
          break;
        }
      }
      
      if (!schematicFile) {
        throw new Error(`No schematic found for ${structureName}`);
      }
      
      // Load the schematic
      const schematic = await Schematic.read(fs.readFileSync(schematicFile));
      
      // Get the structure data
      const structureData = this.dataStore.getStructure(structureName);
      if (!structureData) {
        throw new Error(`No data found for structure ${structureName}`);
      }
      
      const { position } = structureData;
      
      // Go to the structure location
      await this.goToLocation(position);
      
      let repaired = 0;
      
      // Check each block in the schematic against the world
      for (let y = 0; y < schematic.height; y++) {
        for (let z = 0; z < schematic.length; z++) {
          for (let x = 0; x < schematic.width; x++) {
            const schematicBlock = schematic.getBlock(new Vec3(x, y, z));
            if (schematicBlock.name === 'air') continue;
            
            const worldPos = new Vec3(
              position.x + x,
              position.y + y,
              position.z + z
            );
            
            const worldBlock = this.bot.blockAt(worldPos);
            
            // If the block doesn't match or is missing, repair it
            if (!worldBlock || worldBlock.name !== schematicBlock.name) {
              logger.info(`Block at ${worldPos.x},${worldPos.y},${worldPos.z} needs repair: expected ${schematicBlock.name}, found ${worldBlock ? worldBlock.name : 'nothing'}`);
              
              // Check if we have this block type
              const item = this.bot.inventory.findInventoryItem(schematicBlock.name);
              if (!item) {
                logger.warn(`${this.bot.username} is missing ${schematicBlock.name} for repair`);
                continue;
              }
              
              try {
                // Get close to place the block
                await this.goToLocation(worldPos, 3);
                
                // Find a position to place against
                const faces = [
                  { x: 1, y: 0, z: 0 },
                  { x: -1, y: 0, z: 0 },
                  { x: 0, y: 0, z: 1 },
                  { x: 0, y: 0, z: -1 },
                  { x: 0, y: 1, z: 0 },
                  { x: 0, y: -1, z: 0 }
                ];
                
                // If there's an existing block, break it first
                if (worldBlock && worldBlock.name !== 'air') {
                  await this.bot.dig(worldBlock);
                }
                
                // Find an adjacent block to place against
                for (const face of faces) {
                  const adjacent = this.bot.blockAt(worldPos.clone().offset(face.x, face.y, face.z));
                  if (adjacent && adjacent.material !== 'air') {
                    // Equip the block
                    await this.bot.equip(item, 'hand');
                    
                    // Place the block
                    await this.bot.placeBlock(adjacent, new Vec3(-face.x, -face.y, -face.z));
                    repaired++;
                    this.state.currentTask = `Repairing ${structureName} (${repaired} blocks)`;
                    break;
                  }
                }
              } catch (error) {
                logger.warn(`Error repairing block at ${worldPos.x},${worldPos.y},${worldPos.z}: ${error.message}`);
              }
            }
          }
        }
      }
      
      logger.info(`${this.bot.username} repaired ${repaired} blocks in ${structureName}`);
      this.state.currentTask = null;
      return repaired;
    } catch (error) {
      logger.error(`Error repairing structure:`, error);
      this.state.currentTask = null;
      throw error;
    }
  }

  /**
   * Terraform an area according to a pattern
   * @param {string} pattern - Terraforming pattern ('flatten', 'hill', 'valley')
   * @param {Object} start - Start coordinates {x, z}
   * @param {Object} end - End coordinates {x, z}
   * @returns {Promise<number>} - Number of blocks modified
   */
  async terraform(pattern, start, end) {
    try {
      this.state.currentTask = `Terraforming area with ${pattern} pattern`;
      logger.info(`${this.bot.username} starting to terraform area from (${start.x},${start.z}) to (${end.x},${end.z}) using ${pattern} pattern`);
      
      // Ensure start is smaller than end
      const minX = Math.min(start.x, end.x);
      const minZ = Math.min(start.z, end.z);
      const maxX = Math.max(start.x, end.x);
      const maxZ = Math.max(start.z, end.z);
      
      // Go to the area first
      await this.goToLocation({ x: minX, y: this.bot.entity.position.y, z: minZ });
      
      let modified = 0;
      
      // Different terraforming patterns
      switch (pattern.toLowerCase()) {
        case 'flatten': {
          // Find the average height of the area
          let totalHeight = 0;
          let sampleCount = 0;
          
          for (let x = minX; x <= maxX; x += 2) {
            for (let z = minZ; z <= maxZ; z += 2) {
              const height = this.bot.world.getHighestBlock(x, z);
              if (height) {
                totalHeight += height;
                sampleCount++;
              }
            }
          }
          
          const targetHeight = Math.round(totalHeight / sampleCount);
          logger.info(`Flattening to height ${targetHeight}`);
          
          // Flatten the area
          for (let x = minX; x <= maxX; x++) {
            for (let z = minZ; z <= maxZ; z++) {
              const highestBlock = this.bot.world.getHighestBlock(x, z);
              
              if (!highestBlock) continue;
              
              if (highestBlock > targetHeight) {
                // Need to remove blocks
                for (let y = highestBlock; y > targetHeight; y--) {
                  const block = this.bot.blockAt(new Vec3(x, y, z));
                  if (block && block.name !== 'air') {
                    try {
                      await this.goToLocation({ x, y, z }, 3);
                      await this.bot.dig(block);
                      modified++;
                      this.state.currentTask = `Terraforming (${modified} blocks modified)`;
                    } catch (error) {
                      logger.warn(`Error removing block at ${x},${y},${z}: ${error.message}`);
                    }
                  }
                }
              } else if (highestBlock < targetHeight) {
                // Need to add blocks
                const dirt = this.bot.inventory.findInventoryItem('dirt');
                const grass = this.bot.inventory.findInventoryItem('grass_block');
                const filler = dirt || grass;
                
                if (!filler) {
                  logger.warn(`${this.bot.username} has no dirt or grass blocks for terraforming`);
                  break;
                }
                
                // Place filler blocks up to target height - 1
                for (let y = highestBlock + 1; y <= targetHeight; y++) {
                  const pos = new Vec3(x, y, z);
                  // On the top layer, use grass if available, otherwise dirt
                  const blockItem = (y === targetHeight && grass) ? grass : dirt;
                  
                  try {
                    // Find a block to place against
                    const below = this.bot.blockAt(pos.offset(0, -1, 0));
                    if (below && below.name !== 'air') {
                      await this.goToLocation({ x, y, z }, 3);
                      await this.bot.equip(blockItem, 'hand');
                      await this.bot.placeBlock(below, new Vec3(0, 1, 0));
                      modified++;
                      this.state.currentTask = `Terraforming (${modified} blocks modified)`;
                    }
                  } catch (error) {
                    logger.warn(`Error placing block at ${x},${y},${z}: ${error.message}`);
                  }
                }
              }
            }
          }
          break;
        }
        
        case 'hill': {
          // Create a hill centered in the area
          const centerX = Math.floor((minX + maxX) / 2);
          const centerZ = Math.floor((minZ + maxZ) / 2);
          const maxDist = Math.max(maxX - minX, maxZ - minZ) / 2;
          const maxHeight = 5; // Maximum hill height
          
          for (let x = minX; x <= maxX; x++) {
            for (let z = minZ; z <= maxZ; z++) {
              // Calculate distance from center (0-1 range)
              const dist = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(z - centerZ, 2)) / maxDist;
              
              // Calculate height offset using cosine function (1 at center, 0 at edge)
              const heightOffset = dist < 1 ? Math.round(maxHeight * Math.cos(dist * Math.PI / 2)) : 0;
              
              if (heightOffset > 0) {
                const highestBlock = this.bot.world.getHighestBlock(x, z);
                
                if (!highestBlock) continue;
                
                const targetHeight = highestBlock + heightOffset;
                
                // Place blocks to create the hill
                const dirt = this.bot.inventory.findInventoryItem('dirt');
                const grass = this.bot.inventory.findInventoryItem('grass_block');
                
                if (!dirt && !grass) {
                  logger.warn(`${this.bot.username} has no dirt or grass blocks for terraforming`);
                  break;
                }
                
                for (let y = highestBlock + 1; y <= targetHeight; y++) {
                  const pos = new Vec3(x, y, z);
                  // On the top layer, use grass if available
                  const blockItem = (y === targetHeight && grass) ? grass : dirt;
                  
                  try {
                    // Find a block to place against
                    const below = this.bot.blockAt(pos.offset(0, -1, 0));
                    if (below && below.name !== 'air') {
                      await this.goToLocation({ x, y, z }, 3);
                      await this.bot.equip(blockItem, 'hand');
                      await this.bot.placeBlock(below, new Vec3(0, 1, 0));
                      modified++;
                      this.state.currentTask = `Terraforming (${modified} blocks modified)`;
                    }
                  } catch (error) {
                    logger.warn(`Error placing block at ${x},${y},${z}: ${error.message}`);
                  }
                }
              }
            }
          }
          break;
        }
        
        case 'valley': {
          // Create a valley centered in the area
          const centerX = Math.floor((minX + maxX) / 2);
          const centerZ = Math.floor((minZ + maxZ) / 2);
          const maxDist = Math.max(maxX - minX, maxZ - minZ) / 2;
          const maxDepth = 3; // Maximum valley depth
          
          for (let x = minX; x <= maxX; x++) {
            for (let z = minZ; z <= maxZ; z++) {
              // Calculate distance from center (0-1 range)
              const dist = Math.sqrt(Math.pow(x - centerX, 2) + Math.pow(z - centerZ, 2)) / maxDist;
              
              // Calculate depth offset using sine function (maxDepth at center, 0 at edge)
              const depthOffset = dist < 1 ? Math.round(maxDepth * (1 - dist)) : 0;
              
              if (depthOffset > 0) {
                const highestBlock = this.bot.world.getHighestBlock(x, z);
                
                if (!highestBlock) continue;
                
                const targetHeight = highestBlock - depthOffset;
                
                // Remove blocks to create the valley
                for (let y = highestBlock; y > targetHeight; y--) {
                  const block = this.bot.blockAt(new Vec3(x, y, z));
                  if (block && block.name !== 'air') {
                    try {
                      await this.goToLocation({ x, y, z }, 3);
                      await this.bot.dig(block);
                      modified++;
                      this.state.currentTask = `Terraforming (${modified} blocks modified)`;
                    } catch (error) {
                      logger.warn(`Error removing block at ${x},${y},${z}: ${error.message}`);
                    }
                  }
                }
              }
            }
          }
          break;
        }
        
        default:
          throw new Error(`Unknown terraforming pattern: ${pattern}`);
      }
      
      logger.info(`${this.bot.username} modified ${modified} blocks during terraforming`);
      this.state.currentTask = null;
      return modified;
    } catch (error) {
      logger.error(`Error terraforming:`, error);
      this.state.currentTask = null;
      throw error;
    }
  }

  /**
   * Build a wall between two points
   * @param {string} blockType - Type of block to use
   * @param {number} height - Height of the wall
   * @param {Object} start - Start coordinates {x, z}
   * @param {Object} end - End coordinates {x, z}
   * @returns {Promise<number>} - Number of blocks placed
   */
  async buildWall(blockType, height, start, end) {
    try {
      this.state.currentTask = `Building wall of ${blockType}`;
      logger.info(`${this.bot.username} starting to build wall from (${start.x},${start.z}) to (${end.x},${end.z}) with height ${height}`);
      
      // Check if we have this block type
      const item = this.bot.inventory.findInventoryItem(blockType);
      if (!item) {
        throw new Error(`I don't have any ${blockType} in my inventory`);
      }
      
      // Get the blocks along the line
      const points = [];
      
      // Calculate blocks using Bresenham's line algorithm
      const dx = Math.abs(end.x - start.x);
      const dz = Math.abs(end.z - start.z);
      const sx = start.x < end.x ? 1 : -1;
      const sz = start.z < end.z ? 1 : -1;
      let err = dx - dz;
      
      let x = start.x;
      let z = start.z;
      
      while (true) {
        points.push({ x, z });
        
        if (x === end.x && z === end.z) break;
        
        const e2 = 2 * err;
        if (e2 > -dz) {
          err -= dz;
          x += sx;
        }
        if (e2 < dx) {
          err += dx;
          z += sz;
        }
      }
      
      // Go to the start position
      await this.goToLocation({ x: start.x, y: this.bot.entity.position.y, z: start.z });
      
      let placed = 0;
      
      // Build the wall
      for (const point of points) {
        // Find ground level at this position
        const groundY = this.bot.world.getHighestBlock(point.x, point.z);
        
        if (!groundY) continue;
        
        // Build up to the specified height
        for (let y = groundY + 1; y <= groundY + height; y++) {
          try {
            const pos = new Vec3(point.x, y, point.z);
            const below = this.bot.blockAt(pos.offset(0, -1, 0));
            
            if (below && below.name !== 'air') {
              await this.goToLocation({ x: point.x, y, z: point.z }, 3);
              await this.bot.equip(item, 'hand');
              await this.bot.placeBlock(below, new Vec3(0, 1, 0));
              placed++;
              this.state.currentTask = `Building wall (${placed} blocks placed)`;
            }
          } catch (error) {
            logger.warn(`Error placing block at ${point.x},${y},${point.z}: ${error.message}`);
          }
        }
      }
      
      logger.info(`${this.bot.username} placed ${placed} blocks to build the wall`);
      this.state.currentTask = null;
      return placed;
    } catch (error) {
      logger.error(`Error building wall:`, error);
      this.state.currentTask = null;
      throw error;
    }
  }

  /**
   * Create a blueprint from an existing structure
   * @param {string} name - Name for the blueprint
   * @param {Object} start - Start coordinates {x, y, z}
   * @param {Object} end - End coordinates {x, y, z}
   * @returns {Promise<boolean>} - True if blueprint was created successfully
   */
  async createBlueprint(name, start, end) {
    try {
      this.state.currentTask = `Creating blueprint "${name}"`;
      logger.info(`${this.bot.username} creating blueprint "${name}" from area (${start.x},${start.y},${start.z}) to (${end.x},${end.y},${end.z})`);
      
      // Determine dimensions
      const width = Math.abs(end.x - start.x) + 1;
      const height = Math.abs(end.y - start.y) + 1;
      const length = Math.abs(end.z - start.z) + 1;
      
      // Normalize coordinates
      const minX = Math.min(start.x, end.x);
      const minY = Math.min(start.y, end.y);
      const minZ = Math.min(start.z, end.z);
      
      // Create a new schematic
      const schematic = new Schematic(width, height, length, 'blueprint');
      
      // Go to the area
      await this.goToLocation({ x: minX, y: minY, z: minZ });
      
      // Scan the area and add blocks to the schematic
      let blockCount = 0;
      
      for (let y = 0; y < height; y++) {
        for (let z = 0; z < length; z++) {
          for (let x = 0; x < width; x++) {
            const worldX = minX + x;
            const worldY = minY + y;
            const worldZ = minZ + z;
            
            const block = this.bot.blockAt(new Vec3(worldX, worldY, worldZ));
            
            if (block && block.name !== 'air') {
              schematic.setBlock(new Vec3(x, y, z), block);
              blockCount++;
            }
          }
        }
      }
      
      // Save the schematic
      const filename = name.endsWith('.schem') ? name : `${name}.schem`;
      const filePath = path.join(this.schematicsFolder, filename);
      
      const schematicBuffer = await schematic.write();
      
      fs.writeFileSync(filePath, schematicBuffer);
      
      // Store structure information in the data store
      this.dataStore.saveStructure(name, {
        position: { x: minX, y: minY, z: minZ },
        dimensions: { width, height, length },
        blockCount,
        createdAt: new Date().toISOString(),
      });
      
      logger.info(`${this.bot.username} created blueprint "${name}" with ${blockCount} blocks`);
      this.state.currentTask = null;
      return true;
    } catch (error) {
      logger.error(`Error creating blueprint:`, error);
      this.state.currentTask = null;
      throw error;
    }
  }
}

module.exports = BuilderBot; 