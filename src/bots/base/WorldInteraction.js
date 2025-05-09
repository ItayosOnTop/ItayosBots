/**
 * WorldInteraction.js - Extends BaseBot with world interaction capabilities
 * 
 * This mixin adds methods for interacting with blocks, entities, and the environment.
 */

const { Vec3 } = require('vec3');

/**
 * World Interaction mixin for BaseBot
 * @mixin
 */
const WorldInteraction = {
  /**
   * Find blocks of a specific type within a radius
   * @param {Object} options - Block search options
   * @param {string|number} options.blockType - Block type to find (name or id)
   * @param {number} [options.maxDistance=16] - Maximum search distance
   * @param {number} [options.maxBlocks=64] - Maximum number of blocks to find
   * @returns {Array<Block>} - Array of found blocks
   */
  findBlocks({ blockType, maxDistance = 16, maxBlocks = 64 }) {
    if (!this.bot || !this.active) {
      this.log.warn('Cannot find blocks: Bot is not active');
      return [];
    }

    try {
      const mcData = require('minecraft-data')(this.bot.version);
      let blockId;
      
      if (typeof blockType === 'string') {
        blockId = mcData.blocksByName[blockType]?.id;
        if (blockId === undefined) {
          throw new Error(`Unknown block type: ${blockType}`);
        }
      } else {
        blockId = blockType;
      }
      
      return this.bot.findBlocks({
        matching: blockId,
        maxDistance,
        count: maxBlocks
      });
    } catch (error) {
      this._handleError('Failed to find blocks', error);
      return [];
    }
  },
  
  /**
   * Dig a block at the specified position
   * @param {Object} position - Block position
   * @param {number} position.x - X coordinate
   * @param {number} position.y - Y coordinate
   * @param {number} position.z - Z coordinate
   * @returns {Promise<boolean>} - Whether the dig was successful
   */
  async digBlock(position) {
    if (!this.bot || !this.active) {
      throw new Error('Bot is not active');
    }
    
    try {
      const blockPos = new Vec3(position.x, position.y, position.z);
      const block = this.bot.blockAt(blockPos);
      
      if (!block || block.name === 'air') {
        this.log.warn(`No block at ${position.x}, ${position.y}, ${position.z}`);
        return false;
      }
      
      this.currentTask = `Digging ${block.name} at ${position.x}, ${position.y}, ${position.z}`;
      this.log.info(this.currentTask);
      
      // Equip best tool for the job
      await this.bot.tool.equipForBlock(block);
      
      // Dig the block
      await this.bot.dig(block);
      
      this.currentTask = null;
      return true;
    } catch (error) {
      this._handleError('Failed to dig block', error);
      this.currentTask = null;
      return false;
    }
  },
  
  /**
   * Place a block at the specified position
   * @param {Object} target - Target position information
   * @param {Object} target.position - Block position adjacent to where to place
   * @param {string} target.blockName - Name of block to place
   * @param {Object} [target.faceVector] - Optional face vector
   * @returns {Promise<boolean>} - Whether the placement was successful
   */
  async placeBlock({ position, blockName, faceVector }) {
    if (!this.bot || !this.active) {
      throw new Error('Bot is not active');
    }
    
    try {
      const mcData = require('minecraft-data')(this.bot.version);
      const blocksByName = mcData.blocksByName;
      
      if (!blocksByName[blockName]) {
        throw new Error(`Unknown block name: ${blockName}`);
      }
      
      // Find the item in inventory
      const item = this.bot.inventory.items().find(item => item.name === blockName);
      if (!item) {
        this.log.warn(`No ${blockName} in inventory`);
        return false;
      }
      
      // Hold the block
      await this.bot.equip(item, 'hand');
      
      // Get the reference block
      const refBlockPos = new Vec3(position.x, position.y, position.z);
      const refBlock = this.bot.blockAt(refBlockPos);
      
      if (!refBlock) {
        this.log.warn(`No reference block at ${position.x}, ${position.y}, ${position.z}`);
        return false;
      }
      
      // Default face if not provided
      const face = faceVector ? new Vec3(faceVector.x, faceVector.y, faceVector.z) : new Vec3(0, 1, 0);
      
      this.currentTask = `Placing ${blockName} at ${position.x}, ${position.y}, ${position.z}`;
      this.log.info(this.currentTask);
      
      // Place the block
      await this.bot.placeBlock(refBlock, face);
      
      this.currentTask = null;
      return true;
    } catch (error) {
      this._handleError('Failed to place block', error);
      this.currentTask = null;
      return false;
    }
  },
  
  /**
   * Collect nearest item drop within a range
   * @param {number} [range=16] - Collection range
   * @returns {Promise<boolean>} - Whether item collection was successful
   */
  async collectItems(range = 16) {
    if (!this.bot || !this.active) {
      throw new Error('Bot is not active');
    }
    
    try {
      const items = Object.values(this.bot.entities)
        .filter(entity => entity.type === 'object' && entity.objectType === 'Item')
        .filter(entity => entity.position.distanceTo(this.bot.entity.position) < range);
      
      if (items.length === 0) {
        this.log.info(`No items to collect within ${range} blocks`);
        return false;
      }
      
      // Sort by distance
      items.sort((a, b) => {
        return a.position.distanceTo(this.bot.entity.position) - 
               b.position.distanceTo(this.bot.entity.position);
      });
      
      for (const item of items) {
        this.currentTask = `Collecting ${item.metadata[7]?.itemId?.value} at ${item.position.x.toFixed(1)}, ${item.position.y.toFixed(1)}, ${item.position.z.toFixed(1)}`;
        this.log.info(this.currentTask);
        
        // Move to the item
        const goal = new this.bot.pathfinder.goals.GoalNear(item.position.x, item.position.y, item.position.z, 1);
        await this.bot.pathfinder.goto(goal);
      }
      
      this.currentTask = null;
      return true;
    } catch (error) {
      this._handleError('Failed to collect items', error);
      this.currentTask = null;
      return false;
    }
  },
  
  /**
   * Check if a block is safe to stand on
   * @param {Object} position - Block position
   * @returns {boolean} - Whether the block is safe
   */
  isSafeBlock(position) {
    if (!this.bot) return false;
    
    try {
      const blockPos = new Vec3(position.x, position.y, position.z);
      const block = this.bot.blockAt(blockPos);
      
      if (!block) return false;
      
      // Check if block is solid to stand on
      const standableBlock = block.boundingBox === 'block';
      
      // Check if there's space above
      const blockAbove1 = this.bot.blockAt(blockPos.offset(0, 1, 0));
      const blockAbove2 = this.bot.blockAt(blockPos.offset(0, 2, 0));
      const hasClearance = (!blockAbove1 || blockAbove1.boundingBox === 'empty') && 
                           (!blockAbove2 || blockAbove2.boundingBox === 'empty');
      
      // Check for dangerous blocks (lava, fire, etc)
      const dangerousBlocks = ['lava', 'fire', 'cactus'];
      const isDangerous = dangerousBlocks.includes(block.name);
      
      return standableBlock && hasClearance && !isDangerous;
    } catch (error) {
      this._handleError('Failed to check if block is safe', error);
      return false;
    }
  },
  
  /**
   * Find entities around the bot
   * @param {Object} options - Search options
   * @param {string} [options.type] - Entity type (mob, player, object)
   * @param {number} [options.maxDistance=32] - Maximum search distance
   * @returns {Array<Entity>} - Array of entities
   */
  findEntities({ type, maxDistance = 32 }) {
    if (!this.bot || !this.active) {
      this.log.warn('Cannot find entities: Bot is not active');
      return [];
    }
    
    try {
      const entities = Object.values(this.bot.entities)
        .filter(entity => {
          if (type && entity.type !== type) return false;
          if (entity.type === 'player' && entity.username === this.bot.username) return false;
          return entity.position.distanceTo(this.bot.entity.position) <= maxDistance;
        })
        .sort((a, b) => {
          return a.position.distanceTo(this.bot.entity.position) - 
                 b.position.distanceTo(this.bot.entity.position);
        });
      
      return entities;
    } catch (error) {
      this._handleError('Failed to find entities', error);
      return [];
    }
  },
  
  /**
   * Check if a location is in water
   * @param {Object} position - Position to check
   * @returns {boolean} - Whether the position is in water
   */
  isInWater(position) {
    if (!this.bot) return false;
    
    try {
      const blockPos = new Vec3(position.x, position.y, position.z);
      const block = this.bot.blockAt(blockPos);
      
      return block && (block.name === 'water' || block.name === 'flowing_water');
    } catch (error) {
      this._handleError('Failed to check if position is in water', error);
      return false;
    }
  },
  
  /**
   * Check if a location is in lava
   * @param {Object} position - Position to check
   * @returns {boolean} - Whether the position is in lava
   */
  isInLava(position) {
    if (!this.bot) return false;
    
    try {
      const blockPos = new Vec3(position.x, position.y, position.z);
      const block = this.bot.blockAt(blockPos);
      
      return block && (block.name === 'lava' || block.name === 'flowing_lava');
    } catch (error) {
      this._handleError('Failed to check if position is in lava', error);
      return false;
    }
  }
};

module.exports = WorldInteraction; 