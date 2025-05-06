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
    const hostileTypes = [
      'zombie', 'skeleton', 'spider', 'creeper', 'enderman', 
      'witch', 'slime', 'cave_spider', 'silverfish', 'zombie_villager'
    ];
    
    // Check if entity type matches any hostile type
    return entity && entity.type === 'mob' && 
           hostileTypes.some(type => entity.name.toLowerCase().includes(type));
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
      
      // React to threats if we're guarding
      if (this.state.guardTarget && this.state.threatsDetected.length > 0) {
        this.handleThreats();
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
      logger.info(`${this.bot.username} attacking ${entity.name}`);
      
      // Update current task
      this.state.currentTask = `Attacking ${entity.name}`;
      
      // Try to equip a weapon
      const weapons = ['diamond_sword', 'iron_sword', 'stone_sword', 'wooden_sword', 'iron_axe'];
      let equipped = false;
      
      for (const weapon of weapons) {
        if (await this.equipItem(weapon, 'hand')) {
          equipped = true;
          break;
        }
      }
      
      if (!equipped) {
        logger.warn(`${this.bot.username} has no weapon, attacking with hand`);
      }
      
      // Go to the entity
      this.bot.pathfinder.setMovements(this.movements);
      this.bot.pathfinder.setGoal(new goals.GoalFollow(entity, 2));
      
      // Attack when in range
      const attackInterval = setInterval(() => {
        if (!entity.isValid) {
          clearInterval(attackInterval);
          this.bot.pathfinder.setGoal(null);
          this.state.currentTask = null;
          
          // Remove from threats
          this.state.threatsDetected = this.state.threatsDetected
            .filter(threat => threat.id !== entity.id);
          
          // Remove from shared threats
          if (entity.position) {
            this.dataStore.removeThreat(
              entity.name, 
              { x: entity.position.x, y: entity.position.y, z: entity.position.z }
            );
          }
          
          logger.info(`${this.bot.username} defeated ${entity.name}`);
          return;
        }
        
        const distance = this.bot.entity.position.distanceTo(entity.position);
        
        if (distance <= 3) {
          // Attack
          this.bot.attack(entity);
        }
        
        // Check health
        if (this.bot.health <= this.retreatHealthThreshold) {
          clearInterval(attackInterval);
          this.bot.pathfinder.setGoal(null);
          this.retreat();
        }
      }, 500);
      
      // Stop attack after timeout
      setTimeout(() => {
        clearInterval(attackInterval);
        if (this.state.currentTask === `Attacking ${entity.name}`) {
          this.bot.pathfinder.setGoal(null);
          this.state.currentTask = null;
          logger.warn(`${this.bot.username} gave up attacking ${entity.name} after timeout`);
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
      if (this.state.patrolPoints.length === 0) return;
      
      const nextPoint = this.state.patrolPoints[this.state.currentPatrolIndex];
      
      this.state.currentTask = `Patrolling (${this.state.currentPatrolIndex + 1}/${this.state.patrolPoints.length})`;
      
      // Go to next point
      this.goToLocation(nextPoint)
        .then(() => {
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
   * @returns {*} - Command response
   */
  handleCommand(command, args) {
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
      
      case 'attack':
        if (args.length === 1) {
          // Find entity by name or type
          const entityName = args[0].toLowerCase();
          const entities = Object.values(this.bot.entities).filter(entity => {
            return entity.name.toLowerCase().includes(entityName) || 
                  (entity.username && entity.username.toLowerCase().includes(entityName));
          });
          
          if (entities.length === 0) {
            return `No entity found matching ${entityName}`;
          }
          
          // Sort by distance
          entities.sort((a, b) => {
            return a.position.distanceTo(this.bot.entity.position) - 
                   b.position.distanceTo(this.bot.entity.position);
          });
          
          // Attack the closest
          this.attackEntity(entities[0]);
          return `Attacking ${entities[0].name || entities[0].username}`;
        } else {
          return 'Invalid arguments. Usage: attack <entity>';
        }
      
      case 'defend':
        if (args.length === 1) {
          const target = args[0];
          
          // Check if target is a player or bot
          const targetPlayer = this.bot.players[target];
          
          if (targetPlayer && targetPlayer.entity) {
            this.defendTarget(target, 'player');
            return `Defending player ${target}`;
          }
          
          // Check if it's another bot
          if (this.dataStore.getBot(target)) {
            this.defendTarget(target, 'bot');
            return `Defending bot ${target}`;
          }
          
          return `Cannot find target ${target} to defend`;
        } else {
          return 'Invalid arguments. Usage: defend <player/bot>';
        }
      
      case 'retreat':
        if (args.length === 3) {
          const x = parseInt(args[0]);
          const y = parseInt(args[1]);
          const z = parseInt(args[2]);
          
          if (isNaN(x) || isNaN(y) || isNaN(z)) {
            return 'Invalid coordinates. Usage: retreat <x> <y> <z>';
          }
          
          this.retreatTo({ x, y, z });
          return `Retreating to ${x},${y},${z}`;
        } else {
          // Retreat automatically
          this.retreat();
          return 'Retreating to nearest safe zone';
        }
      
      case 'equip':
        if (args.length >= 1) {
          const itemName = args[0];
          const slot = args.length >= 2 ? args[1] : 'hand';
          
          this.equipItem(itemName, slot)
            .then(success => {
              if (success) {
                this.bot.chat(`Equipped ${itemName} in ${slot}`);
              } else {
                this.bot.chat(`Could not equip ${itemName} in ${slot}`);
              }
            })
            .catch(err => {
              this.bot.chat(`Error equipping ${itemName}: ${err.message}`);
            });
          
          return `Attempting to equip ${itemName} in ${slot}`;
        } else {
          return 'Invalid arguments. Usage: equip <item> [slot]';
        }
      
      case 'stop':
        this.stopGuarding();
        return 'Stopped guarding';
      
      default:
        // If not a protector command, try base commands
        return super.handleCommand(command, args);
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
      
      // Equip shield if available
      await this.equipBestShield();
      
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

  /**
   * Equip the best shield available
   * @returns {Promise<boolean>} - Whether a shield was equipped
   */
  async equipBestShield() {
    try {
      // Find shields in inventory
      const shields = this.bot.inventory.items().filter(item => 
        item.name.includes('shield')
      );
      
      if (shields.length === 0) {
        logger.debug(`${this.bot.username} has no shields in inventory`);
        return false;
      }
      
      // Equip the shield in offhand
      await this.bot.equip(shields[0], 'off-hand');
      logger.info(`${this.bot.username} equipped ${shields[0].name} in off-hand`);
      return true;
    } catch (error) {
      logger.warn(`Error equipping shield:`, error);
      return false;
    }
  }

  /**
   * Equip a specific item
   * @param {string} itemName - Name of the item to equip
   * @param {string} slot - Slot to equip the item in ('hand', 'off-hand', 'head', 'torso', 'legs', 'feet')
   * @returns {Promise<boolean>} - Whether the item was equipped
   */
  async equipItem(itemName, slot = 'hand') {
    try {
      // Handle armor slots
      const armorSlots = {
        'head': 'helmet',
        'torso': 'chestplate',
        'legs': 'leggings',
        'feet': 'boots'
      };
      
      // Find items matching the name
      const items = this.bot.inventory.items().filter(item => 
        item.name.toLowerCase().includes(itemName.toLowerCase())
      );
      
      if (items.length === 0) {
        logger.warn(`${this.bot.username} has no ${itemName} in inventory`);
        return false;
      }
      
      // If it's armor, we need to be more specific
      if (armorSlots[slot]) {
        // For armor, prefer items that contain both the itemName and the slot type
        const armorItems = items.filter(item => 
          item.name.toLowerCase().includes(armorSlots[slot])
        );
        
        if (armorItems.length > 0) {
          await this.bot.equip(armorItems[0], slot);
          logger.info(`${this.bot.username} equipped ${armorItems[0].name} in ${slot}`);
          return true;
        }
      }
      
      // Otherwise just equip the first matching item
      await this.bot.equip(items[0], slot);
      logger.info(`${this.bot.username} equipped ${items[0].name} in ${slot}`);
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
}

module.exports = ProtectorBot; 