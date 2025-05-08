implement every bot, one by one
start with protector, then miner, then builder

this commands HAS to work on every bot:

    Global Commands:
    #help [command] - Show this help message
    #list - List all active bots and their status
    #stop [bot_name] - Stop all bots or a specific bot
    #goto [bot_name] [x] [y] [z] - Command bot(s) to move to coordinates
    #come [bot_name] - Command bot(s) to come to your location
    #status [bot_name] - Get detailed status of bot(s)

and this for each bot:

    For Miner bot: mine, store, minearea

    For Builder bot: build, buildwall, blueprint

    For Protector bot: guard, patrol, follow, whitelist <playerName>

# Bot Movement System Specifications

## Core Movement Features

### Basic Movement
- Implement smooth walking and running
- Add jumping mechanics for obstacle navigation
- Implement swimming in water
- Add climbing mechanics for vertical movement
- Implement crouching for precise positioning

### Advanced Navigation
- Pathfinding using A* algorithm
- Dynamic obstacle avoidance
- Height-based movement adjustments
- Water and lava navigation
- Ladder and vine climbing
- Boat and minecart usage

### Movement States
- Idle state with random look-around
- Following state for player/bot following
- Patrolling state for area coverage
- Combat movement for fighting
- Mining movement patterns
- Building movement patterns

### Movement Optimization
- Path caching for frequent routes
- Movement prediction for smoother following
- Collision detection and response
- Movement speed adjustments based on terrain
- Energy management for sustained movement

### Special Movement Features
- Flying mechanics for creative mode
- Teleportation for emergency situations
- Portal navigation
- Elytra flight mechanics
- Horse riding capabilities

## Movement Commands

### Basic Movement Commands
| Command | Parameters | Description | Example |
|---------|------------|-------------|---------|
| `#walk` | [speed] | Set walking speed | `#walk 1.0` |
| `#jump` | - | Perform jump | `#jump` |
| `#swim` | [direction] | Swim in direction | `#swim forward` |
| `#climb` | [direction] | Climb in direction | `#climb up` |

### Advanced Movement Commands
| Command | Parameters | Description | Example |
|---------|------------|-------------|---------|
| `#path` | [x] [y] [z] | Find path to coordinates | `#path 100 64 200` |
| `#follow` | [entity] [distance] | Follow entity at distance | `#follow player1 3` |
| `#patrol` | [x1] [z1] [x2] [z2] | Patrol area | `#patrol 100 100 200 200` |
| `#avoid` | [obstacle_type] | Avoid specific obstacles | `#avoid lava` |

## Movement Implementation Priorities

1. Basic Movement System
   - Walking and running
   - Basic collision detection
   - Simple pathfinding

2. Advanced Navigation
   - Complex pathfinding
   - Obstacle avoidance
   - Water/lava handling

3. Special Movement Features
   - Flying mechanics
   - Vehicle usage
   - Portal navigation

4. Movement Optimization
   - Path caching
   - Movement prediction
   - Energy management

## Technical Requirements

### Performance Considerations
- Movement calculations per tick
- Pathfinding complexity limits
- Memory usage for path caching
- CPU usage for collision detection

### Safety Features
- Fall damage prevention
- Lava/water safety checks
- Entity collision avoidance
- Movement timeout handling

### Integration Points
- Mineflayer movement API
- Pathfinding library integration
- Physics engine integration
- World state synchronization