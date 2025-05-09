/**
 * CombatManager.js - Extends BaseBot with combat capabilities
 * 
 * This mixin adds methods for combat, entity attacking, and defensive maneuvers.
 */

const { Vec3 } = require('vec3');

/**
 * Combat Management mixin for BaseBot
 * @mixin
 */
const CombatManager = {
  /**
   * Attack an entity
   * @param {Object} options - Attack options
   * @param {Entity} options.entity - Entity to attack
   * @param {boolean} [options.continuous=false] - Whether to continuously attack
   * @returns {Promise<boolean>} - Whether attack was successful
   */
  async attackEntity({ entity, continuous = false }) {
    if (!this.bot || !this.active) {
      throw new Error('Bot is not active');
    }
    
    try {
      if (!entity) {
        throw new Error('No entity specified');
      }
      
      // Equip best weapon
      await this._equipBestWeapon();
      
      this.currentTask = `Attacking ${entity.type === 'player' ? entity.username : entity.name || entity.type}`;
      this.log.info(this.currentTask);
      
      if (continuous) {
        // Use PVP plugin for continuous attack
        await this.bot.pvp.attack(entity);
      } else {
        // Single attack
        await this.bot.lookAt(entity.position.offset(0, entity.height * 0.8, 0));
        this.bot.attack(entity);
      }
      
      if (!continuous) {
        this.currentTask = null;
      }
      
      return true;
    } catch (error) {
      this._handleError('Failed to attack entity', error);
      this.currentTask = null;
      return false;
    }
  },
  
  /**
   * Stop attacking
   * @returns {boolean} - Whether stopped successfully
   */
  stopAttacking() {
    if (!this.bot || !this.active) {
      return false;
    }
    
    try {
      this.bot.pvp.stop();
      this.currentTask = null;
      this.log.info('Stopped attacking');
      return true;
    } catch (error) {
      this._handleError('Failed to stop attacking', error);
      return false;
    }
  },
  
  /**
   * Defend against nearest hostile entity
   * @param {number} [range=16] - Detection range
   * @returns {Promise<boolean>} - Whether defense was successful
   */
  async defendSelf(range = 16) {
    if (!this.bot || !this.active) {
      throw new Error('Bot is not active');
    }
    
    try {
      // Find hostile entities
      const hostileEntities = this.findEntities({ 
        type: 'mob', 
        maxDistance: range 
      }).filter(entity => this._isHostileMob(entity));
      
      if (hostileEntities.length === 0) {
        this.log.info('No hostile entities nearby');
        return false;
      }
      
      // Attack the closest hostile entity
      const target = hostileEntities[0];
      return await this.attackEntity({ entity: target, continuous: true });
    } catch (error) {
      this._handleError('Failed to defend self', error);
      return false;
    }
  },
  
  /**
   * Guard a specific location
   * @param {Object} options - Guard options
   * @param {Object} options.position - Position to guard
   * @param {number} options.range - Range to guard
   * @param {boolean} [options.attackHostiles=true] - Whether to attack hostiles
   * @returns {Promise<boolean>} - Whether guarding started successfully
   */
  async guardPosition({ position, range, attackHostiles = true }) {
    if (!this.bot || !this.active) {
      throw new Error('Bot is not active');
    }
    
    try {
      const guardPos = new Vec3(position.x, position.y, position.z);
      
      this.currentTask = `Guarding position ${position.x}, ${position.y}, ${position.z}`;
      this.log.info(this.currentTask);
      
      // Move to guard position
      await this.goTo(position, 0);
      
      // Set up guarding loop - this would be implemented as a recurring task
      // For now, we'll just set the state
      this.guardingPosition = {
        position: guardPos,
        range: range,
        attackHostiles: attackHostiles
      };
      
      // In a full implementation, you would periodically check for entities
      // and attack hostile ones
      
      return true;
    } catch (error) {
      this._handleError('Failed to guard position', error);
      this.currentTask = null;
      this.guardingPosition = null;
      return false;
    }
  },
  
  /**
   * Stop guarding
   * @returns {boolean} - Whether stopped successfully
   */
  stopGuarding() {
    if (!this.bot || !this.active) {
      return false;
    }
    
    try {
      this.guardingPosition = null;
      this.currentTask = null;
      this.stopAttacking();
      this.log.info('Stopped guarding');
      return true;
    } catch (error) {
      this._handleError('Failed to stop guarding', error);
      return false;
    }
  },
  
  /**
   * Deal with low health situations
   * @param {number} [threshold=5] - Health threshold to react
   * @returns {Promise<boolean>} - Whether retreat was successful
   */
  async handleLowHealth(threshold = 5) {
    if (!this.bot || !this.active) {
      return false;
    }
    
    if (this.bot.health > threshold) {
      return false; // Health is not low
    }
    
    try {
      this.log.warn(`Low health: ${this.bot.health}. Taking defensive actions.`);
      
      // Stop current combat
      this.stopAttacking();
      
      // Eat food if available
      const foodItems = this.bot.inventory.items().filter(item => {
        return this.bot.food.isFood(item.type);
      });
      
      if (foodItems.length > 0) {
        this.currentTask = 'Eating to recover health';
        this.log.info(this.currentTask);
        
        await this.bot.equip(foodItems[0], 'hand');
        await this.bot.consume();
      }
      
      // Try to use totem if available
      const totemItem = this.bot.inventory.items().find(item => item.name === 'totem_of_undying');
      if (totemItem) {
        await this.bot.equip(totemItem, 'off-hand');
      }
      
      // Find the nearest safe location and retreat
      // This could be a predefined safe zone or just away from combat
      // For now, just move away from any nearby entity
      const nearbyEntities = this.findEntities({ maxDistance: 16 });
      if (nearbyEntities.length > 0) {
        const entity = nearbyEntities[0];
        const retreatVector = this.bot.entity.position.clone().subtract(entity.position).normalize().scale(10);
        const retreatPosition = this.bot.entity.position.clone().add(retreatVector);
        
        this.currentTask = 'Retreating from combat';
        this.log.info(this.currentTask);
        
        await this.goTo(retreatPosition);
      }
      
      this.currentTask = null;
      return true;
    } catch (error) {
      this._handleError('Failed to handle low health', error);
      this.currentTask = null;
      return false;
    }
  },
  
  /**
   * Equip the best weapon from inventory
   * @private
   * @returns {Promise<boolean>} - Whether equipping was successful
   */
  async _equipBestWeapon() {
    if (!this.bot || !this.active) {
      return false;
    }
    
    try {
      // List of weapons in preference order
      const weaponPreference = [
        'netherite_sword',
        'diamond_sword',
        'iron_sword',
        'stone_sword',
        'wooden_sword',
        'netherite_axe',
        'diamond_axe',
        'iron_axe'
      ];
      
      // Find the best weapon in inventory
      const items = this.bot.inventory.items();
      
      for (const weaponName of weaponPreference) {
        const weapon = items.find(item => item.name === weaponName);
        if (weapon) {
          await this.bot.equip(weapon, 'hand');
          return true;
        }
      }
      
      // No weapons found
      this.log.warn('No weapons found in inventory');
      return false;
    } catch (error) {
      this._handleError('Failed to equip best weapon', error);
      return false;
    }
  },
  
  /**
   * Check if entity is a hostile mob
   * @private
   * @param {Entity} entity - Entity to check
   * @returns {boolean} - Whether entity is hostile
   */
  _isHostileMob(entity) {
    if (!entity || entity.type !== 'mob') {
      return false;
    }
    
    // List of hostile mob types
    const hostileMobs = [
      'zombie', 'skeleton', 'creeper', 'spider', 'enderman',
      'witch', 'slime', 'guardian', 'blaze', 'ghast',
      'magma_cube', 'silverfish', 'cave_spider'
    ];
    
    return hostileMobs.includes(entity.name);
  }
};

module.exports = CombatManager; 