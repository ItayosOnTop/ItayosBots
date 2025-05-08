const { Vec3 } = require('vec3');
const { goals, Movements } = require('mineflayer-pathfinder');
const { logger } = require('../utils/logger');

class MovementSystem {
    constructor(bot) {
        this.bot = bot;
        this.isMoving = false;
        this.currentGoal = null;
        this.movementState = 'idle'; // idle, walking, running, jumping, swimming
        this.movementSpeed = 1.0;
        this.pathfindingTimeout = 30000; // 30 seconds timeout for pathfinding
        this.maxPathRetries = 3;
        this.currentRetries = 0;
        
        // Initialize pathfinder
        if (!this.bot.pathfinder) {
            this.bot.loadPlugin(require('mineflayer-pathfinder').pathfinder);
        }
        
        // Configure movements with better parameters
        this.configureMovements();
        
        // Movement event handlers
        this.setupEventHandlers();
    }

    configureMovements() {
        try {
            const mcData = require('minecraft-data')(this.bot.version);
            const movements = new Movements(this.bot, mcData);
            
            // Improve movement capabilities
            movements.canDig = true;
            movements.allowSprinting = true;
            movements.allowParkour = true;
            movements.canOpenDoors = true;
            
            // Set appropriate block costs
            movements.scafoldingBlocks = ['dirt', 'cobblestone', 'stone'];
            
            // Increase max drop to handle more terrain variations
            movements.maxDropDown = 4;
            
            // Avoid blocks that can harm the bot
            movements.blocksCosts = {
                ...movements.blocksCosts,
                'lava': 1000,
                'fire': 1000,
                'cactus': 1000,
                'magma_block': 1000,
                'sweet_berry_bush': 1000
            };
            
            // Apply the updated movements to the pathfinder
            this.bot.pathfinder.setMovements(movements);
            
            // Default path options
            this.bot.pathfinder.setOptions({
                timeout: this.pathfindingTimeout,
                lookAhead: 5
            });
        } catch (err) {
            logger.error('Error configuring movements:', err);
        }
    }

    setupEventHandlers() {
        // Handle movement completion
        this.bot.on('goal_reached', () => {
            this.isMoving = false;
            this.currentGoal = null;
            this.movementState = 'idle';
            this.currentRetries = 0;
            logger.info(`${this.bot.username} reached movement goal`);
        });

        // Handle movement errors
        this.bot.on('path_update', (results) => {
            if (results.status === 'noPath') {
                logger.warn(`${this.bot.username}: No path found to target`);
                
                // Try to recover with retries
                if (this.currentGoal && this.currentRetries < this.maxPathRetries) {
                    this.currentRetries++;
                    logger.info(`${this.bot.username}: Retrying pathfinding (attempt ${this.currentRetries}/${this.maxPathRetries})`);
                    
                    // Wait a moment and retry with different parameters
                    setTimeout(() => {
                        if (this.isMoving && this.currentGoal) {
                            this.tryAlternativePathfinding();
                        }
                    }, 1000);
                } else {
                    // Give up after max retries
                    this.isMoving = false;
                    this.currentGoal = null;
                    this.movementState = 'idle';
                    this.currentRetries = 0;
                    logger.warn(`${this.bot.username}: Giving up on pathfinding after ${this.maxPathRetries} attempts`);
                }
            }
        });
        
        // Handle disconnect/reconnect
        this.bot.on('end', () => {
            this.reset();
        });
        
        this.bot.on('spawn', () => {
            this.reset();
            this.configureMovements();
        });
        
        // Handle being stuck
        let lastPos = null;
        let stuckCounter = 0;
        
        // Check periodically if the bot is stuck
        setInterval(() => {
            if (this.isMoving && this.bot.entity) {
                const currentPos = this.bot.entity.position;
                
                if (lastPos) {
                    // Calculate distance moved
                    const distMoved = currentPos.distanceTo(lastPos);
                    
                    // If barely moved while trying to move
                    if (distMoved < 0.1) {
                        stuckCounter++;
                        
                        // If stuck for several checks
                        if (stuckCounter > 5) {
                            logger.warn(`${this.bot.username} appears to be stuck, trying to recover`);
                            this.recoverFromStuck();
                            stuckCounter = 0;
                        }
                    } else {
                        stuckCounter = 0;
                    }
                }
                
                lastPos = currentPos.clone();
            } else {
                // Reset if not moving
                stuckCounter = 0;
                lastPos = null;
            }
        }, 1000);
    }

    // Try alternative pathfinding approaches when the primary one fails
    tryAlternativePathfinding() {
        try {
            if (!this.currentGoal) return;
            
            const mcData = require('minecraft-data')(this.bot.version);
            const movements = new Movements(this.bot, mcData);
            
            // For retry attempts, adjust parameters to be more lenient
            switch (this.currentRetries) {
                case 1:
                    // First retry: try simpler but more permissive pathing
                    movements.allowParkour = true;
                    movements.canDig = true;
                    movements.maxDropDown = 5;
                    movements.dontCreateFlow = true;
                    break;
                case 2:
                    // Second retry: try approaching from a different angle
                    movements.allowParkour = true;
                    movements.canDig = true;
                    movements.maxDropDown = 6;
                    movements.dontCreateFlow = true;
                    
                    // Modify goal to be less strict
                    if (this.currentGoal instanceof goals.GoalBlock) {
                        // Switch to a nearby goal instead of an exact block
                        const oldGoal = this.currentGoal;
                        this.currentGoal = new goals.GoalNear(oldGoal.x, oldGoal.y, oldGoal.z, 2);
                    }
                    break;
                case 3:
                    // Third retry: try the most permissive settings
                    movements.allowParkour = true;
                    movements.canDig = true;
                    movements.canOpenDoors = true;
                    movements.maxDropDown = 8;
                    movements.dontCreateFlow = true;
                    
                    // Use a very lenient goal
                    if (this.currentGoal instanceof goals.GoalBlock || this.currentGoal instanceof goals.GoalNear) {
                        const oldGoal = this.currentGoal;
                        this.currentGoal = new goals.GoalNear(oldGoal.x, oldGoal.y, oldGoal.z, 4);
                    }
                    break;
            }
            
            // Apply the updated movements
            this.bot.pathfinder.setMovements(movements);
            
            // Retry with the new settings
            this.bot.pathfinder.setGoal(this.currentGoal);
        } catch (err) {
            logger.error(`Error in alternative pathfinding for ${this.bot.username}:`, err);
        }
    }

    // Try to recover when bot is stuck
    recoverFromStuck() {
        try {
            // First, stop current pathfinding
            this.bot.pathfinder.stop();
            
            // Try some movements to get unstuck
            this.bot.setControlState('jump', true);
            setTimeout(() => this.bot.setControlState('jump', false), 500);
            
            // Try moving in random directions
            const directions = ['forward', 'back', 'left', 'right'];
            const randomDir = directions[Math.floor(Math.random() * directions.length)];
            
            this.bot.setControlState(randomDir, true);
            setTimeout(() => {
                this.bot.setControlState(randomDir, false);
                
                // Retry original goal if it exists
                if (this.currentGoal) {
                    setTimeout(() => {
                        this.bot.pathfinder.setGoal(this.currentGoal);
                    }, 500);
                }
            }, 1000);
        } catch (err) {
            logger.error(`Error in stuck recovery for ${this.bot.username}:`, err);
        }
    }

    // Reset movement system state
    reset() {
        this.isMoving = false;
        this.currentGoal = null;
        this.movementState = 'idle';
        this.currentRetries = 0;
        
        try {
            // Clear any control states
            if (this.bot.clearControlStates) {
                this.bot.clearControlStates();
            }
        } catch (err) {
            // Ignore errors during reset
        }
    }

    // Basic movement methods
    async walkTo(x, y, z) {
        if (this.isMoving) {
            await this.stop();
        }

        try {
            this.isMoving = true;
            this.movementState = 'walking';
            this.currentRetries = 0;
            
            // Validate coordinates
            if (isNaN(x) || isNaN(y) || isNaN(z)) {
                throw new Error(`Invalid coordinates: ${x}, ${y}, ${z}`);
            }
            
            // Create a position vector
            let target;
            if (typeof x === 'object') {
                // If x is a Vec3 or similar object
                target = x;
            } else {
                target = new Vec3(x, y, z);
            }
            
            // Check if position is too far (prevents pathfinding to extreme distances)
            const currentPos = this.bot.entity.position;
            const distance = currentPos.distanceTo(target);
            
            if (distance > 200) {
                throw new Error(`Target position too far: ${distance} blocks away`);
            }
            
            // Set the movement goal
            this.currentGoal = new goals.GoalBlock(target.x, target.y, target.z);
            
            logger.info(`${this.bot.username} pathfinding to ${target.x}, ${target.y}, ${target.z}`);
            
            // Use a promise with timeout to handle pathfinding
            await new Promise((resolve, reject) => {
                const goalReachedHandler = () => {
                    clearTimeout(timeoutId);
                    this.bot.removeListener('goal_reached', goalReachedHandler);
                    resolve();
                };
                
                // Set a timeout
                const timeoutId = setTimeout(() => {
                    this.bot.removeListener('goal_reached', goalReachedHandler);
                    this.stop();
                    reject(new Error('Movement timed out'));
                }, this.pathfindingTimeout + 5000); // Add 5 seconds to the pathfinder timeout
                
                this.bot.once('goal_reached', goalReachedHandler);
                
                // Start pathfinding
                this.bot.pathfinder.goto(this.currentGoal)
                    .catch(err => {
                        clearTimeout(timeoutId);
                        this.bot.removeListener('goal_reached', goalReachedHandler);
                        reject(err);
                    });
            });
            
            return true;
        } catch (err) {
            logger.error(`Movement error for ${this.bot.username}:`, err);
            this.isMoving = false;
            this.currentGoal = null;
            this.movementState = 'idle';
            throw err;
        }
    }

    async stop() {
        if (this.isMoving) {
            this.bot.pathfinder.stop();
            this.isMoving = false;
            this.currentGoal = null;
            this.movementState = 'idle';
            this.currentRetries = 0;
            
            // Clear any control states
            this.bot.clearControlStates();
            
            return true;
        }
        return false;
    }

    // Movement state management
    setMovementSpeed(speed) {
        this.movementSpeed = Math.max(0.1, Math.min(2.0, speed));
        
        try {
            // Adjust movement speed in the pathfinder if possible
            const mcData = require('minecraft-data')(this.bot.version);
            const movements = new Movements(this.bot, mcData);
            
            // Adjust movement parameters based on speed
            movements.allowSprinting = this.movementSpeed > 1.0;
            
            // Apply the updated movements
            this.bot.pathfinder.setMovements(movements);
        } catch (err) {
            logger.error(`Error setting movement speed for ${this.bot.username}:`, err);
        }
    }

    // Basic movement commands
    async jump() {
        if (!this.isMoving) {
            this.movementState = 'jumping';
            await this.bot.setControlState('jump', true);
            setTimeout(() => {
                this.bot.setControlState('jump', false);
                this.movementState = 'idle';
            }, 250);
            return true;
        }
        return false;
    }

    async swim(direction) {
        if (!this.isMoving) {
            this.movementState = 'swimming';
            const directions = {
                'forward': [1, 0, 0],
                'backward': [-1, 0, 0],
                'left': [0, 0, 1],
                'right': [0, 0, -1]
            };

            if (directions[direction]) {
                const [x, y, z] = directions[direction];
                await this.bot.setControlState('forward', x > 0);
                await this.bot.setControlState('back', x < 0);
                await this.bot.setControlState('left', z > 0);
                await this.bot.setControlState('right', z < 0);
                
                setTimeout(() => {
                    this.bot.clearControlStates();
                    this.movementState = 'idle';
                }, 1000);
                return true;
            }
        }
        return false;
    }

    // Status methods
    getMovementStatus() {
        const status = {
            isMoving: this.isMoving,
            state: this.movementState,
            speed: this.movementSpeed,
            retries: this.currentRetries,
        };
        
        if (this.isMoving && this.currentGoal) {
            status.currentGoal = {
                x: Math.floor(this.currentGoal.x),
                y: Math.floor(this.currentGoal.y),
                z: Math.floor(this.currentGoal.z)
            };
            
            if (this.bot.entity) {
                const currentPos = this.bot.entity.position;
                status.distanceToGoal = Math.floor(
                    Math.sqrt(
                        Math.pow(currentPos.x - this.currentGoal.x, 2) +
                        Math.pow(currentPos.y - this.currentGoal.y, 2) +
                        Math.pow(currentPos.z - this.currentGoal.z, 2)
                    )
                );
            }
        }
        
        return status;
    }
}

module.exports = MovementSystem; 