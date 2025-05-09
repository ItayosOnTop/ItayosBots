/**
 * ProtectorBot - Specialized bot for security and combat operations
 * 
 * This bot type specializes in protecting areas, guarding players, and
 * engaging in combat with hostile entities.
 */

const BaseBot = require('../base');
const botConfig = require('../../shared/botConfig');
const mainConfig = require('../../../config');
const { Vec3 } = require('vec3');
const { pathfinder, Movements, goals } = require('mineflayer-pathfinder');

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
    
    // Add command handling
    this.handleCommand = this.handleCommand.bind(this);
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
      // Find player entity - but don't require it to be visible right away
      const player = this.bot.players[playerName];
      
      // Instead of requiring player entity immediately, set up guard state
      // even if player is not currently visible
      this._stopProtectionTasks();
      
      // Set up player guarding
      this.guardingPlayer = {
        name: playerName,
        followDistance
      };
      
      this.currentTask = `Guarding player ${playerName}`;
      this.log.info(this.currentTask);
      
      // Start guard tick with a safe interval (clear any existing one first)
      if (this.guardTickInterval) {
        clearInterval(this.guardTickInterval);
        this.guardTickInterval = null;
      }
      
      // Use a reasonable interval that won't overwhelm the server
      this.guardTickInterval = setInterval(() => {
        // Wrap in try/catch to prevent interval from breaking
        try {
          this._guardTick().catch(error => {
            this.log.warn(`Error in guard tick: ${error.message}`);
          });
        } catch (error) {
          this.log.warn(`Error executing guard tick: ${error.message}`);
        }
      }, 1000);
      
      return true;
    } catch (error) {
      this.log.error(`Failed to guard player: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Set up patrol between multiple points
   * @param {Object} options - Patrol options
   * @param {Array<Object>} options.points - Array of positions to patrol
   * @param {number} options.radius - Radius to check for enemies at each point
   * @returns {Promise<boolean>} - Whether setup was successful
   */
  async patrol({ points, radius }) {
    if (!this.bot || !this.active) {
      throw new Error('Bot is not active');
    }
    
    if (!points || points.length < 2) {
      throw new Error('At least two patrol points are required');
    }
    
    try {
      // Stop any current protection tasks
      this._stopProtectionTasks();
      
      // Set up patrol
      this.patrolPoints = points.map(p => new Vec3(p.x, p.y, p.z));
      this.patrolCheckRadius = radius || 5;
      this.currentPatrolIndex = 0;
      this.patrolling = true;
      
      this.currentTask = `Patrolling between ${points.length} points`;
      this.log.info(this.currentTask);
      
      // Move to the first patrol point to start
      const firstPoint = this.patrolPoints[0];
      await this.goTo(firstPoint);
      
      // Start patrol tick
      this.patrolTickInterval = setInterval(() => {
        try {
          this._patrolTick().catch(error => {
            this.log.warn(`Error in patrol tick: ${error.message}`);
          });
        } catch (error) {
          this.log.warn(`Error executing patrol tick: ${error.message}`);
        }
      }, 1000);
      
      return true;
    } catch (error) {
      this.log.error(`Failed to set up patrol: ${error.message}`);
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
        try {
          this._checkForThreats(this.protectionTarget.position, radius)
            .catch(error => {
              this.log.warn(`Error checking for threats: ${error.message}`);
            });
        } catch (error) {
          this.log.warn(`Error in threat check: ${error.message}`);
        }
      }, 2000);
      
      return true;
    } catch (error) {
      this.log.error(`Failed to guard position: ${error.message}`);
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
      const entities = Object.values(this.bot.entities || {})
        .filter(entity => {
          // Filter by type
          if (!entity || entity.type !== 'mob') {
            return false;
          }
          
          // Check if entity is hostile
          if (!this._isHostileMob(entity)) {
            return false;
          }
          
          // Check if entity is in range
          return entity.position && entity.position.distanceTo(position) <= radius;
        })
        .sort((a, b) => 
          a.position.distanceTo(position) - b.position.distanceTo(position)
        );
      
      if (entities.length > 0) {
        // Attack nearest hostile entity
        this.log.info(`Attacking hostile mob: ${entities[0].name || entities[0].displayName || 'unknown'}`);
        await this.attackEntity({ entity: entities[0], continuous: true });
      }
      
      // Check for hostile players based on aggression level
      if (this.aggressionLevel === 'high') {
        const players = Object.values(this.bot.players || {})
          .filter(player => {
            // Skip if no entity
            if (!player || !player.entity) return false;
            
            // Skip if whitelisted
            if (this.whitelist.includes(player.username)) return false;
            
            // Skip if it's the guarded player
            if (this.guardingPlayer && player.username === this.guardingPlayer.name) return false;
            
            // Skip if it's the bot itself
            if (player.username === this.bot.username) return false;
            
            // Check if player is in range
            return player.entity.position && player.entity.position.distanceTo(position) <= radius;
          })
          .sort((a, b) => 
            a.entity.position.distanceTo(position) - b.entity.position.distanceTo(position)
          );
        
        if (players.length > 0) {
          // Only attack non-whitelisted players that are not being guarded
          const targetPlayer = players[0];
          
          // Double-check this is not the guarded player
          if (!this.guardingPlayer || targetPlayer.username !== this.guardingPlayer.name) {
            this.log.info(`Attacking hostile player: ${targetPlayer.username}`);
            await this.attackEntity({ entity: targetPlayer.entity, continuous: true });
          }
        }
      }
    } catch (error) {
      this.log.warn(`Error checking for threats: ${error.message}`);
    }
  }
  
  /**
   * Determine if a mob is hostile
   * @private
   * @param {Entity} entity - The entity to check
   * @returns {boolean} - Whether the entity is hostile
   */
  _isHostileMob(entity) {
    try {
      if (!entity || !entity.name) return false;
      
      // List of known hostile mob types
      const hostileMobs = [
        'zombie', 'skeleton', 'creeper', 'spider', 'enderman', 
        'witch', 'slime', 'phantom', 'drowned', 'piglin', 
        'zombified_piglin', 'blaze', 'ghast', 'magma_cube', 
        'hoglin', 'zoglin', 'warden', 'evoker', 'vindicator', 
        'ravager', 'vex', 'shulker', 'stray', 'husk', 'wither'
      ];
      
      // Check if entity is in hostile mob list
      const mobName = entity.name.toLowerCase();
      return hostileMobs.some(mobType => mobName.includes(mobType));
    } catch (error) {
      // If any error occurs, assume not hostile for safety
      this.log.debug(`Error checking if mob is hostile: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Attack an entity
   * @param {Object} options - Attack options
   * @param {Entity} options.entity - Entity to attack
   * @param {boolean} options.continuous - Whether to continuously attack
   * @returns {Promise<boolean>} - Whether attack was initiated
   */
  async attackEntity({ entity, continuous = false }) {
    if (!this.bot || !this.active) {
      return false;
    }
    
    try {
      // Double-check entity is valid
      if (!entity || !entity.position) {
        this.log.warn('Cannot attack: entity is invalid or has no position');
        return false;
      }
      
      // Don't attack if no PVP plugin or no entity
      if (!this.bot.pvp) {
        this.log.warn('PVP plugin not available');
        return false;
      }
      
      // Don't attack guarded player
      if (this.guardingPlayer && entity.username === this.guardingPlayer.name) {
        this.log.warn(`Refusing to attack guarded player: ${entity.username}`);
        return false;
      }
      
      // Don't attack whitelisted players
      if (entity.username && this.whitelist.includes(entity.username)) {
        this.log.warn(`Refusing to attack whitelisted player: ${entity.username}`);
        return false;
      }
      
      // Double-check we're not attacking ourselves
      if (entity === this.bot.entity) {
        this.log.warn('Refusing to attack self');
        return false;
      }
      
      // Equip best weapon
      await this._equipBestWeapon();
      
      // Set target and attack
      this.targetEntity = entity;
      
      if (continuous) {
        try {
          // Use PVP plugin's attack
          await this.bot.pvp.attack(entity);
        } catch (attackError) {
          this.log.warn(`PVP attack error: ${attackError.message}`);
          // Fall back to single attack if continuous fails
          if (this.bot.attack) {
            await this.bot.attack(entity);
          }
        }
      } else {
        // Single attack
        if (this.bot.attack) {
          await this.bot.attack(entity);
        } else {
          this.log.warn('Attack method not available');
          return false;
        }
      }
      
      return true;
    } catch (error) {
      this.log.warn(`Failed to attack entity: ${error.message}`);
      return false;
    }
  }
  
  /**
   * Patrol tick - handles movement between patrol points
   * @private
   */
  async _patrolTick() {
    if (!this.patrolling || !this.active || !this.bot) return;
    
    try {
      // Check if we've reached the current patrol point
      const currentPoint = this.patrolPoints[this.currentPatrolIndex];
      const distanceToPoint = this.bot.entity.position.distanceTo(currentPoint);
      
      if (distanceToPoint <= 2) {
        // We've reached the current point, check for threats
        this._checkForThreats(currentPoint, this.patrolCheckRadius);
        
        // Move to next point
        this.currentPatrolIndex = (this.currentPatrolIndex + 1) % this.patrolPoints.length;
        const nextPoint = this.patrolPoints[this.currentPatrolIndex];
        
        // Only try to move if not in combat
        if (!this.targetEntity) {
          this.bot.pathfinder.setGoal(null); // Cancel current movement
          this.goTo(nextPoint).catch(e => this.log.warn(`Navigation error: ${e.message}`));
        }
      } else if (!this.targetEntity && !this.bot.pathfinder.isMoving()) {
        // If we're not moving and should be, try to move to the current point
        this.goTo(currentPoint).catch(e => this.log.warn(`Navigation error: ${e.message}`));
      }
    } catch (error) {
      this.log.warn(`Error in patrol tick: ${error.message}`);
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
        // Player not visible, just log and return - don't try to move
        this.log.debug(`Player ${this.guardingPlayer.name} not visible, waiting`);
        return;
      }
      
      const playerPos = player.entity.position;
      const botPos = this.bot.entity.position;
      const followDist = this.guardingPlayer.followDistance;
      
      // Check for nearby hostile entities
      const nearbyHostileFilter = entity => {
        try {
          // Skip invalid entities
          if (!entity || !entity.position) return false;
          
          // Skip the guarded player
          if (entity === player.entity) return false;
          
          // Skip the bot itself
          if (entity === this.bot.entity) return false;
          
          // Check if hostile mob
          const isHostileMob = entity.type === 'mob' && this._isHostileMob(entity);
          
          // Check if hostile player (not whitelisted and not the guarded player)
          const isHostilePlayer = entity.type === 'player' && 
                                entity.username && // Make sure username exists
                                !this.whitelist.includes(entity.username) && 
                                entity.username !== this.guardingPlayer.name &&
                                entity.username !== this.bot.username;
          
          // Check if in range of the player
          const isNearPlayer = entity.position.distanceTo(playerPos) < 16;
          
          return isNearPlayer && (isHostileMob || (isHostilePlayer && this.aggressionLevel === 'high'));
        } catch (error) {
          // If any error occurs in filtering, just skip this entity
          this.log.debug(`Error filtering entity: ${error.message}`);
          return false;
        }
      };
      
      // Find nearest hostile entity to the player
      let hostileEntity = null;
      try {
        hostileEntity = this.bot.nearestEntity(nearbyHostileFilter);
      } catch (error) {
        this.log.warn(`Error finding nearest entity: ${error.message}`);
      }
      
      if (hostileEntity) {
        // Attack the hostile entity
        this.log.info(`Protecting ${this.guardingPlayer.name} from ${hostileEntity.name || hostileEntity.username || 'hostile entity'}`);
        await this.attackEntity({ entity: hostileEntity, continuous: true });
      } else if (!this.targetEntity) {
        // No threats, follow player if too far
        if (botPos.distanceTo(playerPos) > followDist + 5) {
          // Move closer to player
          this.currentTask = `Following ${this.guardingPlayer.name}`;
          try {
            // Create pathfinding goal to follow the player
            const goal = new goals.GoalFollow(player.entity, followDist);
            this.bot.pathfinder.setGoal(goal, true);
          } catch (error) {
            this.log.warn(`Error setting follow goal: ${error.message}`);
            // Fall back to regular goTo if GoalFollow fails
            this.goTo(player.entity.position, followDist).catch(err => {
              this.log.warn(`Fallback navigation error: ${err.message}`);
            });
          }
        } else if (!this.bot.pathfinder.isMoving()) {
          // Look at the player when nearby and not moving
          try {
            await this.lookAt(player.entity);
          } catch (lookError) {
            this.log.debug(`Error looking at player: ${lookError.message}`);
          }
        }
      }
    } catch (error) {
      // Use simple log instead of _handleError
      this.log.warn(`Error in guard tick: ${error.message}`);
    }
  }
  
  /**
   * Stop any active protection tasks
   * @private
   */
  _stopProtectionTasks() {
    try {
      // Stop patrolling
      this.patrolling = false;
      this.patrolPoints = [];
      this.currentPatrolIndex = 0;
      
      // Stop guarding player
      this.guardingPlayer = null;
      
      // Clear all intervals safely
      if (this.guardTickInterval) {
        clearInterval(this.guardTickInterval);
        this.guardTickInterval = null;
      }
      
      if (this.patrolTickInterval) {
        clearInterval(this.patrolTickInterval);
        this.patrolTickInterval = null;
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
      
      // Stop any pathfinding
      if (this.bot && this.bot.pathfinder) {
        try {
          this.bot.pathfinder.setGoal(null);
        } catch (error) {
          this.log.debug(`Error stopping pathfinder: ${error.message}`);
        }
      }
    } catch (error) {
      this.log.warn(`Error stopping protection tasks: ${error.message}`);
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
      this.log.error(`Failed to equip gear: ${error.message}`);
      return false;
    }
  }

  /**
   * Equip best available weapon
   * @private
   * @returns {Promise<boolean>} - Whether operation was successful
   */
  async _equipBestWeapon() {
    try {
      if (!this.bot || !this.bot.inventory) {
        return false;
      }
      
      // Weapon priority
      const weaponPriority = [
        'netherite_sword',
        'diamond_sword',
        'iron_sword',
        'stone_sword',
        'golden_sword',
        'wooden_sword',
        'netherite_axe',
        'diamond_axe',
        'iron_axe',
        'stone_axe',
        'golden_axe',
        'wooden_axe'
      ];
      
      // Find best weapon in inventory
      let bestWeapon = null;
      
      for (const weaponName of weaponPriority) {
        const weapon = this.bot.inventory.items().find(item => 
          item.name === weaponName
        );
        
        if (weapon) {
          bestWeapon = weapon;
          break;
        }
      }
      
      // Equip if found
      if (bestWeapon) {
        await this.bot.equip(bestWeapon, 'hand');
        return true;
      }
      
      return false;
    } catch (error) {
      this.log.warn(`Failed to equip best weapon: ${error.message}`);
      return false;
    }
  }

  /**
   * Handle protector-specific commands
   * @param {string} username - Username of the player who sent the command
   * @param {string} command - The command (without prefix) 
   * @param {Array<string>} args - Command arguments
   */
  handleCommand(username, command, args) {
    this.log.info(`ProtectorBot received command: ${command} ${args.join(' ')}`);
    
    switch (command) {
      case 'guard':
        this._handleGuardCommand(username, args);
        break;
      case 'patrol':
        this._handlePatrolCommand(username, args);
        break;
      case 'attack':
        this._handleAttackCommand(username, args);
        break;
      case 'follow':
        this._handleFollowCommand(username, args);
        break;
      case 'whitelist':
        this._handleWhitelistCommand(username, args);
        break;
      case 'aggression':
        this._handleAggressionCommand(username, args);
        break;
      case 'stopprotection':
        this._handleStopProtectionCommand(username);
        break;
      case 'help':
        this._displayProtectorHelp(username);
        break;
      default:
        // Try base commands
        super._handleCommand(username, command, args);
        break;
    }
  }

  /**
   * Handle the guard command
   * @private
   * @param {string} username - Username of the player who sent the command
   * @param {Array<string>} args - Command arguments
   */
  async _handleGuardCommand(username, args) {
    try {
      if (args.length === 0) {
        // Guard the player who sent the command
        this.chat(`Starting to guard you, ${username}.`);
        await this.guardPlayer({ playerName: username });
      } else if (args.length === 1) {
        // Guard another player
        const targetPlayer = args[0];
        this.chat(`Starting to guard ${targetPlayer}.`);
        await this.guardPlayer({ playerName: targetPlayer });
      } else if (args.length >= 3) {
        // Guard a position
        const x = parseInt(args[0]);
        const y = parseInt(args[1]);
        const z = parseInt(args[2]);
        const radius = args.length >= 4 ? parseInt(args[3]) : 16;
        
        if (isNaN(x) || isNaN(y) || isNaN(z) || isNaN(radius)) {
          this.chat('Invalid coordinates or radius. Usage: guard <x> <y> <z> [radius]');
          return;
        }
        
        this.chat(`Guarding position (${x}, ${y}, ${z}) with radius ${radius}.`);
        await this.guardPosition({ position: { x, y, z }, radius });
      } else {
        this.chat('Usage: guard [player] or guard <x> <y> <z> [radius]');
      }
    } catch (error) {
      this.log.error(`Error handling guard command: ${error.message}`);
      this.chat(`Could not execute guard command: ${error.message}`);
    }
  }

  /**
   * Handle the patrol command
   * @private
   * @param {string} username - Username of the player who sent the command
   * @param {Array<string>} args - Command arguments
   */
  async _handlePatrolCommand(username, args) {
    try {
      if (args.length < 6) {
        this.chat('Usage: patrol <x1> <y1> <z1> <x2> <y2> <z2> [checkRadius]');
        return;
      }
      
      const x1 = parseInt(args[0]);
      const y1 = parseInt(args[1]);
      const z1 = parseInt(args[2]);
      const x2 = parseInt(args[3]);
      const y2 = parseInt(args[4]);
      const z2 = parseInt(args[5]);
      const checkRadius = args.length >= 7 ? parseInt(args[6]) : 5;
      
      if ([x1, y1, z1, x2, y2, z2, checkRadius].some(isNaN)) {
        this.chat('Invalid coordinates or radius. Usage: patrol <x1> <y1> <z1> <x2> <y2> <z2> [checkRadius]');
        return;
      }
      
      this.chat(`Starting patrol between (${x1}, ${y1}, ${z1}) and (${x2}, ${y2}, ${z2}) with check radius ${checkRadius}.`);
      
      const points = [
        { x: x1, y: y1, z: z1 },
        { x: x1, y: y1, z: z2 },
        { x: x2, y: y2, z: z2 },
        { x: x2, y: y2, z: z1 }
      ];
      
      await this.patrol({ points, radius: checkRadius });
    } catch (error) {
      this.log.error(`Error handling patrol command: ${error.message}`);
      this.chat(`Could not execute patrol command: ${error.message}`);
    }
  }

  /**
   * Handle the attack command
   * @private
   * @param {string} username - Username of the player who sent the command
   * @param {Array<string>} args - Command arguments
   */
  async _handleAttackCommand(username, args) {
    try {
      if (args.length === 0) {
        this.chat('Usage: attack <mob> or attack <player>');
        return;
      }
      
      const targetName = args[0];
      let target = this.bot.players[targetName]?.entity;
      
      if (!target) {
        // Try to find a mob with this name
        const entities = Object.values(this.bot.entities).filter(e => 
          e.name?.toLowerCase() === targetName.toLowerCase() ||
          e.username?.toLowerCase() === targetName.toLowerCase() ||
          e.displayName?.toLowerCase().includes(targetName.toLowerCase())
        );
        
        if (entities.length > 0) {
          target = entities[0];
        }
      }
      
      if (!target) {
        this.chat(`Couldn't find target: ${targetName}`);
        return;
      }
      
      // Don't attack if whitelisted
      if (target.username && this.whitelist.includes(target.username)) {
        this.chat(`${target.username} is on my whitelist. I won't attack them.`);
        return;
      }
      
      this.chat(`Attacking ${target.username || target.displayName || target.name}!`);
      
      if (this.bot.pvp) {
        this.targetEntity = target;
        await this.bot.pvp.attack(target);
      } else {
        this.chat("PVP capabilities not available.");
      }
    } catch (error) {
      this.chat(`Error handling attack command: ${error.message}`);
    }
  }

  /**
   * Handle the follow command
   * @private
   * @param {string} username - Username of the player who sent the command
   * @param {Array<string>} args - Command arguments
   */
  async _handleFollowCommand(username, args) {
    try {
      const playerName = args.length > 0 ? args[0] : username;
      const followDistance = args.length > 1 ? parseInt(args[1]) : 3;
      
      if (isNaN(followDistance)) {
        this.chat('Invalid follow distance. Usage: follow [player] [distance]');
        return;
      }
      
      this.chat(`Following ${playerName} at distance ${followDistance}.`);
      await this.guardPlayer({ playerName, followDistance });
    } catch (error) {
      this.log.error(`Error handling follow command: ${error.message}`);
      this.chat(`Could not execute follow command: ${error.message}`);
    }
  }

  /**
   * Handle the whitelist command
   * @private
   * @param {string} username - Username of the player who sent the command
   * @param {Array<string>} args - Command arguments
   */
  _handleWhitelistCommand(username, args) {
    try {
      if (args.length < 2) {
        this.chat('Usage: whitelist add/remove <player>');
        return;
      }
      
      const action = args[0].toLowerCase();
      const targetPlayer = args[1];
      
      if (action === 'add') {
        if (this.whitelistPlayer(targetPlayer)) {
          this.chat(`Added ${targetPlayer} to whitelist.`);
        } else {
          this.chat(`Failed to add ${targetPlayer} to whitelist.`);
        }
      } else if (action === 'list') {
        const whitelistText = this.whitelist.length > 0 
          ? `Whitelist: ${this.whitelist.join(', ')}` 
          : 'Whitelist is empty';
        this.chat(whitelistText);
      } else if (action === 'remove') {
        if (this.unwhitelistPlayer(targetPlayer)) {
          this.chat(`Removed ${targetPlayer} from whitelist.`);
        } else {
          this.chat(`Failed to remove ${targetPlayer} from whitelist.`);
        }
      } else {
        this.chat('Usage: whitelist add/remove/list <player>');
      }
    } catch (error) {
      this.chat(`Error handling whitelist command: ${error.message}`);
    }
  }

  /**
   * Handle the aggression command
   * @private
   * @param {string} username - Username of the player who sent the command
   * @param {Array<string>} args - Command arguments
   */
  _handleAggressionCommand(username, args) {
    try {
      if (args.length === 0) {
        this.chat(`Current aggression level: ${this.aggressionLevel}`);
        return;
      }
      
      const level = args[0].toLowerCase();
      
      if (!['low', 'medium', 'high'].includes(level)) {
        this.chat('Invalid aggression level. Use: low, medium, or high');
        return;
      }
      
      if (this.setAggressionLevel(level)) {
        this.chat(`Aggression level set to ${level}.`);
      } else {
        this.chat(`Failed to set aggression level to ${level}.`);
      }
    } catch (error) {
      this.chat(`Error handling aggression command: ${error.message}`);
    }
  }

  /**
   * Handle the stopprotection command
   * @private
   * @param {string} username - Username of the player who sent the command
   */
  _handleStopProtectionCommand(username) {
    try {
      this.stopProtection();
      this.chat('Stopped all protection activities.');
    } catch (error) {
      this.log.error(`Error stopping protection: ${error.message}`);
      this.chat(`Could not stop protection: ${error.message}`);
    }
  }

  /**
   * Display help for protector commands
   * @private
   * @param {string} username - Username of the player who sent the command
   */
  _displayProtectorHelp(username) {
    const prefix = mainConfig.system.commandPrefix;
    const helpMessages = [
      `${prefix}guard [player] or ${prefix}guard <x> <y> <z> [radius] - Guard a player or position`,
      `${prefix}patrol <x1> <y1> <z1> <x2> <y2> <z2> [radius] - Patrol between points`,
      `${prefix}follow [player] [distance] - Follow a player`,
      `${prefix}attack <mob/player> - Attack a specific target`,
      `${prefix}whitelist add/remove/list <player> - Manage whitelist`,
      `${prefix}aggression [low/medium/high] - Set aggression level`,
      `${prefix}stopprotection - Stop current protection task`,
      `${prefix}status - Show bot status`,
      `${prefix}come - Bot comes to you`,
      `${prefix}look [player/coordinates] - Look at target`,
      `${prefix}stop - Stop current task`
    ];
    
    // Send in batches to avoid chat rate limiting
    this.chat(`=== ProtectorBot Commands ===`);
    
    // Send messages with slight delay to avoid chat rate limiting
    let i = 0;
    const sendNextMessage = () => {
      if (i < helpMessages.length) {
        this.chat(helpMessages[i]);
        i++;
        setTimeout(sendNextMessage, 500);
      }
    };
    
    sendNextMessage();
  }

  /**
   * Stop attacking current target
   * @returns {boolean} - Whether operation was successful
   */
  stopAttacking() {
    try {
      if (this.bot && this.bot.pvp) {
        this.bot.pvp.stop();
      }
      
      this.targetEntity = null;
      return true;
    } catch (error) {
      this.log.warn(`Failed to stop attacking: ${error.message}`);
      return false;
    }
  }
}

module.exports = ProtectorBot; 