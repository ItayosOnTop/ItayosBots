/**
 * Protector Bot - Specialized bot for security and combat
 */

const BaseBot = require('./baseBot');
const { logger } = require('../utils/logger');
const { goals, Movements } = require('mineflayer-pathfinder');
const Vec3 = require('vec3').Vec3;
const { plugin: pvpPlugin } = require('mineflayer-pvp');
const { plugin: autoEatPlugin } = require('mineflayer-auto-eat');

class ProtectorBot extends BaseBot {
  /**
   * Create a new protector bot instance
   * @param {Object} bot - Mineflayer bot instance
   * @param {Object} typeConfig - Type-specific configuration
   * @param {Object} globalConfig - Global configuration
   * @param {Object} dataStore - Shared data store
   */
  constructor(bot, typeConfig, globalConfig, dataStore) {
    super(bot, typeConfig, globalConfig, dataStore);
    
    // Load the PVP plugin correctly
    bot.loadPlugin(pvpPlugin);
    
    // Load auto-eat plugin
    bot.loadPlugin(autoEatPlugin);
    
    // Configure auto-eat
    bot.autoEat.options = {
      priority: 'foodPoints',
      startAt: 14,
      bannedFood: []
    };
    
    // Protector-specific state
    this.state = {
      ...this.state,
      guardTarget: null,
      patrolPoints: [],
      currentPatrolIndex: 0,
      threatsDetected: [],
      guardPosition: null,
      isGuarding: false,
      isFollowing: false,
      followTarget: null
    };
    
    // Configure protector behavior
    this.protectionRadius = typeConfig.protectionRadius || 15;
    this.aggressionLevel = typeConfig.aggressionLevel || 'medium';
    this.retreatHealthThreshold = typeConfig.retreatHealthThreshold || 7;
    
    // Register event handlers
    this.setupProtectorEvents();
  }
  
  /**
   * Set up protector-specific event handlers
   */
  setupProtectorEvents() {
    // Auto-equip shield when collected
    this.bot.on('playerCollect', (collector, itemDrop) => {
      if (collector !== this.bot.entity) return;
      
      setTimeout(() => {
        const shield = this.bot.inventory.items().find(item => item.name.includes('shield'));
        if (shield) this.bot.equip(shield, 'off-hand');
      }, 250);
    });
    
    // Scan for hostile mobs on physics tick
    this.bot.on('physicsTick', () => {
      // Every 1 second (20 ticks)
      if (this.bot.time.age % 20 === 0) {
        this.scanForThreats();
      }
      
      // Look at nearby entities when not attacking or moving
      if (!this.bot.pvp?.target && !this.bot.pathfinder.isMoving()) {
        const entity = this.bot.nearestEntity();
        if (entity) {
          this.bot.lookAt(entity.position.offset(0, entity.height, 0));
        }
      }
      
      // Handle guarding - attack mobs that come near guard position
      if (this.state.isGuarding && this.state.guardPosition) {
        // Skip if already attacking something
        if (this.bot.pvp?.target) return;
        
        // Find hostile entities near guard position
        const mcData = require('minecraft-data')(this.bot.version);
        const filter = e => {
          return (e.type === 'mob' && this.isHostileMob(e)) || 
                 (e.type === 'player' && e.username !== this.bot.username && 
                  e.username !== this.globalConfig.owner.minecraftUsername) &&
                 e.position.distanceTo(this.state.guardPosition) < this.protectionRadius;
        };
        
        const entity = this.bot.nearestEntity(filter);
        if (entity) {
          logger.info(`${this.bot.username} detected ${entity.name || entity.username} near guard position, attacking`);
          
          // Equip best weapon
          this.equipBestWeapon().then(() => {
            if (this.bot.pvp) this.bot.pvp.attack(entity);
          });
        }
      }
      
      // Handle following - follow player and protect them
      if (this.state.isFollowing && this.state.followTarget) {
        // Check if the player is still visible
        const player = this.bot.players[this.state.followTarget];
        
        if (!player || !player.entity) {
          logger.warn(`${this.bot.username} lost sight of ${this.state.followTarget}`);
          return;
        }
        
        // If already attacking a mob, don't look for new ones
        if (this.bot.pvp?.target) return;
        
        // Find hostile entities near the player
        const filter = e => {
          return (e.type === 'mob' && this.isHostileMob(e)) &&
                 e.position.distanceTo(player.entity.position) < this.protectionRadius;
        };
        
        const entity = this.bot.nearestEntity(filter);
        if (entity) {
          logger.info(`${this.bot.username} detected ${entity.name} near ${this.state.followTarget}, attacking`);
          
          // Equip best weapon
          this.equipBestWeapon().then(() => {
            this.bot.chat(`I see a ${entity.name} near you, attacking!`);
            if (this.bot.pvp) this.bot.pvp.attack(entity);
          });
        }
      }
    });
    
    // After stopping an attack, return to guard position
    this.bot.on('stoppedAttacking', () => {
      if (this.state.isGuarding && this.state.guardPosition) {
        this.moveToGuardPos();
      }
    });
    
    // Handle being attacked
    this.bot.on('entityHurt', (entity) => {
      if (entity === this.bot.entity) {
        this.handleBeingAttacked();
      }
    });
    
    // Handle death
    this.bot.on('death', () => {
      logger.warn(`${this.bot.username} died, will try to return to duty after respawn`);
      this.bot.chat("I've been defeated, but I'll return to duty after respawning!");
    });
    
    // Handle respawn
    this.bot.on('spawn', () => {
      // Wait a bit before re-equipping gear
      setTimeout(() => {
        this.checkAndEquipBestGear();
        
        // Return to guard position if we were guarding
        if (this.state.isGuarding && this.state.guardPosition) {
          logger.info(`${this.bot.username} respawned, returning to guard position`);
          this.moveToGuardPos();
        }
        
        // Resume following if we were following someone
        if (this.state.isFollowing && this.state.followTarget) {
          logger.info(`${this.bot.username} respawned, resuming following ${this.state.followTarget}`);
          this.followPlayer(this.state.followTarget);
        }
      }, 1000);
    });
  }
  
  /**
   * Move to the guard position
   */
  moveToGuardPos() {
    if (!this.state.guardPosition) return;
    
    logger.info(`${this.bot.username} moving to guard position at ${this.state.guardPosition.x}, ${this.state.guardPosition.y}, ${this.state.guardPosition.z}`);
    
    // Use pathfinder to move to the guard position
    const mcData = require('minecraft-data')(this.bot.version);
    const movements = new Movements(this.bot, mcData);
    movements.scafoldingBlocks = ['dirt', 'cobblestone', 'stone'];
    this.bot.pathfinder.setMovements(movements);
    this.bot.pathfinder.setGoal(new goals.GoalBlock(
      this.state.guardPosition.x,
      this.state.guardPosition.y,
      this.state.guardPosition.z
    ));
  }
  
  /**
   * Start guarding a location
   * @param {Object} position - Position to guard (x, y, z)
   */
  startGuardingPosition(position) {
    logger.info(`${this.bot.username} starting to guard position ${position.x}, ${position.y}, ${position.z}`);
    
    // Update state
    this.state.guardPosition = position.clone();
    this.state.isGuarding = true;
    this.state.isFollowing = false;
    this.state.followTarget = null;
    this.state.guardTarget = {
      type: 'location',
      ...position,
    };
    this.state.currentTask = `Guarding location ${position.x}, ${position.y}, ${position.z}`;
    
    // Move to guard position
    this.moveToGuardPos();
    
    // Equip best gear
    this.checkAndEquipBestGear();
    
    return `Guarding position at ${position.x}, ${position.y}, ${position.z}`;
  }
  
  /**
   * Start following and protecting a player
   * @param {string} username - Username of player to follow
   */
  followPlayer(username) {
    logger.info(`${this.bot.username} starting to follow and protect ${username}`);
    
    const player = this.bot.players[username];
    
    if (!player || !player.entity) {
      return `I can't see ${username}`;
    }
    
    // Update state
    this.state.isGuarding = false;
    this.state.guardPosition = null;
    this.state.isFollowing = true;
    this.state.followTarget = username;
    this.state.guardTarget = {
      type: 'player',
      username,
    };
    this.state.currentTask = `Following and protecting ${username}`;
    
    // Set up pathfinder to follow the player
    const mcData = require('minecraft-data')(this.bot.version);
    const movements = new Movements(this.bot, mcData);
    movements.scafoldingBlocks = ['dirt', 'cobblestone', 'stone'];
    this.bot.pathfinder.setMovements(movements);
    
    const goal = new goals.GoalFollow(player.entity, 2);
    this.bot.pathfinder.setGoal(goal, true);
    
    // Equip best gear
    this.checkAndEquipBestGear();
    
    return `Following and protecting ${username}`;
  }
  
  /**
   * Stop guarding/following
   */
  stopGuarding() {
    logger.info(`${this.bot.username} stopped guarding/following`);
    
    // Update state
    this.state.isGuarding = false;
    this.state.guardPosition = null;
    this.state.isFollowing = false;
    this.state.followTarget = null;
    this.state.guardTarget = null;
    this.state.currentTask = null;
    
    // Clear patrol interval if it exists
    if (this.patrolInterval) {
      clearInterval(this.patrolInterval);
      this.patrolInterval = null;
    }
    
    // Stop pathfinding and combat
    if (this.bot.pvp) this.bot.pvp.stop();
    this.bot.pathfinder.setGoal(null);
    
    return "I've stopped guarding/following";
  }
  
  /**
   * Scan surroundings for threats
   */
  scanForThreats() {
    try {
      // Skip if already in combat
      if (this.bot.pvp?.target) return;
      
      // Get all entities within protection radius
      const entities = Object.values(this.bot.entities);
      const botPosition = this.bot.entity.position;
      
      // Filter for hostile mobs within range
      const threats = entities.filter(entity => {
        if (!this.isHostileMob(entity)) return false;
        
        const distance = entity.position.distanceTo(botPosition);
        return distance <= this.protectionRadius;
      });
      
      // Update threats detected
      this.state.threatsDetected = threats.map(entity => ({
        id: entity.id,
        type: entity.name,
        position: entity.position,
        health: entity.health,
        distance: entity.position.distanceTo(botPosition),
      }));
      
      // Share threat information
      for (const threat of this.state.threatsDetected) {
        this.dataStore.addThreat(
          threat.type, 
          { x: threat.position.x, y: threat.position.y, z: threat.position.z }, 
          'medium'
        );
      }
    } catch (err) {
      logger.error(`Error scanning for threats:`, err);
    }
  }
  
  /**
   * Handle being attacked
   */
  handleBeingAttacked() {
    try {
      // Try to identify attacker
      const attacker = this.findAttacker();
      
      if (attacker) {
        // Log the attack
        logger.info(`${this.bot.username} was attacked by ${attacker.name || attacker.username}`);
        
        // If health is below threshold, retreat
        if (this.bot.health <= this.retreatHealthThreshold) {
          this.retreat();
          return;
        }
        
        // Otherwise, fight back
        if (this.isHostileMob(attacker) || (attacker.type === 'player' && attacker.username !== this.globalConfig.owner.minecraftUsername)) {
          // Equip best weapon before attacking
          this.equipBestWeapon().then(() => {
            if (this.bot.pvp) this.bot.pvp.attack(attacker);
          });
        }
      }
    } catch (err) {
      logger.error(`Error handling attack:`, err);
    }
  }
  
  /**
   * Find the entity that most likely attacked us
   * @returns {Object|null} - The attacking entity or null if not found
   */
  findAttacker() {
    try {
      const entities = Object.values(this.bot.entities);
      const botPosition = this.bot.entity.position;
      
      // Sort by distance
      const nearbyEntities = entities
        .filter(entity => entity !== this.bot.entity)
        .sort((a, b) => {
          return a.position.distanceTo(botPosition) - b.position.distanceTo(botPosition);
        });
      
      // Prioritize hostile mobs
      const hostileMobs = nearbyEntities.filter(entity => this.isHostileMob(entity));
      
      if (hostileMobs.length > 0) {
        return hostileMobs[0];
      }
      
      // If no hostile mobs, return closest entity
      return nearbyEntities.length > 0 ? nearbyEntities[0] : null;
    } catch (err) {
      logger.error(`Error finding attacker:`, err);
      return null;
    }
  }
  
  /**
   * Check if an entity is a hostile mob
   * @param {Object} entity - Entity to check
   * @returns {boolean} - Whether the entity is hostile
   */
  isHostileMob(entity) {
    if (!entity || !entity.name) return false;
    
    const hostileTypes = [
      'zombie', 'skeleton', 'spider', 'creeper', 'enderman', 
      'witch', 'slime', 'cave_spider', 'silverfish', 'zombie_villager',
      'husk', 'stray', 'evoker', 'vex', 'vindicator', 'illusioner',
      'pillager', 'ravager', 'phantom', 'drowned', 'blaze', 'ghast', 'magma_cube'
    ];
    
    return entity.type === 'mob' && 
      hostileTypes.some(type => entity.name.toLowerCase().includes(type));
  }
  
  /**
   * Retreat from combat
   */
  retreat() {
    try {
      logger.info(`${this.bot.username} retreating due to low health (${this.bot.health})`);
      
      this.state.currentTask = 'Retreating';
      
      // Stop current attack
      this.bot.pvp.stop();
      
      // Ensure best gear is equipped before retreating
      this.checkAndEquipBestGear();
      
      // Try to find a safe place
      const safeZones = this.globalConfig.safeZones || [];
      
      if (safeZones.length > 0) {
        // Find closest safe zone
        const botPos = this.bot.entity.position;
        let closestZone = null;
        let closestDistance = Infinity;
        
        for (const zone of safeZones) {
          const distance = Math.sqrt(
            Math.pow(zone.x - botPos.x, 2) + 
            Math.pow(zone.y - botPos.y, 2) + 
            Math.pow(zone.z - botPos.z, 2)
          );
          
          if (distance < closestDistance) {
            closestDistance = distance;
            closestZone = zone;
          }
        }
        
        if (closestZone) {
          // Go to safe zone
          this.goToLocation(closestZone)
            .then(() => {
              this.state.currentTask = null;
              logger.info(`${this.bot.username} reached safe zone`);
              
              // After health restored, return to guard position if applicable
              if (this.state.isGuarding && this.state.guardPosition) {
                setTimeout(() => {
                  this.moveToGuardPos();
                }, 5000);
              }
            })
            .catch(err => {
              logger.error(`Error retreating to safe zone:`, err);
              this.state.currentTask = null;
            });
        }
      } else {
        // No safe zones, try to run away from threats
        const threats = this.state.threatsDetected;
        
        if (threats.length > 0) {
          // Calculate average threat position
          const avgPos = threats.reduce((acc, threat) => {
            acc.x += threat.position.x;
            acc.y += threat.position.y;
            acc.z += threat.position.z;
            return acc;
          }, { x: 0, y: 0, z: 0 });
          
          avgPos.x /= threats.length;
          avgPos.y /= threats.length;
          avgPos.z /= threats.length;
          
          // Run in opposite direction
          const botPos = this.bot.entity.position;
          const dx = botPos.x - avgPos.x;
          const dz = botPos.z - avgPos.z;
          const distance = Math.sqrt(dx * dx + dz * dz);
          
          if (distance > 0) {
            const retreatPos = {
              x: botPos.x + (dx / distance) * 20,
              y: botPos.y,
              z: botPos.z + (dz / distance) * 20,
            };
            
            this.goToLocation(retreatPos)
              .then(() => {
                this.state.currentTask = null;
                logger.info(`${this.bot.username} retreated from threats`);
                
                // After retreat, return to guard position if applicable
                if (this.state.isGuarding && this.state.guardPosition) {
                  setTimeout(() => {
                    this.moveToGuardPos();
                  }, 5000);
                }
              })
              .catch(err => {
                logger.error(`Error retreating from threats:`, err);
                this.state.currentTask = null;
              });
          }
        }
      }
    } catch (err) {
      logger.error(`Error retreating:`, err);
      this.state.currentTask = null;
    }
  }
  
  /**
   * Get the current status of the protector bot
   * @returns {Object} - Bot status information
   */
  getStatus() {
    return {
      ...super.getStatus(),
      type: 'protector',
      guardTarget: this.state.guardTarget,
      threats: this.state.threatsDetected.length,
      isGuarding: this.state.isGuarding,
      isFollowing: this.state.isFollowing,
      followTarget: this.state.followTarget
    };
  }
  
  /**
   * Handle a command directed at this protector bot
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
    
    // Protector-specific commands
    const protectorCommands = ['guard', 'patrol', 'stop', 'test'];
    
    // If not a protector command, don't respond
    if (!protectorCommands.includes(command)) {
      return null;
    }

    // Check for protector-specific commands
    switch (command) {
      case 'guard':
        if (args.length === 0) {
          // Guard current position
          const position = this.bot.entity.position.clone();
          return this.startGuardingPosition(position);
        }
        
        if (args.length === 1) {
          // Guard player
          const playerName = args[0];
          return this.followPlayer(playerName);
        } else if (args.length === 3) {
          // Guard location
          const x = parseInt(args[0]);
          const y = parseInt(args[1]);
          const z = parseInt(args[2]);
          
          if (isNaN(x) || isNaN(y) || isNaN(z)) {
            return 'Invalid coordinates. Usage: guard <x> <y> <z>';
          }
          
          const location = { x, y, z };
          return this.startGuardingPosition(location);
        } else {
          return 'Invalid arguments. Usage: guard <x> <y> <z> OR guard <player>';
        }
      
      case 'patrol':
        if (args.length >= 4 && args.length % 2 === 0) {
          // Create patrol points
          const points = [];
          
          for (let i = 0; i < args.length; i += 2) {
            const x = parseInt(args[i]);
            const z = parseInt(args[i + 1]);
            
            if (isNaN(x) || isNaN(z)) {
              return 'Invalid coordinates. Usage: patrol <x1> <z1> <x2> <z2> ...';
            }
            
            // Use bot's current y
            points.push({ x, y: this.bot.entity.position.y, z });
          }
          
          this.startPatrol(points);
          return `Patrolling ${points.length} points`;
        } else {
          return 'Invalid arguments. Usage: patrol <x1> <z1> <x2> <z2> ...';
        }
      
      case 'stop':
        // Stop any current guard/follow action or combat
        if (this.state.isGuarding || this.state.isFollowing || this.bot.pvp?.target) {
          return this.stopGuarding();
        } else {
          return "I'm not currently guarding or following anything.";
        }
      
      case 'test':
        // Test if PVP plugin is loaded correctly
        if (this.bot.pvp) {
          return `PVP plugin is loaded correctly. Available methods: ${Object.keys(this.bot.pvp).join(', ')}`;
        } else {
          return "PVP plugin is NOT loaded correctly!";
        }
        
      default:
        return null;
    }
  }
  
  /**
   * Start patrolling a set of points
   * @param {Array} points - Points to patrol
   * @returns {string} - Status message
   */
  startPatrol(points) {
    try {
      if (!points || points.length === 0) {
        logger.warn(`${this.bot.username} can't patrol with no points`);
        return "Cannot patrol with no points specified";
      }
      
      logger.info(`${this.bot.username} starting patrol with ${points.length} points`);
      
      // Update state
      this.state.patrolPoints = [...points];
      this.state.currentPatrolIndex = 0;
      this.state.isGuarding = false;
      this.state.guardPosition = null;
      this.state.isFollowing = false;
      this.state.followTarget = null;
      this.state.currentTask = `Patrolling (1/${points.length} points)`;
      
      // Stop any current combat
      this.bot.pvp.stop();
      
      // Start going to the first point
      const point = points[0];
      
      // Configure pathfinder
      const mcData = require('minecraft-data')(this.bot.version);
      const movements = new Movements(this.bot, mcData);
      movements.scafoldingBlocks = ['dirt', 'cobblestone', 'stone'];
      this.bot.pathfinder.setMovements(movements);
      
      // Set goal to the first patrol point
      this.bot.pathfinder.setGoal(new goals.GoalBlock(point.x, point.y, point.z));
      
      // Setup periodic check to move to next point
      this.patrolInterval = setInterval(() => {
        // If we're in combat, don't continue patrol yet
        if (this.bot.pvp?.target) return;
        
        // If we're not moving and not at the target, we need to go to the next point
        if (!this.bot.pathfinder.isMoving()) {
          const currentPoint = this.state.patrolPoints[this.state.currentPatrolIndex];
          const botPos = this.bot.entity.position;
          
          // Check if we've reached the current point (within 1 block)
          const distanceToTarget = Math.sqrt(
            Math.pow(currentPoint.x - botPos.x, 2) + 
            Math.pow(currentPoint.y - botPos.y, 2) + 
            Math.pow(currentPoint.z - botPos.z, 2)
          );
          
          if (distanceToTarget < 1) {
            // Move to next point
            this.state.currentPatrolIndex = (this.state.currentPatrolIndex + 1) % this.state.patrolPoints.length;
            const nextPoint = this.state.patrolPoints[this.state.currentPatrolIndex];
            
            logger.info(`${this.bot.username} moving to patrol point ${this.state.currentPatrolIndex + 1}/${this.state.patrolPoints.length}`);
            this.state.currentTask = `Patrolling (${this.state.currentPatrolIndex + 1}/${this.state.patrolPoints.length} points)`;
            
            // Set new goal
            this.bot.pathfinder.setGoal(new goals.GoalBlock(nextPoint.x, nextPoint.y, nextPoint.z));
          } else {
            // We're stuck, try going to the point again
            this.bot.pathfinder.setGoal(new goals.GoalBlock(currentPoint.x, currentPoint.y, currentPoint.z));
          }
        }
      }, 3000); // Check every 3 seconds
      
      return `Started patrolling ${points.length} points`;
    } catch (err) {
      logger.error(`Error starting patrol:`, err);
      return `Error starting patrol: ${err.message}`;
    }
  }
}

module.exports = ProtectorBot; 