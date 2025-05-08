const BaseBot = require('./BaseBot');

class ProtectorBot extends BaseBot {
    constructor(bot, config) {
        super(bot, config);
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
            console.error('Error in combat:', err);
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
                return current.attackDamage > best.attackDamage ? current : best;
            });
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
            console.error('Error following player:', err);
        }
    }

    // Protector-specific commands
    async guard(target) {
        if (!this.isActive) return false;
        
        if (typeof target === 'string') {
            // Guard a player
            const player = this.bot.players[target];
            if (player) {
                this.guardTarget = target;
                this.currentTask = `Guarding ${target}`;
                await this.followPlayer(player);
                return true;
            }
        } else if (target instanceof Vec3) {
            // Guard a location
            this.guardTarget = null;
            this.currentTask = `Guarding location ${target.toString()}`;
            await this.movement.walkTo(target.x, target.y, target.z);
            return true;
        }
        
        return false;
    }

    async patrol(x1, z1, x2, z2) {
        if (!this.isActive) return false;
        
        this.patrolArea = { x1, z1, x2, z2 };
        this.currentTask = `Patrolling area (${x1},${z1}) to (${x2},${z2})`;
        
        try {
            // Simple patrol pattern: move to each corner in sequence
            const corners = [
                [x1, z1],
                [x2, z1],
                [x2, z2],
                [x1, z2]
            ];
            
            for (const [x, z] of corners) {
                if (!this.isActive) break;
                await this.movement.walkTo(x, this.bot.entity.position.y, z);
                await new Promise(resolve => setTimeout(resolve, 2000)); // Pause at corners
            }
            
            return true;
        } catch (err) {
            console.error('Error in patrol:', err);
            return false;
        }
    }

    whitelistPlayer(playerName) {
        this.whitelist.add(playerName);
        return true;
    }

    // Override base methods
    async start() {
        this.isActive = true;
        this.currentTask = 'Protector bot activated';
        return true;
    }

    async handleCommand(command, args) {
        switch (command) {
            case 'guard':
                if (args.length === 1) {
                    return await this.guard(args[0]);
                } else if (args.length === 3) {
                    return await this.guard(new Vec3(
                        parseInt(args[0]),
                        parseInt(args[1]),
                        parseInt(args[2])
                    ));
                }
                return false;
                
            case 'patrol':
                if (args.length === 4) {
                    return await this.patrol(
                        parseInt(args[0]),
                        parseInt(args[1]),
                        parseInt(args[2]),
                        parseInt(args[3])
                    );
                }
                return false;
                
            case 'whitelist':
                if (args.length === 1) {
                    return this.whitelistPlayer(args[0]);
                }
                return false;
                
            default:
                return await super.handleCommand(command, args);
        }
    }
}

module.exports = ProtectorBot; 