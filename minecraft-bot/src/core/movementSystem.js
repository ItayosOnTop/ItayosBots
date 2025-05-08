const { Vec3 } = require('vec3');
const { goals } = require('mineflayer-pathfinder').goals;

class MovementSystem {
    constructor(bot) {
        this.bot = bot;
        this.isMoving = false;
        this.currentGoal = null;
        this.movementState = 'idle'; // idle, walking, running, jumping, swimming
        this.movementSpeed = 1.0;
        
        // Initialize pathfinder
        this.bot.loadPlugin(require('mineflayer-pathfinder').pathfinder);
        
        // Movement event handlers
        this.setupEventHandlers();
    }

    setupEventHandlers() {
        // Handle movement completion
        this.bot.on('goal_reached', () => {
            this.isMoving = false;
            this.currentGoal = null;
            this.movementState = 'idle';
        });

        // Handle movement errors
        this.bot.on('path_update', (results) => {
            if (results.status === 'noPath') {
                console.log('No path found to target');
                this.isMoving = false;
                this.currentGoal = null;
                this.movementState = 'idle';
            }
        });
    }

    // Basic movement methods
    async walkTo(x, y, z) {
        if (this.isMoving) {
            await this.stop();
        }

        this.isMoving = true;
        this.movementState = 'walking';
        this.currentGoal = new goals.GoalBlock(x, y, z);
        
        try {
            await this.bot.pathfinder.goto(this.currentGoal);
        } catch (err) {
            console.error('Error during movement:', err);
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
        }
    }

    // Movement state management
    setMovementSpeed(speed) {
        this.movementSpeed = Math.max(0.1, Math.min(2.0, speed));
        // TODO: Implement actual speed modification
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
        }
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
            }
        }
    }

    // Status methods
    getMovementStatus() {
        return {
            isMoving: this.isMoving,
            state: this.movementState,
            speed: this.movementSpeed,
            currentGoal: this.currentGoal ? {
                x: this.currentGoal.x,
                y: this.currentGoal.y,
                z: this.currentGoal.z
            } : null
        };
    }
}

module.exports = MovementSystem; 