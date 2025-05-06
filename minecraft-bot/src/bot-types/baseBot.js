/**
 * Base Bot - Base class for all bot types with shared functionality
 */

const { goals, Movements } = require('mineflayer-pathfinder');
const { logger } = require('../utils/logger');

class BaseBot {
  /**
   * Create a new base bot instance
   * @param {Object} bot - Mineflayer bot instance
   * @param {Object} typeConfig - Type-specific configuration
   * @param {Object} globalConfig - Global configuration
   * @param {Object} dataStore - Shared data store
   */
  constructor(bot, typeConfig, globalConfig, dataStore) {
    this.bot = bot;
    this.typeConfig = typeConfig;
    this.globalConfig = globalConfig;
    this.dataStore = dataStore;
    
    // Bot state
    this.state = {
      currentTask: null,
      lastPosition: null,
      isStuck: false,
      stuckTime: 0,
      lastActivity: Date.now(),
      isMoving: false,
    };
    
    // Setup pathfinding
    this.movements = new Movements(bot);
    this.movements.canDig = true;
    this.movements.scafoldingBlocks = ['dirt', 'cobblestone'];
    
    // Setup event handlers
    this.setupEvents();
  }
  
  /**
   * Setup common event handlers
   */
  setupEvents() {
    // Track position to detect when bot is stuck
    this.bot.on('physicsTick', () => {
      const position = this.bot.entity.position;
      
      // Check if the bot is stuck
      if (this.state.lastPosition && this.state.isMoving) {
        const dx = position.x - this.state.lastPosition.x;
        const dy = position.y - this.state.lastPosition.y;
        const dz = position.z - this.state.lastPosition.z;
        const distanceMoved = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        if (distanceMoved < 0.01) {
          this.state.stuckTime++;
          
          if (this.state.stuckTime > 100) { // About 5 seconds
            this.handleStuckState();
          }
        } else {
          this.state.stuckTime = 0;
          this.state.isStuck = false;
        }
      }
      
      this.state.lastPosition = position.clone();
    });
    
    // Handle health changes
    this.bot.on('health', () => {
      // If health is low, try to eat
      if (this.bot.food < 8) {
        this.tryToEat();
      }
      
      // If being attacked, respond
      if (this.bot.health < 10) {
        this.handleLowHealth();
      }
    });
    
    // Track movement state
    this.bot.pathfinder.setGoal(null);
    this.bot.on('goal_reached', () => {
      this.state.isMoving = false;
      logger.debug(`${this.bot.username} reached goal`);
    });
    
    this.bot.on('goal_updated', (goal) => {
      this.state.isMoving = !!goal;
    });
    
    // Handle errors
    this.bot.on('error', (err) => {
      logger.error(`Bot ${this.bot.username} error:`, err);
    });
  }
  
  /**
   * Try to eat food to restore health and hunger
   */
  async tryToEat() {
    try {
      const foods = this.bot.inventory.items().filter(item => {
        return this.bot.registry.isFood(item.name);
      });
      
      if (foods.length === 0) {
        logger.debug(`${this.bot.username} has no food`);
        return false;
      }
      
      // Sort by food value (if we had that data)
      const food = foods[0];
      
      // Equip the food
      await this.bot.equip(food, 'hand');
      
      // Consume it
      await this.bot.consume();
      logger.info(`${this.bot.username} ate ${food.name}`);
      return true;
    } catch (err) {
      logger.error(`Failed to eat:`, err);
      return false;
    }
  }
  
  /**
   * Handle low health situation
   */
  handleLowHealth() {
    // Default implementation - retreat if health is very low
    if (this.bot.health < 5) {
      // Find closest safe location
      const safeZones = this.globalConfig.safeZones || [];
      
      if (safeZones.length > 0) {
        const botPos = this.bot.entity.position;
        
        // Find closest safe zone
        let closestZone = null;
        let closestDistance = Infinity;
        
        for (const zone of safeZones) {
          const dx = zone.x - botPos.x;
          const dy = zone.y - botPos.y;
          const dz = zone.z - botPos.z;
          const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
          
          if (distance < closestDistance) {
            closestDistance = distance;
            closestZone = zone;
          }
        }
        
        if (closestZone) {
          logger.info(`${this.bot.username} retreating to safe zone: ${closestZone.name}`);
          this.goToLocation(closestZone);
        }
      }
    }
  }
  
  /**
   * Handle situation when bot is stuck
   */
  handleStuckState() {
    // Only handle if not already handling
    if (this.state.isStuck) return;
    
    this.state.isStuck = true;
    logger.warn(`${this.bot.username} is stuck, trying to recover`);
    
    // Try to jump
    this.bot.setControlState('jump', true);
    setTimeout(() => {
      this.bot.setControlState('jump', false);
      
      // Try to move in a random direction
      const directions = ['forward', 'back', 'left', 'right'];
      const randomDirection = directions[Math.floor(Math.random() * directions.length)];
      
      this.bot.setControlState(randomDirection, true);
      setTimeout(() => {
        this.bot.setControlState(randomDirection, false);
        this.state.isStuck = false;
        this.state.stuckTime = 0;
      }, 1000);
    }, 500);
  }
  
  /**
   * Go to a specific location
   * @param {Object} location - Location with x, y, z coordinates
   * @param {number} [range=1] - How close to get to the target
   * @returns {Promise} - Resolves when location is reached or rejected on failure
   */
  goToLocation(location, range = 1) {
    return new Promise((resolve, reject) => {
      try {
        const goal = new goals.GoalNear(location.x, location.y, location.z, range);
        this.bot.pathfinder.setMovements(this.movements);
        this.bot.pathfinder.setGoal(goal, true);
        
        // Handle success
        const onGoalReached = () => {
          this.bot.removeListener('goal_reached', onGoalReached);
          this.bot.removeListener('path_update', onPathUpdate);
          clearTimeout(timeout);
          resolve();
        };
        
        // Handle path updates
        const onPathUpdate = (results) => {
          if (results.status === 'noPath') {
            this.bot.removeListener('goal_reached', onGoalReached);
            this.bot.removeListener('path_update', onPathUpdate);
            clearTimeout(timeout);
            reject(new Error('No path to location'));
          }
        };
        
        // Set timeout for pathfinding
        const timeout = setTimeout(() => {
          this.bot.removeListener('goal_reached', onGoalReached);
          this.bot.removeListener('path_update', onPathUpdate);
          this.bot.pathfinder.setGoal(null);
          reject(new Error('Timed out trying to reach location'));
        }, this.globalConfig.advanced.pathfindingTimeout || 10000);
        
        // Register event listeners
        this.bot.once('goal_reached', onGoalReached);
        this.bot.on('path_update', onPathUpdate);
      } catch (err) {
        reject(err);
      }
    });
  }
  
  /**
   * Go to a specific player
   * @param {string} playerName - Name of the player to go to
   * @param {number} [range=3] - How close to get to the player
   * @returns {Promise} - Resolves when player is reached or rejected on failure
   */
  goToPlayer(playerName, range = 3) {
    return new Promise((resolve, reject) => {
      try {
        const player = this.bot.players[playerName];
        
        if (!player || !player.entity) {
          reject(new Error(`Can't see player ${playerName}`));
          return;
        }
        
        const goal = new goals.GoalFollow(player.entity, range);
        this.bot.pathfinder.setMovements(this.movements);
        this.bot.pathfinder.setGoal(goal, true);
        
        // We don't get goal_reached with follow, so we check distance periodically
        const checkInterval = setInterval(() => {
          const player = this.bot.players[playerName];
          if (!player || !player.entity) {
            clearInterval(checkInterval);
            clearTimeout(timeout);
            this.bot.pathfinder.setGoal(null);
            reject(new Error(`Lost sight of player ${playerName}`));
            return;
          }
          
          const distance = player.entity.position.distanceTo(this.bot.entity.position);
          if (distance <= range) {
            clearInterval(checkInterval);
            clearTimeout(timeout);
            this.bot.pathfinder.setGoal(null);
            resolve();
          }
        }, 1000);
        
        // Set timeout
        const timeout = setTimeout(() => {
          clearInterval(checkInterval);
          this.bot.pathfinder.setGoal(null);
          reject(new Error('Timed out trying to reach player'));
        }, this.globalConfig.advanced.pathfindingTimeout || 30000);
      } catch (err) {
        reject(err);
      }
    });
  }
  
  /**
   * Equip a specific item
   * @param {string} itemName - Name of the item to equip
   * @param {string} slot - Slot to equip the item in ('hand', 'off-hand', 'head', 'torso', 'legs', 'feet')
   * @returns {Promise<boolean>} - Whether the item was equipped
   */
  async equipItem(itemName, slot = 'hand') {
    try {
      // Get the item from inventory
      const item = this.bot.inventory.items().find(item => 
        item.name.includes(itemName)
      );
      
      if (!item) {
        logger.warn(`${this.bot.username} doesn't have ${itemName} in inventory`);
        return false;
      }
      
      await this.bot.equip(item, slot);
      logger.info(`${this.bot.username} equipped ${item.name} in ${slot}`);
      return true;
    } catch (error) {
      logger.error(`Error equipping ${itemName}:`, error);
      return false;
    }
  }
  
  /**
   * Equip best available armor
   * @returns {Promise<boolean>} - Whether any armor was equipped
   */
  async equipBestArmor() {
    try {
      // Get all armor items in inventory
      const armorItems = this.bot.inventory.items().filter(item => {
        return item.name.includes('helmet') || 
               item.name.includes('chestplate') || 
               item.name.includes('leggings') || 
               item.name.includes('boots');
      });
      
      if (armorItems.length === 0) {
        logger.debug(`${this.bot.username} has no armor in inventory`);
        return false;
      }
      
      // Group armor by slot
      const helmetItems = armorItems.filter(item => item.name.includes('helmet'));
      const chestplateItems = armorItems.filter(item => item.name.includes('chestplate'));
      const leggingsItems = armorItems.filter(item => item.name.includes('leggings'));
      const bootsItems = armorItems.filter(item => item.name.includes('boots'));
      
      // Armor quality ordering
      const armorMaterials = ['netherite', 'diamond', 'iron', 'chainmail', 'gold', 'leather'];
      
      // Function to find best armor of a type
      const findBestArmor = (items) => {
        if (items.length === 0) return null;
        
        return items.sort((a, b) => {
          const materialA = armorMaterials.findIndex(material => a.name.includes(material));
          const materialB = armorMaterials.findIndex(material => b.name.includes(material));
          
          // Lower index means better material
          return materialA - materialB;
        })[0];
      };
      
      // Find and equip best armor for each slot
      const bestHelmet = findBestArmor(helmetItems);
      const bestChestplate = findBestArmor(chestplateItems);
      const bestLeggings = findBestArmor(leggingsItems);
      const bestBoots = findBestArmor(bootsItems);
      
      // Equip each piece if found
      let equipped = 0;
      
      if (bestHelmet) {
        await this.bot.equip(bestHelmet, 'head');
        equipped++;
        logger.info(`${this.bot.username} equipped ${bestHelmet.name}`);
      }
      
      if (bestChestplate) {
        await this.bot.equip(bestChestplate, 'torso');
        equipped++;
        logger.info(`${this.bot.username} equipped ${bestChestplate.name}`);
      }
      
      if (bestLeggings) {
        await this.bot.equip(bestLeggings, 'legs');
        equipped++;
        logger.info(`${this.bot.username} equipped ${bestLeggings.name}`);
      }
      
      if (bestBoots) {
        await this.bot.equip(bestBoots, 'feet');
        equipped++;
        logger.info(`${this.bot.username} equipped ${bestBoots.name}`);
      }
      
      return equipped > 0;
    } catch (error) {
      logger.error(`Error equipping best armor:`, error);
      return false;
    }
  }
  
  /**
   * Drop items by name
   * @param {string} itemName - Name of the item to drop
   * @param {number} [count=null] - Number of items to drop, null for all
   * @returns {Promise} - Resolves when items are dropped or rejected on failure
   */
  async dropItems(itemName, count = null) {
    try {
      const items = this.bot.inventory.items().filter(item => item.name === itemName);
      
      if (items.length === 0) {
        logger.warn(`${this.bot.username} doesn't have ${itemName}`);
        return false;
      }
      
      // If count is null, drop all matching items
      if (count === null) {
        for (const item of items) {
          await this.bot.tossStack(item);
        }
        logger.debug(`${this.bot.username} dropped all ${itemName}`);
        return true;
      }
      
      // Otherwise drop the specified count
      let remainingCount = count;
      
      for (const item of items) {
        if (remainingCount <= 0) break;
        
        if (item.count <= remainingCount) {
          await this.bot.tossStack(item);
          remainingCount -= item.count;
        } else {
          await this.bot.toss(item.type, null, remainingCount);
          remainingCount = 0;
        }
      }
      
      logger.debug(`${this.bot.username} dropped ${count - remainingCount} ${itemName}`);
      return remainingCount === 0;
    } catch (err) {
      logger.error(`Failed to drop ${itemName}:`, err);
      return false;
    }
  }
  
  /**
   * Get the current status of the bot
   * @returns {Object} - Bot status information
   */
  getStatus() {
    return {
      username: this.bot.username,
      type: 'base', // Override in subclasses
      health: this.bot.health,
      food: this.bot.food,
      position: this.bot.entity.position,
      currentTask: this.state.currentTask,
      inventory: {
        items: this.bot.inventory.items().length,
        slots: this.bot.inventory.slots.filter(Boolean).length,
        full: this.bot.inventory.slots.filter(Boolean).length >= this.bot.inventory.slots.length - 5,
      },
    };
  }
  
  /**
   * Handle a command directed at this bot
   * @param {string} command - Command name
   * @param {Array} args - Command arguments
   * @returns {*} - Command response
   */
  handleCommand(command, args) {
    // Basic commands that all bots should support
    switch (command) {
      case 'status':
        return this.getStatus();
        
      case 'come':
        if (args.length === 1) {
          const playerName = args[0];
          this.goToPlayer(playerName)
            .then(() => {
              this.bot.chat(`Reached ${playerName}`);
            })
            .catch((err) => {
              this.bot.chat(`Failed to reach ${playerName}: ${err.message}`);
            });
          return `Going to ${playerName}`;
        } else {
          // Go to owner
          this.goToPlayer(this.globalConfig.owner.minecraftUsername)
            .then(() => {
              this.bot.chat(`Reached ${this.globalConfig.owner.minecraftUsername}`);
            })
            .catch((err) => {
              this.bot.chat(`Failed to reach you: ${err.message}`);
            });
          return 'Coming to you';
        }
        
      case 'goto':
        if (args.length === 3) {
          const x = parseInt(args[0]);
          const y = parseInt(args[1]);
          const z = parseInt(args[2]);
          
          if (isNaN(x) || isNaN(y) || isNaN(z)) {
            return 'Invalid coordinates. Usage: goto <x> <y> <z>';
          }
          
          const location = { x, y, z };
          this.goToLocation(location)
            .then(() => {
              this.bot.chat(`Reached ${x}, ${y}, ${z}`);
            })
            .catch((err) => {
              this.bot.chat(`Failed to reach location: ${err.message}`);
            });
          return `Going to ${x}, ${y}, ${z}`;
        } else {
          return 'Invalid arguments. Usage: goto <x> <y> <z>';
        }
        
      case 'drop':
        if (args.length >= 1) {
          const itemName = args[0];
          const count = args.length >= 2 ? parseInt(args[1]) : null;
          
          if (args.length >= 2 && isNaN(count)) {
            return 'Invalid count. Usage: drop <item> [count]';
          }
          
          this.dropItems(itemName, count)
            .then((success) => {
              if (success) {
                this.bot.chat(`Dropped ${count === null ? 'all' : count} ${itemName}`);
              } else {
                this.bot.chat(`Couldn't drop ${itemName}`);
              }
            })
            .catch((err) => {
              this.bot.chat(`Failed to drop items: ${err.message}`);
            });
          return `Dropping ${count === null ? 'all' : count} ${itemName}`;
        } else {
          return 'Invalid arguments. Usage: drop <item> [count]';
        }
        
      case 'equip':
        if (args.length >= 1) {
          const itemName = args[0];
          const destination = args.length >= 2 ? args[1] : 'hand';
          
          this.equipItem(itemName, destination)
            .then((success) => {
              if (success) {
                this.bot.chat(`Equipped ${itemName}`);
              } else {
                this.bot.chat(`Couldn't equip ${itemName}`);
              }
            })
            .catch((err) => {
              this.bot.chat(`Failed to equip ${itemName}: ${err.message}`);
            });
          return `Equipping ${itemName}`;
        } else {
          return 'Invalid arguments. Usage: equip <item> [destination]';
        }
        
      default:
        // If not a base command, it should be handled by the subclass
        return `Unknown command: ${command}`;
    }
  }
  
  /**
   * Update the todo.md file to reflect completion of commands
   * @param {string} command - Command that was implemented
   * @param {string} botType - Bot type the command belongs to
   */
  async updateCommandImplementationStatus(command, botType) {
    // This is a stub - in a real implementation, you would
    // update the todo.md file to mark commands as completed
    logger.debug(`Implemented command ${command} for bot type ${botType}`);
  }
}

module.exports = BaseBot; 