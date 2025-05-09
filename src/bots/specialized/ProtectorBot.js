/**
 * ProtectorBot - Specialized bot for security and combat operations
 * 
 * This bot type specializes in protecting areas, guarding players, and
 * engaging in combat with hostile entities.
 */

const BaseBot = require('../base');
const botConfig = require('../../shared/botConfig');
const { Vec3 } = require('vec3');

class ProtectorBot extends BaseBot {
  /**
   * Create a new ProtectorBot
   * @param {Object} options - Bot configuration
   */
  constructor(options) {
    super({
      ...options,
      type: 'protector'
    });
    
    // Load protector-specific configuration
    this.config = botConfig.loadBotConfig('protector');
    
    // Protection state
    this.protectionTarget = null;    // Entity or position being protected
    this.protectionRadius = this.config.protectionRadius || 50;
    this.patrolPoints = [];          // Points to patrol between
    this.currentPatrolIndex = 0;     // Current patrol point index
    this.patrolling = false;         // Whether bot is currently patrolling
    this.guardingPlayer = null;      // Player being guarded
    this.whitelist = [];             // Entities that should not be attacked
    
    // Combat state
    this.aggressionLevel = this.config.aggressionLevel || 'high';
    this.retreatHealthThreshold = this.config.retreatHealthThreshold || 7;
    this.targetEntity = null;        // Current combat target
    
    // Bind methods
    this._patrolTick = this._patrolTick.bind(this);
    this._guardTick = this._guardTick.bind(this);
    this._setupProtectorEventHandlers = this._setupProtectorEventHandlers.bind(this);
  }
  
  /**
   * Start the bot with protector-specific initialization
   * @returns {Promise<boolean>} - Whether startup was successful
   */
  async start() {
    const success = await super.start();
    
    if (!success) {
      return false;
    }
    
    // Set up protector-specific event handlers
    this._setupProtectorEventHandlers();
    
    // Equip best weapon and armor
    await this._equipBestGear();
    
    this.log.info('ProtectorBot initialized');
    
    return true;
  }
  
  /**
   * Set up protection of a player
   * @param {Object} options - Protection options
   * @param {string} options.playerName - Name of player to protect
   * @param {number} [options.followDistance=3] - Distance to maintain from player
   * @returns {Promise<boolean>} - Whether setup was successful
   */
  async guardPlayer({ playerName, followDistance = 3 }) {
    if (!this.bot || !this.active) {
      throw new Error('Bot is not active');
    }
    
    try {
      // Find player entity
      const player = this.bot.players[playerName];
      
      if (!player || !player.entity) {
        throw new Error(`Player ${playerName} not found or not in range`);
      }
      
      // Stop any current protection tasks
      this._stopProtectionTasks();
      
      // Set up player guarding
      this.guardingPlayer = {
        name: playerName,
        followDistance
      };
      
      this.currentTask = `Guarding player ${playerName}`;
      this.log.info(this.currentTask);
      
      // Start guard tick
      this.guardTickInterval = setInterval(this._guardTick, 1000);
      
      return true;
    } catch (error) {
      this._handleError('Failed to guard player', error);
      return false;
    }
  }
  
  /**
   * Set up patrol between specified points
   * @param {Object} options - Patrol options
   * @param {Array<Object>} options.points - Array of points to patrol between
   * @param {number} [options.radius=5] - Checking radius at each point
   * @returns {Promise<boolean>} - Whether setup was successful
   */
  async patrol({ points, radius = 5 }) {
    if (!this.bot || !this.active) {
      throw new Error('Bot is not active');
    }
    
    try {
      if (!points || points.length < 2) {
        throw new Error('Patrol requires at least 2 points');
      }
      
      // Stop any current protection tasks
      this._stopProtectionTasks();
      
      // Set up patrol
      this.patrolPoints = points;
      this.currentPatrolIndex = 0;
      this.patrolRadius = radius;
      this.patrolling = true;
      
      this.currentTask = 'Patrolling';
      this.log.info(`Started patrol with ${points.length} points`);
      
      // Start patrol loop
      this._patrolTick();
      
      return true;
    } catch (error) {
      this._handleError('Failed to set up patrol', error);
      return false;
    }
  }
  
  /**
   * Guard a specific position
   * @param {Object} options - Guarding options
   * @param {Object} options.position - Position to guard
   * @param {number} [options.radius=16] - Radius to guard
   * @returns {Promise<boolean>} - Whether setup was successful
   */
  async guardPosition({ position, radius = 16 }) {
    if (!this.bot || !this.active) {
      throw new Error('Bot is not active');
    }
    
    try {
      // Stop any current protection tasks
      this._stopProtectionTasks();
      
      // Set up position guarding
      this.protectionTarget = {
        type: 'position',
        position: new Vec3(position.x, position.y, position.z),
        radius: radius
      };
      
      // Move to position
      await this.goTo(position);
      
      this.currentTask = `Guarding position ${position.x}, ${position.y}, ${position.z}`;
      this.log.info(this.currentTask);
      
      // Start protection check interval
      this.protectionInterval = setInterval(() => {
        this._checkForThreats(this.protectionTarget.position, radius);
      }, 2000);
      
      return true;
    } catch (error) {
      this._handleError('Failed to guard position', error);
      return false;
    }
  }
  
  /**
   * Add player to whitelist (will not be attacked)
   * @param {string} playerName - Player name to whitelist
   * @returns {boolean} - Whether operation was successful
   */
  whitelistPlayer(playerName) {
    if (!playerName) {
      return false;
    }
    
    if (!this.whitelist.includes(playerName)) {
      this.whitelist.push(playerName);
      this.log.info(`Added ${playerName} to whitelist`);
    }
    
    return true;
  }
  
  /**
   * Remove player from whitelist
   * @param {string} playerName - Player name to remove
   * @returns {boolean} - Whether operation was successful
   */
  unwhitelistPlayer(playerName) {
    const index = this.whitelist.indexOf(playerName);
    
    if (index !== -1) {
      this.whitelist.splice(index, 1);
      this.log.info(`Removed ${playerName} from whitelist`);
      return true;
    }
    
    return false;
  }
  
  /**
   * Set aggression level
   * @param {string} level - Aggression level ('low', 'medium', 'high')
   * @returns {boolean} - Whether operation was successful
   */
  setAggressionLevel(level) {
    const validLevels = ['low', 'medium', 'high'];
    
    if (!validLevels.includes(level)) {
      return false;
    }
    
    this.aggressionLevel = level;
    this.log.info(`Set aggression level to ${level}`);
    return true;
  }
  
  /**
   * Stop all protection tasks
   * @returns {boolean} - Whether operation was successful
   */
  stopProtection() {
    this._stopProtectionTasks();
    this.currentTask = null;
    this.log.info('Stopped all protection tasks');
    return true;
  }
  
  /**
   * Check for and respond to threats
   * @private
   * @param {Vec3} position - Position to check around
   * @param {number} radius - Radius to check
   */
  async _checkForThreats(position, radius) {
    if (!this.bot || !this.active) {
      return;
    }
    
    try {
      // Don't check for threats if already in combat
      if (this.targetEntity) {
        return;
      }
      
      // Check for hostile mobs
      const entities = Object.values(this.bot.entities)
        .filter(entity => {
          // Filter by type
          if (entity.type !== 'mob') {
            return false;
          }
          
          // Check if entity is hostile
          if (!this._isHostileMob(entity)) {
            return false;
          }
          
          // Check if entity is in range
          return entity.position.distanceTo(position) <= radius;
        })
        .sort((a, b) => 
          a.position.distanceTo(position) - b.position.distanceTo(position)
        );
      
      if (entities.length > 0) {
        // Attack nearest hostile entity
        await this.attackEntity({ entity: entities[0], continuous: true });
      }
      
      // Check for hostile players based on aggression level
      if (this.aggressionLevel === 'high') {
        const players = Object.values(this.bot.players)
          .filter(player => {
            // Skip if no entity
            if (!player.entity) return false;
            
            // Skip if whitelisted
            if (this.whitelist.includes(player.username)) return false;
            
            // Skip if it's the guarded player
            if (this.guardingPlayer && player.username === this.guardingPlayer.name) return false;
            
            // Check if player is in range
            return player.entity.position.distanceTo(position) <= radius;
          })
          .sort((a, b) => 
            a.entity.position.distanceTo(position) - b.entity.position.distanceTo(position)
          );
        
        if (players.length > 0) {
          // Attack nearest non-whitelisted player
          await this.attackEntity({ entity: players[0].entity, continuous: true });
        }
      }
    } catch (error) {
      this._handleError('Error checking for threats', error);
    }
  }
  
  /**
   * Patrol tick handler
   * @private
   */
  async _patrolTick() {
    if (!this.bot || !this.active || !this.patrolling) {
      return;
    }
    
    try {
      // Get current patrol point
      const currentPoint = this.patrolPoints[this.currentPatrolIndex];
      
      // Move to current point if not already there
      const botPos = this.bot.entity.position;
      const targetPos = new Vec3(currentPoint.x, currentPoint.y, currentPoint.z);
      
      if (botPos.distanceTo(targetPos) > 3) {
        await this.goTo(currentPoint);
      }
      
      // Check for threats at current position
      await this._checkForThreats(targetPos, this.patrolRadius);
      
      // Move to next patrol point
      this.currentPatrolIndex = (this.currentPatrolIndex + 1) % this.patrolPoints.length;
      
      // Schedule next patrol tick
      if (this.patrolling) {
        setTimeout(this._patrolTick, 5000);
      }
    } catch (error) {
      this._handleError('Error in patrol tick', error);
      
      // Try to continue patrolling despite error
      if (this.patrolling) {
        setTimeout(this._patrolTick, 10000);
      }
    }
  }
  
  /**
   * Guard tick handler
   * @private
   */
  async _guardTick() {
    if (!this.bot || !this.active || !this.guardingPlayer) {
      return;
    }
    
    try {
      // Find player
      const player = this.bot.players[this.guardingPlayer.name];
      
      if (!player || !player.entity) {
        this.log.warn(`Cannot find player ${this.guardingPlayer.name}`);
        return;
      }
      
      const playerPos = player.entity.position;
      const botPos = this.bot.entity.position;
      const followDist = this.guardingPlayer.followDistance;
      
      // Check distance to player
      if (botPos.distanceTo(playerPos) > followDist + 5) {
        // Move closer to player
        const targetPos = playerPos.clone();
        await this.goTo({ x: targetPos.x, y: targetPos.y, z: targetPos.z }, followDist);
      }
      
      // Check for threats around player
      await this._checkForThreats(playerPos, 16);
    } catch (error) {
      this._handleError('Error in guard tick', error);
    }
  }
  
  /**
   * Stop any active protection tasks
   * @private
   */
  _stopProtectionTasks() {
    // Stop patrolling
    this.patrolling = false;
    this.patrolPoints = [];
    this.currentPatrolIndex = 0;
    
    // Stop guarding player
    this.guardingPlayer = null;
    if (this.guardTickInterval) {
      clearInterval(this.guardTickInterval);
      this.guardTickInterval = null;
    }
    
    // Stop position protection
    this.protectionTarget = null;
    if (this.protectionInterval) {
      clearInterval(this.protectionInterval);
      this.protectionInterval = null;
    }
    
    // Stop any combat
    if (this.targetEntity) {
      this.stopAttacking();
      this.targetEntity = null;
    }
  }
  
  /**
   * Set up protector-specific event handlers
   * @private
   */
  _setupProtectorEventHandlers() {
    if (!this.bot) return;
    
    // Handle low health
    this.bot.on('health', () => {
      if (this.bot.health <= this.retreatHealthThreshold) {
        this._handleLowHealth();
      }
    });
    
    // Handle successful attacks
    this.bot.on('entityHurt', (entity) => {
      if (entity === this.targetEntity) {
        this.log.info(`Hit target: ${entity.name || entity.username || entity.type}`);
      }
    });
    
    // Handle entity death
    this.bot.on('entityDead', (entity) => {
      if (entity === this.targetEntity) {
        this.log.info(`Target eliminated: ${entity.name || entity.username || entity.type}`);
        this.targetEntity = null;
        this.stopAttacking();
      }
    });
    
    // Handle player joining
    this.bot.on('playerJoined', (player) => {
      if (this.aggressionLevel === 'high' && !this.whitelist.includes(player.username)) {
        this.chat(`Detected new player: ${player.username}`);
      }
    });
  }
  
  /**
   * Handle low health situations
   * @private
   */
  async _handleLowHealth() {
    this.log.warn(`Low health: ${this.bot.health}. Taking defensive actions.`);
    
    // Temporarily stop attacking
    this.stopAttacking();
    
    // Try to use regeneration items
    const foodItems = this.bot.inventory.items().filter(item => 
      item.name.includes('apple') || 
      item.name.includes('bread') || 
      item.name.includes('cooked')
    );
    
    if (foodItems.length > 0) {
      this.log.info(`Consuming ${foodItems[0].name} to recover health`);
      await this.bot.equip(foodItems[0], 'hand');
      await this.bot.consume();
    }
    
    // Try to use totem
    const totemItem = this.bot.inventory.items().find(item => 
      item.name === 'totem_of_undying'
    );
    
    if (totemItem) {
      await this.bot.equip(totemItem, 'off-hand');
    }
    
    // Try to retreat
    if (this.targetEntity) {
      const retreatVector = this.bot.entity.position.clone()
        .subtract(this.targetEntity.position)
        .normalize().scale(10);
      
      const retreatPos = this.bot.entity.position.clone().add(retreatVector);
      
      this.log.info('Retreating from combat');
      await this.goTo({ x: retreatPos.x, y: retreatPos.y, z: retreatPos.z });
    }
  }
  
  /**
   * Equip best available gear
   * @private
   */
  async _equipBestGear() {
    try {
      // Equip best weapon
      await this._equipBestWeapon();
      
      // Equip best armor
      await this.bot.armorManager.equipAll();
      
      // Try to equip shield in off hand
      const shield = this.bot.inventory.items().find(item => 
        item.name === 'shield'
      );
      
      if (shield) {
        await this.bot.equip(shield, 'off-hand');
      }
      
      return true;
    } catch (error) {
      this._handleError('Failed to equip gear', error);
      return false;
    }
  }
}

module.exports = ProtectorBot; 