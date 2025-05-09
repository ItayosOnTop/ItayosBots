# ItayosBot

Advanced Minecraft bot system built on Mineflayer for automating various tasks through multiple cooperative bots with Discord integration.

## Features

- **Multiple Specialized Bots**: Different bot types with unique capabilities
  - **ProtectorBot**: Provides security and combat functionality
  - **MinerBot**: Specialized in mining and resource gathering
  - **BuilderBot**: Focuses on construction and building tasks
  - **FarmerBot**: Handles farming and animal husbandry

- **Command System**: Control bots through both Minecraft chat and Discord
  - Common command prefix for easy use
  - Permission-based access control
  - Extensive command library for each bot type

- **Shared Data System**: Bots share information and work cooperatively
  - Resource inventory tracking
  - World state information
  - Task management and coordination

- **Discord Integration**: Monitor and control through Discord
  - Status reporting and notifications
  - Remote command execution
  - Rich embed visualizations

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/ItayosBot.git
cd ItayosBot
```

2. Install dependencies:
```bash
npm install
```

3. Copy the example config and edit it with your settings:
```bash
cp example.config.js config.js
```

4. Set up your Discord bot if you plan to use Discord integration
   - Create a bot on the [Discord Developer Portal](https://discord.com/developers/applications)
   - Add the bot to your server
   - Copy the bot token to your config file

## Configuration

Edit `config.js` with your specific settings:

- Minecraft server details
- Discord bot token and channel ID
- Command prefix
- Owner information
- System-wide settings

## Usage

### Starting the System

```bash
node index.js
```

### Basic Commands

- `#help` - Display help information
- `#login <botName> <botType>` - Create and connect a new bot
- `#list` - List all active bots
- `#status [botName]` - Show bot status
- `#stop [botName]` - Stop bot(s)

### ProtectorBot Commands

- `#guard <botName> <playerName>` - Guard a player
- `#guard <botName> <x> <y> <z> [radius]` - Guard a position
- `#patrol <botName> <x1> <y1> <z1> <x2> <y2> <z2>` - Patrol an area
- `#follow <botName> <playerName>` - Follow a player
- `#whitelist <botName> add/remove <playerName>` - Manage whitelist
- `#aggression <botName> <level>` - Set aggression level
- `#stopProtection <botName>` - Stop protection tasks

## Bot Types

### ProtectorBot

Specialized in combat and protection tasks:
- Guarding players or positions
- Patrolling areas
- Combat with hostile mobs
- Player whitelisting for safety

### MinerBot (In Development)

Mining and resource gathering:
- Automated mining operations
- Ore detection and prioritization
- Resource collection and storage
- Tunnel and shaft creation

### BuilderBot (In Development)

Construction and building tasks:
- Blueprint-based construction
- Material gathering for builds
- Structure verification
- Terrain modification

### FarmerBot (In Development)

Farming and animal husbandry:
- Crop planting and harvesting
- Animal breeding and care
- Farm construction and expansion
- Food production

## Architecture

The system is built with a modular architecture:

- `src/bots/base`: Core bot functionality
- `src/bots/specialized`: Specialized bot implementations
- `src/commands`: Command system and handlers
- `src/shared`: Shared data system
- `src/discord`: Discord integration
- `docs`: Documentation and references

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [Mineflayer](https://github.com/PrismarineJS/mineflayer) for the excellent Minecraft bot API
- Discord.js for Discord integration
- All contributors to the project 