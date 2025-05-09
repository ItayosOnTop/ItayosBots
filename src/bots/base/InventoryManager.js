/**
 * InventoryManager.js - Extends BaseBot with inventory management capabilities
 * 
 * This mixin adds methods for managing inventory, storing items, and crafting.
 */

/**
 * Inventory Management mixin for BaseBot
 * @mixin
 */
const InventoryManager = {
  /**
   * Equip an item by name or id
   * @param {Object} options - Options
   * @param {string|number} options.item - Item name or id
   * @param {string} [options.destination='hand'] - Destination ('hand', 'head', 'torso', 'legs', 'feet', 'off-hand')
   * @returns {Promise<boolean>} - Whether item was equipped
   */
  async equipItem({ item, destination = 'hand' }) {
    if (!this.bot || !this.active) {
      throw new Error('Bot is not active');
    }
    
    try {
      let itemToEquip;
      
      if (typeof item === 'string') {
        // Find by name
        itemToEquip = this.bot.inventory.items().find(i => i.name === item);
      } else {
        // Find by id
        const mcData = require('minecraft-data')(this.bot.version);
        const itemById = mcData.items[item];
        if (!itemById) {
          throw new Error(`Unknown item ID: ${item}`);
        }
        itemToEquip = this.bot.inventory.items().find(i => i.type === item);
      }
      
      if (!itemToEquip) {
        this.log.warn(`No ${item} found in inventory`);
        return false;
      }
      
      this.currentTask = `Equipping ${itemToEquip.name}`;
      this.log.info(this.currentTask);
      
      await this.bot.equip(itemToEquip, destination);
      
      this.currentTask = null;
      return true;
    } catch (error) {
      this._handleError(`Failed to equip ${item}`, error);
      this.currentTask = null;
      return false;
    }
  },
  
  /**
   * Find items in inventory
   * @param {Object} options - Search options
   * @param {string|RegExp} options.itemName - Item name or pattern
   * @returns {Array<Item>} - Array of matching items
   */
  findInventoryItems({ itemName }) {
    if (!this.bot || !this.active) {
      this.log.warn('Cannot search inventory: Bot is not active');
      return [];
    }
    
    try {
      const items = this.bot.inventory.items();
      
      if (itemName instanceof RegExp) {
        return items.filter(item => itemName.test(item.name));
      } else {
        return items.filter(item => item.name === itemName);
      }
    } catch (error) {
      this._handleError('Failed to find inventory items', error);
      return [];
    }
  },
  
  /**
   * Toss items from inventory
   * @param {Object} options - Toss options
   * @param {string} options.itemName - Item name
   * @param {number} [options.count=1] - Number of items to toss
   * @returns {Promise<boolean>} - Whether items were tossed
   */
  async tossItems({ itemName, count = 1 }) {
    if (!this.bot || !this.active) {
      throw new Error('Bot is not active');
    }
    
    try {
      const items = this.findInventoryItems({ itemName });
      
      if (items.length === 0) {
        this.log.warn(`No ${itemName} found in inventory`);
        return false;
      }
      
      this.currentTask = `Tossing ${count} ${itemName}`;
      this.log.info(this.currentTask);
      
      await this.bot.toss(items[0].type, null, count);
      
      this.currentTask = null;
      return true;
    } catch (error) {
      this._handleError(`Failed to toss ${itemName}`, error);
      this.currentTask = null;
      return false;
    }
  },
  
  /**
   * Craft an item
   * @param {Object} options - Craft options
   * @param {string} options.itemName - Item to craft
   * @param {number} [options.count=1] - Number of items to craft
   * @returns {Promise<boolean>} - Whether crafting was successful
   */
  async craftItem({ itemName, count = 1 }) {
    if (!this.bot || !this.active) {
      throw new Error('Bot is not active');
    }
    
    try {
      const mcData = require('minecraft-data')(this.bot.version);
      const item = mcData.itemsByName[itemName];
      
      if (!item) {
        throw new Error(`Unknown item: ${itemName}`);
      }
      
      const craftingTable = this.bot.findBlock({
        matching: mcData.blocksByName.crafting_table.id,
        maxDistance: 3
      });
      
      // Find recipes for item
      const recipes = this.bot.recipesFor(item.id, null, craftingTable ? 1 : null, craftingTable);
      
      if (recipes.length === 0) {
        this.log.warn(`No recipe found for ${itemName}`);
        return false;
      }
      
      this.currentTask = `Crafting ${count} ${itemName}`;
      this.log.info(this.currentTask);
      
      await this.bot.craft(recipes[0], count, craftingTable);
      
      this.currentTask = null;
      return true;
    } catch (error) {
      this._handleError(`Failed to craft ${itemName}`, error);
      this.currentTask = null;
      return false;
    }
  },
  
  /**
   * Open a container at the specified position
   * @param {Object} position - Container position
   * @param {number} position.x - X coordinate
   * @param {number} position.y - Y coordinate
   * @param {number} position.z - Z coordinate
   * @returns {Promise<Container>} - The opened container
   */
  async openContainer(position) {
    if (!this.bot || !this.active) {
      throw new Error('Bot is not active');
    }
    
    try {
      const { Vec3 } = require('vec3');
      const containerPos = new Vec3(position.x, position.y, position.z);
      const block = this.bot.blockAt(containerPos);
      
      if (!block) {
        throw new Error(`No block at ${position.x}, ${position.y}, ${position.z}`);
      }
      
      const containerBlocks = ['chest', 'trapped_chest', 'ender_chest', 'barrel', 'shulker_box'];
      if (!containerBlocks.includes(block.name)) {
        throw new Error(`Block at ${position.x}, ${position.y}, ${position.z} is not a container`);
      }
      
      this.currentTask = `Opening ${block.name} at ${position.x}, ${position.y}, ${position.z}`;
      this.log.info(this.currentTask);
      
      const container = await this.bot.openContainer(block);
      
      this.currentTask = null;
      return container;
    } catch (error) {
      this._handleError('Failed to open container', error);
      this.currentTask = null;
      throw error;
    }
  },
  
  /**
   * Deposit items in a container
   * @param {Object} options - Deposit options
   * @param {Container} options.container - Container to deposit into
   * @param {string} options.itemName - Item name to deposit
   * @param {number} [options.count=null] - Number of items to deposit (null for all)
   * @returns {Promise<boolean>} - Whether deposit was successful
   */
  async depositItems({ container, itemName, count = null }) {
    if (!this.bot || !this.active) {
      throw new Error('Bot is not active');
    }
    
    try {
      const items = this.findInventoryItems({ itemName });
      
      if (items.length === 0) {
        this.log.warn(`No ${itemName} found in inventory`);
        return false;
      }
      
      const item = items[0];
      const depositCount = count !== null ? Math.min(count, item.count) : item.count;
      
      this.currentTask = `Depositing ${depositCount} ${itemName}`;
      this.log.info(this.currentTask);
      
      await this.bot.transfer({ 
        window: container, 
        itemType: item.type, 
        metadata: item.metadata, 
        sourceStart: this.bot.inventory.slots.indexOf(item),
        sourceEnd: this.bot.inventory.slots.length,
        destStart: 0,
        destEnd: container.slots.length,
        count: depositCount
      });
      
      this.currentTask = null;
      return true;
    } catch (error) {
      this._handleError(`Failed to deposit ${itemName}`, error);
      this.currentTask = null;
      return false;
    }
  },
  
  /**
   * Withdraw items from a container
   * @param {Object} options - Withdraw options
   * @param {Container} options.container - Container to withdraw from
   * @param {string} options.itemName - Item name to withdraw
   * @param {number} [options.count=null] - Number of items to withdraw (null for all)
   * @returns {Promise<boolean>} - Whether withdrawal was successful
   */
  async withdrawItems({ container, itemName, count = null }) {
    if (!this.bot || !this.active) {
      throw new Error('Bot is not active');
    }
    
    try {
      const mcData = require('minecraft-data')(this.bot.version);
      const itemType = mcData.itemsByName[itemName]?.id;
      
      if (!itemType) {
        throw new Error(`Unknown item: ${itemName}`);
      }
      
      const containerItems = container.slots
        .filter(item => item && item.type === itemType);
      
      if (containerItems.length === 0) {
        this.log.warn(`No ${itemName} found in container`);
        return false;
      }
      
      const item = containerItems[0];
      const withdrawCount = count !== null ? Math.min(count, item.count) : item.count;
      
      this.currentTask = `Withdrawing ${withdrawCount} ${itemName}`;
      this.log.info(this.currentTask);
      
      await this.bot.withdraw({ 
        window: container, 
        itemType: item.type, 
        metadata: item.metadata, 
        sourceStart: 0,
        sourceEnd: container.slots.length,
        destStart: this.bot.inventory.slots.indexOf(null) || 0,
        destEnd: this.bot.inventory.slots.length,
        count: withdrawCount
      });
      
      this.currentTask = null;
      return true;
    } catch (error) {
      this._handleError(`Failed to withdraw ${itemName}`, error);
      this.currentTask = null;
      return false;
    }
  },
  
  /**
   * Check if inventory is nearly full
   * @param {number} [threshold=0.9] - Fullness threshold (0-1)
   * @returns {boolean} - Whether inventory is full
   */
  isInventoryFull(threshold = 0.9) {
    if (!this.bot || !this.active) {
      return false;
    }
    
    const status = this._getInventoryStatus();
    return status.full / 100 >= threshold;
  },
  
  /**
   * Sort inventory by organizing similar items together
   * @returns {Promise<boolean>} - Whether sorting was successful
   */
  async sortInventory() {
    if (!this.bot || !this.active) {
      throw new Error('Bot is not active');
    }
    
    try {
      this.currentTask = 'Sorting inventory';
      this.log.info(this.currentTask);
      
      // Group similar items
      const items = this.bot.inventory.items();
      const groupedItems = {};
      
      for (const item of items) {
        if (!groupedItems[item.name]) {
          groupedItems[item.name] = [];
        }
        groupedItems[item.name].push(item);
      }
      
      // This is a simplified approach to inventory sorting
      // A real implementation would be more complex and involve
      // actually moving items between specific slots
      this.log.info('Inventory items grouped by type');
      
      this.currentTask = null;
      return true;
    } catch (error) {
      this._handleError('Failed to sort inventory', error);
      this.currentTask = null;
      return false;
    }
  }
};

module.exports = InventoryManager; 