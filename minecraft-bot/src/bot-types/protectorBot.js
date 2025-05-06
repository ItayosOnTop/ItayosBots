/**
 * Protector Bot - Specialized bot for security and combat
 */

const BaseBot = require('./baseBot');
const { logger } = require('../utils/logger');
const { goals } = require('mineflayer-pathfinder');
const Vec3 = require('vec3').Vec3;

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
    
    // Protector-specific state
    this.state = {
      ...this.state,
      guardTarget: null,
      patrolPoints: [],
      currentPatrolIndex: 0,
      threatsDetected: [],
    };
    
    // Configure protector behavior
    this.protectionRadius = typeConfig.protectionRadius || 50;
    this.aggressionLevel = typeConfig.aggressionLevel || 'medium';
    this.retreatHealthThreshold = typeConfig.retreatHealthThreshold || 7;
    
    // Register event handlers
    this.setupProtectorEvents();
  }
  
  /**
   * Set up protector-specific event handlers
   */
  setupProtectorEvents() {
    // Scan for hostile mobs
    this.bot.on('physicsTick', () => {
      // Every 2 seconds (40 ticks)
      if (this.bot.time.age % 40 === 0) {
        this.scanForThreats();
        
        // Actively check for and attack nearby threats regardless of guard status
        // This makes the guard proactively attack any hostile mobs in range
        if (this.state.threatsDetected.length > 0 && 
            (this.state.currentTask === null || 
             this.state.currentTask.includes('Patrolling') || 
             this.state.currentTask.includes('Guarding'))) {
          this.handleThreats();
        }
      }
    });
    
    // Handle being attacked
    this.bot.on('entityHurt', (entity) => {
      if (entity === this.bot.entity) {
        this.handleBeingAttacked();
      }
    });
    
    // Handle entities that come into view
    this.bot.on('entitySpawn', (entity) => {
      if (this.isHostileMob(entity)) {
        this.handleNewThreat(entity);
      }
    });
  }
  
  /**
   * Check if an entity is a hostile mob
   * @param {Object} entity - Entity to check
   * @returns {boolean} - Whether the entity is hostile
   */
  isHostileMob(entity) {
    return this.isHostileEntity(entity);
  }
  
  /**
   * Scan surroundings for threats
   */
  scanForThreats() {
    try {
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
      
      // Log detected threats for debugging
      if (this.state.threatsDetected.length > 0) {
        logger.debug(`${this.bot.username} detected ${this.state.threatsDetected.length} threats nearby`);
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
        logger.info(`${this.bot.username} was attacked by ${attacker.name} (${attacker.username || 'mob'})`);
        
        // If health is below threshold, retreat
        if (this.bot.health <= this.retreatHealthThreshold) {
          this.retreat();
          return;
        }
        
        // Otherwise, fight back if it's a hostile mob
        if (this.isHostileMob(attacker)) {
          this.attackEntity(attacker);
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
   * Handle new threat that has been detected
   * @param {Object} entity - The hostile entity
   */
  handleNewThreat(entity) {
    try {
      // Check if we're guarding something
      if (!this.state.guardTarget) return;
      
      // Check if the threat is within protection radius
      let guardPosition;
      
      if (this.state.guardTarget.type === 'location') {
        guardPosition = new Vec3(
          this.state.guardTarget.x,
          this.state.guardTarget.y,
          this.state.guardTarget.z
        );
      } else if (this.state.guardTarget.type === 'player') {
        const player = this.bot.players[this.state.guardTarget.username];
        if (!player || !player.entity) return;
        guardPosition = player.entity.position;
      } else {
        return;
      }
      
      const distance = entity.position.distanceTo(guardPosition);
      
      if (distance <= this.protectionRadius) {
        // Add to threats
        this.state.threatsDetected.push({
          id: entity.id,
          type: entity.name,
          position: entity.position,
          health: entity.health,
          distance: entity.position.distanceTo(this.bot.entity.position),
        });
        
        // Share threat information
        this.dataStore.addThreat(
          entity.name, 
          { x: entity.position.x, y: entity.position.y, z: entity.position.z }, 
          'medium'
        );
        
        // Handle the threat
        this.handleThreats();
      }
    } catch (err) {
      logger.error(`Error handling new threat:`, err);
    }
  }
  
  /**
   * Handle threats in the area
   */
  handleThreats() {
    try {
      // Sort threats by proximity
      const sortedThreats = [...this.state.threatsDetected]
        .sort((a, b) => a.distance - b.distance);
      
      if (sortedThreats.length === 0) return;
      
      // Get the closest threat
      const closestThreat = sortedThreats[0];
      
      // Make sure this entity still exists
      const entity = this.bot.entities[closestThreat.id];
      if (!entity) {
        // Remove from threats
        this.state.threatsDetected = this.state.threatsDetected
          .filter(threat => threat.id !== closestThreat.id);
        return;
      }
      
      // Attack the threat
      this.attackEntity(entity);
    } catch (err) {
      logger.error(`Error handling threats:`, err);
    }
  }
  
  /**
   * Attack a specific entity
   * @param {Object} entity - Entity to attack
   */
  async attackEntity(entity) {
    try {
      // Don't attack if already attacking the same entity
      if (this.state.currentTask === `Attacking ${entity.name}`) {
        return;
      }
      
      logger.info(`${this.bot.username} attacking ${entity.name}`);
      
      // Update current task
      this.state.currentTask = `Attacking ${entity.name}`;
      
      // Ensure we have the best weapon equipped
      await this.equipBestWeapon();
      
      // Clear any previous goals
      this.bot.pathfinder.setGoal(null);
      
      // Go to the entity
      this.bot.pathfinder.setMovements(this.movements);
      this.bot.pathfinder.setGoal(new goals.GoalFollow(entity, 2));
      
      // Attack when in range
      const attackInterval = setInterval(() => {
        if (!entity || !entity.isValid) {
          clearInterval(attackInterval);
          this.bot.pathfinder.setGoal(null);
          this.state.currentTask = null;
          
          // Remove from threats
          this.state.threatsDetected = this.state.threatsDetected
            .filter(threat => threat.id !== entity.id);
          
          // Remove from shared threats
          if (entity && entity.position) {
            this.dataStore.removeThreat(
              entity.name, 
              { x: entity.position.x, y: entity.position.y, z: entity.position.z }
            );
          }
          
          logger.info(`${this.bot.username} defeated ${entity.name || 'entity'}`);
          
          // Continue patrolling if we were patrolling
          if (this.state.patrolPoints && this.state.patrolPoints.length > 0) {
            this.continuePatrol();
          }
          return;
        }
        
        try {
          const distance = this.bot.entity.position.distanceTo(entity.position);
          
          if (distance <= 3) {
            // Attack
            this.bot.attack(entity);
            logger.debug(`${this.bot.username} attacking ${entity.name} at distance ${distance.toFixed(2)}`);
          } else if (distance > 10) {
            // If entity is too far, update goal to chase it
            this.bot.pathfinder.setGoal(new goals.GoalFollow(entity, 2), true);
          }
          
          // Check health
          if (this.bot.health <= this.retreatHealthThreshold) {
            clearInterval(attackInterval);
            this.bot.pathfinder.setGoal(null);
            this.retreat();
          }
        } catch (error) {
          logger.warn(`Error during attack loop: ${error.message}`);
        }
      }, 250); // Attack more frequently (every 250ms)
      
      // Stop attack after timeout
      setTimeout(() => {
        clearInterval(attackInterval);
        if (this.state.currentTask === `Attacking ${entity.name}`) {
          this.bot.pathfinder.setGoal(null);
          this.state.currentTask = null;
          logger.warn(`${this.bot.username} gave up attacking ${entity.name} after timeout`);
          
          // Continue patrolling if we were patrolling
          if (this.state.patrolPoints && this.state.patrolPoints.length > 0) {
            this.continuePatrol();
          }
        }
      }, 30000);
    } catch (err) {
      logger.error(`Error attacking entity:`, err);
      this.state.currentTask = null;
    }
  }
  
  /**
   * Retreat from combat
   */
  retreat() {
    try {
      logger.info(`${this.bot.username} retreating due to low health (${this.bot.health})`);
      
      this.state.currentTask = 'Retreating';
      
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
   * Guard a specific location
   * @param {Object} location - Location to guard
   */
  guardLocation(location) {
    try {
      logger.info(`${this.bot.username} guarding location ${location.x},${location.y},${location.z}`);
      
      this.state.guardTarget = {
        type: 'location',
        ...location,
      };
      
      this.state.currentTask = `Guarding location ${location.x},${location.y},${location.z}`;
      
      // Go to the location
      this.goToLocation(location)
        .then(() => {
          // Start patrol around the location when we reach it
          const radius = 5;
          this.startPatrol(
            [
              { x: location.x + radius, y: location.y, z: location.z },
              { x: location.x, y: location.y, z: location.z + radius },
              { x: location.x - radius, y: location.y, z: location.z },
              { x: location.x, y: location.y, z: location.z - radius },
            ]
          );
        })
        .catch(err => {
          logger.error(`Error going to guard location:`, err);
        });
    } catch (err) {
      logger.error(`Error guarding location:`, err);
    }
  }
  
  /**
   * Guard a specific player
   * @param {string} username - Username of player to guard
   */
  guardPlayer(username) {
    try {
      logger.info(`${this.bot.username} guarding player ${username}`);
      
      this.state.guardTarget = {
        type: 'player',
        username,
      };
      
      this.state.currentTask = `Guarding player ${username}`;
      
      // Find player
      const player = this.bot.players[username];
      
      if (!player || !player.entity) {
        logger.warn(`${this.bot.username} can't see player ${username}`);
        return;
      }
      
      // Follow the player
      this.bot.pathfinder.setMovements(this.movements);
      this.bot.pathfinder.setGoal(new goals.GoalFollow(player.entity, 3), true);
    } catch (err) {
      logger.error(`Error guarding player:`, err);
    }
  }
  
  /**
   * Start patrolling a set of points
   * @param {Array} points - Points to patrol
   */
  startPatrol(points) {
    try {
      if (!points || points.length === 0) {
        logger.warn(`${this.bot.username} can't patrol with no points`);
        return;
      }
      
      logger.info(`${this.bot.username} starting patrol with ${points.length} points`);
      
      this.state.patrolPoints = [...points];
      this.state.currentPatrolIndex = 0;
      
      // Go to first point
      this.continuePatrol();
    } catch (err) {
      logger.error(`Error starting patrol:`, err);
    }
  }
  
  /**
   * Continue patrolling to next point
   */
  continuePatrol() {
    try {
      // Skip if we're attacking or retreating
      if (this.state.currentTask && 
         (this.state.currentTask.includes('Attacking') || 
          this.state.currentTask === 'Retreating')) {
        return;
      }
      
      if (this.state.patrolPoints.length === 0) return;
      
      const nextPoint = this.state.patrolPoints[this.state.currentPatrolIndex];
      
      this.state.currentTask = `Patrolling (${this.state.currentPatrolIndex + 1}/${this.state.patrolPoints.length})`;
      
      // Go to next point
      this.goToLocation(nextPoint)
        .then(() => {
          // Scan for threats at patrol point
          this.scanForThreats();
          
          // Handle any threats before continuing patrol
          if (this.state.threatsDetected.length > 0) {
            this.handleThreats();
            return; // Patrol will continue after threat is handled
          }
        
          // Move to next point
          this.state.currentPatrolIndex = (this.state.currentPatrolIndex + 1) % this.state.patrolPoints.length;
          
          // Small delay before continuing
          setTimeout(() => {
            this.continuePatrol();
          }, 2000);
        })
        .catch(err => {
          logger.error(`Error during patrol:`, err);
          
          // Skip problematic point
          this.state.currentPatrolIndex = (this.state.currentPatrolIndex + 1) % this.state.patrolPoints.length;
          
          setTimeout(() => {
            this.continuePatrol();
          }, 2000);
        });
    } catch (err) {
      logger.error(`Error continuing patrol:`, err);
    }
  }
  
  /**
   * Stop guarding
   */
  stopGuarding() {
    this.state.guardTarget = null;
    this.state.patrolPoints = [];
    this.state.currentTask = null;
    this.bot.pathfinder.setGoal(null);
    logger.info(`${this.bot.username} stopped guarding`);
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
    const protectorCommands = ['guard', 'patrol'];
    
    // If not a protector command, don't respond
    if (!protectorCommands.includes(command)) {
      return null;
    }

    // Check for protector-specific commands
    switch (command) {
      case 'guard':
        if (args.length === 0) {
          return 'Invalid arguments. Usage: guard <x> <y> <z> OR guard <player>';
        }
        
        if (args.length === 1) {
          // Guard player
          const playerName = args[0];
          this.guardPlayer(playerName);
          return `Guarding player ${playerName}`;
        } else if (args.length === 3) {
          // Guard location
          const x = parseInt(args[0]);
          const y = parseInt(args[1]);
          const z = parseInt(args[2]);
          
          if (isNaN(x) || isNaN(y) || isNaN(z)) {
            return 'Invalid coordinates. Usage: guard <x> <y> <z>';
          }
          
          const location = { x, y, z };
          this.guardLocation(location);
          return `Guarding location ${x},${y},${z}`;
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
      
      default:
        return null;
    }
  }

  /**
   * Defend a specific target (player or bot)
   * @param {string} targetName - Name of the target to defend
   * @param {string} targetType - Type of target ('player' or 'bot')
   */
  async defendTarget(targetName, targetType) {
    try {
      logger.info(`${this.bot.username} defending ${targetType} ${targetName}`);
      
      this.state.guardTarget = {
        type: targetType,
        name: targetName,
      };
      
      this.state.currentTask = `Defending ${targetType} ${targetName}`;
      
      // Function to follow the target
      const followTarget = async () => {
        let targetEntity = null;
        
        if (targetType === 'player') {
          const player = this.bot.players[targetName];
          if (player && player.entity) {
            targetEntity = player.entity;
          }
        } else if (targetType === 'bot') {
          // Try to get bot information from data store
          const botInfo = this.dataStore.getBot(targetName);
          if (botInfo && botInfo.position) {
            // We don't have a direct entity, so navigate to position
            await this.goToLocation(botInfo.position, 5);
            return;
          }
        }
        
        if (targetEntity) {
          // Check if we're close enough already
          const distance = this.bot.entity.position.distanceTo(targetEntity.position);
          
          if (distance > 5) {
            // Follow the target
            await this.goToLocation({ 
              x: targetEntity.position.x, 
              y: targetEntity.position.y, 
              z: targetEntity.position.z 
            }, 5);
          }
          
          // Scan for threats around the target
          const threats = this.findThreatsAroundPosition(targetEntity.position, this.protectionRadius);
          
          // Handle any threats
          if (threats.length > 0) {
            logger.info(`${this.bot.username} detected ${threats.length} threats near ${targetName}`);
            
            // Attack the closest threat
            threats.sort((a, b) => {
              return a.position.distanceTo(targetEntity.position) - 
                    b.position.distanceTo(targetEntity.position);
            });
            
            await this.attackEntity(threats[0]);
          }
        }
      };
      
      // Start following loop
      const defendInterval = setInterval(async () => {
        // Check if we're still defending
        if (!this.state.guardTarget || this.state.guardTarget.name !== targetName) {
          clearInterval(defendInterval);
          return;
        }
        
        await followTarget().catch(err => {
          logger.warn(`Error following ${targetType} ${targetName}:`, err);
        });
      }, 2000);
      
      // Set a 5-minute timeout to avoid infinite defense
      setTimeout(() => {
        if (this.state.guardTarget && this.state.guardTarget.name === targetName) {
          logger.info(`${this.bot.username} stopping defense of ${targetName} after timeout`);
          clearInterval(defendInterval);
          this.state.guardTarget = null;
          this.state.currentTask = null;
        }
      }, 300000); // 5 minutes
    } catch (error) {
      logger.error(`Error defending ${targetName}:`, error);
      this.state.guardTarget = null;
      this.state.currentTask = null;
    }
  }

  /**
   * Find threats around a specific position
   * @param {Object} position - Position to scan around
   * @param {number} radius - Radius to scan
   * @returns {Array} - List of hostile entities
   */
  findThreatsAroundPosition(position, radius) {
    const entities = Object.values(this.bot.entities);
    
    // Filter for hostile mobs within range
    return entities.filter(entity => {
      if (!this.isHostileMob(entity)) return false;
      
      const distance = entity.position.distanceTo(position);
      return distance <= radius;
    });
  }

  /**
   * Retreat to a specific location
   * @param {Object} location - Location to retreat to
   * @returns {Promise<boolean>} - Whether the retreat was successful
   */
  async retreatTo(location) {
    try {
      this.state.currentTask = `Retreating to ${location.x},${location.y},${location.z}`;
      logger.info(`${this.bot.username} retreating to ${location.x},${location.y},${location.z}`);
      
      // Stop any current guard activities
      this.stopGuarding();
      
      // Make sure we have the best gear equipped
      this.checkAndEquipBestGear();
      
      // Go to the retreat location
      await this.goToLocation(location);
      
      logger.info(`${this.bot.username} reached retreat location`);
      this.state.currentTask = null;
      return true;
    } catch (error) {
      logger.error(`Error retreating to location:`, error);
      this.state.currentTask = null;
      return false;
    }
  }
}

module.exports = ProtectorBot; 