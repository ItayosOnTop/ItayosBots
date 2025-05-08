/**
 * ProtectorBot - Specialized bot for security and combat tasks
 */

const BaseBot = require('./BaseBot');
const Vec3 = require('vec3');
const { logger } = require('../utils/logger');

class ProtectorBot extends BaseBot {
    /**
     * Create a new ProtectorBot instance
     * @param {Object} bot - Mineflayer bot instance
     * @param {Object} config - Global configuration
     * @param {Object} dataStore - Shared data store
     */
    constructor(bot, config, dataStore) {
        super(bot, config, dataStore);
        this.type = 'protector';
        this.whitelist = new Set();
        this.guardTarget = null;
        this.patrolArea = null;
        this.combatMode = false;
        
        // Initialize protector-specific event handlers
        this.setupProtectorEvents();
    }

    setupProtectorEvents() {
        // Handle entity spawn for threat detection
        this.bot.on('entitySpawn', (entity) => {
            if (this.isHostile(entity) && this.isActive) {
                this.handleThreat(entity);
            }
        });

        // Handle player movement for following
        this.bot.on('playerMove', (player) => {
            if (this.guardTarget === player.username && this.isActive) {
                this.followPlayer(player);
            }
        });
    }

    isHostile(entity) {
        const hostileTypes = [
            'zombie', 'skeleton', 'spider', 'creeper', 'enderman',
            'witch', 'slime', 'silverfish', 'cave_spider', 'zombie_villager'
        ];
        return entity.type === 'mob' && hostileTypes.includes(entity.name);
    }

    async handleThreat(entity) {
        if (!this.isActive || this.combatMode) return;

        this.combatMode = true;
        this.currentTask = `Combat with ${entity.name}`;

        try {
            // Equip best weapon
            await this.equipBestWeapon();
            
            // Attack the entity
            await this.bot.attack(entity);
            
            // Wait for entity to be defeated
            await new Promise((resolve) => {
                const checkEntity = () => {
                    if (!entity.isValid) {
                        this.combatMode = false;
                        this.currentTask = null;
                        resolve();
                    } else {
                        setTimeout(checkEntity, 1000);
                    }
                };
                checkEntity();
            });
        } catch (err) {
            logger.error('Error in combat:', err);
            this.combatMode = false;
            this.currentTask = null;
        }
    }

    async equipBestWeapon() {
        const weapons = this.bot.inventory.items().filter(item => 
            item.name.endsWith('_sword') || item.name.endsWith('_axe')
        );
        
        if (weapons.length > 0) {
            const bestWeapon = weapons.reduce((best, current) => {
                // Simple comparison assuming higher attack damage is better
                const currentDamage = current.attackDamage || 0;
                const bestDamage = best.attackDamage || 0;
                return currentDamage > bestDamage ? current : best;
            }, weapons[0]);
            
            await this.bot.equip(bestWeapon, 'hand');
        }
    }

    async followPlayer(player) {
        if (!this.isActive || this.combatMode) return;
        
        try {
            const playerPos = player.position;
            await this.movement.walkTo(
                Math.floor(playerPos.x),
                Math.floor(playerPos.y),
                Math.floor(playerPos.z)
            );
        } catch (err) {
            logger.error('Error following player:', err);
        }
    }

    // Handle protector-specific commands
    handleCommand(command, args) {
        switch (command) {
            case 'guard':
                return this.handleGuardCommand(args);
            case 'patrol':
                return this.handlePatrolCommand(args);
            case 'attack':
                return this.handleAttackCommand(args);
            case 'defend':
                return this.handleDefendCommand(args);
            case 'equip':
                return this.handleEquipCommand(args);
            case 'heal':
                return this.handleHealCommand(args);
            default:
                return super.handleCommand(command, args);
        }
    }
    
    // Command handlers
    handleGuardCommand(args) {
        if (args.length < 1) {
            return 'Usage: #guard [player]';
        }
        
        const target = args[0];
        if (this.bot.players[target]) {
            this.guardTarget = target;
            this.currentTask = `Guarding ${target}`;
            return `Now guarding ${target}`;
        } else {
            return `Player ${target} not found`;
        }
    }
    
    handlePatrolCommand(args) {
        if (args.length < 4) {
            return 'Usage: #patrol [x1] [z1] [x2] [z2]';
        }
        
        try {
            const x1 = parseInt(args[0], 10);
            const z1 = parseInt(args[1], 10);
            const x2 = parseInt(args[2], 10);
            const z2 = parseInt(args[3], 10);
            
            if (isNaN(x1) || isNaN(z1) || isNaN(x2) || isNaN(z2)) {
                return 'Invalid coordinates. Usage: #patrol [x1] [z1] [x2] [z2]';
            }
            
            this.patrolArea = { x1, z1, x2, z2 };
            this.currentTask = `Patrolling area (${x1},${z1}) to (${x2},${z2})`;
            return `Starting patrol of area (${x1},${z1}) to (${x2},${z2})`;
        } catch (err) {
            logger.error('Error in patrol command:', err);
            return `Error: ${err.message}`;
        }
    }
    
    handleAttackCommand(args) {
        if (args.length < 1) {
            return 'Usage: #attack [target]';
        }
        
        const target = args[0];
        this.currentTask = `Attacking ${target}`;
        return `Attacking ${target}`;
    }
    
    handleDefendCommand(args) {
        if (args.length < 1) {
            return 'Usage: #defend [radius]';
        }
        
        const radius = parseInt(args[0], 10);
        if (isNaN(radius) || radius <= 0) {
            return 'Invalid radius. Usage: #defend [radius]';
        }
        
        this.currentTask = `Defending area with radius ${radius}`;
        return `Defending area with radius ${radius} blocks`;
    }
    
    handleEquipCommand(args) {
        if (args.length < 1) {
            return 'Usage: #equip [item]';
        }
        
        const item = args[0];
        this.currentTask = `Equipping ${item}`;
        return `Equipping ${item}`;
    }
    
    handleHealCommand(args) {
        if (args.length < 1) {
            return 'Usage: #heal [target]';
        }
        
        const target = args[0];
        this.currentTask = `Healing ${target}`;
        return `Healing ${target}`;
    }

    // Start the protector bot
    async start() {
        this.isActive = true;
        this.currentTask = 'Protector bot activated';
        return true;
    }

    getTypeSpecificHelp() {
        return [
            `${this.config.system.commandPrefix}guard [player] - Guard a specific player`,
            `${this.config.system.commandPrefix}patrol [radius] - Patrol area around bot`,
            `${this.config.system.commandPrefix}attack [target] - Attack specified target`,
            `${this.config.system.commandPrefix}defend [radius] - Defend area around bot`,
            `${this.config.system.commandPrefix}equip [item] - Equip specified item`,
            `${this.config.system.commandPrefix}heal [target] - Heal specified target`
        ];
    }
    
    getTypeSpecificCommandHelp() {
        return {
            'guard': `Usage: ${this.config.system.commandPrefix}guard [player]\nGuard a specific player`,
            'patrol': `Usage: ${this.config.system.commandPrefix}patrol [radius]\nPatrol area around bot`,
            'attack': `Usage: ${this.config.system.commandPrefix}attack [target]\nAttack specified target`,
            'defend': `Usage: ${this.config.system.commandPrefix}defend [radius]\nDefend area around bot`,
            'equip': `Usage: ${this.config.system.commandPrefix}equip [item]\nEquip specified item`,
            'heal': `Usage: ${this.config.system.commandPrefix}heal [target]\nHeal specified target`
        };
    }
}

module.exports = ProtectorBot; 