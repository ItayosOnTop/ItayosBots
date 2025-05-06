# ItayosBot - Advanced Minecraft Bot System

ItayosBot is a sophisticated Minecraft bot system built using Mineflayer. It enables automation of various Minecraft tasks through multiple cooperative bots that can be controlled via Discord and in-game chat commands.

## Features

- **Multi-bot coordination**: Deploy an "army" of specialized bots that share data and work together
- **Task specialization**: Dedicated miner, builder, and protector bot types
- **Dual command interface**: Control through both Discord and Minecraft chat
- **Resource gathering**: Automated mining of specific blocks and items
- **Construction**: Building structures from schematic files
- **Combat & Protection**: Defending players and other bots from threats
- **Crafting & Inventory Management**: Automated crafting and item storage

## Bot Types

### Miner Bot
Resource gathering and processing, including mining ores, collecting items, and crafting tools.

### Builder Bot
Construction and terraforming, building structures from schematic files, placing blocks, and repairing structures.

### Protector Bot
Security and combat, guarding locations or players, patrolling areas, and eliminating threats.

## Installation

1. Make sure you have [Node.js](https://nodejs.org/) installed (version 14 or higher recommended)
2. Clone this repository
3. Install dependencies:
   ```
   npm install
   ```
4. Configure your bots by editing `config/config.js`
5. Start the bot system:
   ```
   npm start
   ```

## Configuration

Edit the `config/config.js` file to configure your bot system. Key settings include:

- Minecraft server connection details
- Discord bot token and channel ID
- Bot owner information (Minecraft username and Discord ID)
- Bot instances to create on startup
- Bot type-specific settings
- Safe zones and storage locations

## Discord Setup

1. Create a Discord bot at the [Discord Developer Portal](https://discord.com/developers/applications)
2. Enable the Message Content Intent in the Bot settings
3. Add the bot to your server
4. Copy the bot token and channel ID to your `config.js` file

## Commands

### Global Commands
- `#help [command]` - Display help information
- `#list` - List all active bots and their status
- `#start [bot_type/name]` - Initialize bots with basic resource gathering
- `#stop [bot_type/name]` - Stop all bot activities
- `#goto [bot_name] <x> <y> <z>` - Command specific bot or all bots to move to coordinates
- `#come [bot_name]` - Command bot to come to owner's location
- `#status [bot_name]` - Get detailed status of bot(s)
- `#drop <item> [count] [bot_name]` - Make bot drop specified items

### Type-Specific Commands
Each bot type has specialized commands for their specific functions. See the specification document for details.

## Development

This project is structured as follows:

- `src/core/` - Core system functionality
- `src/bot-types/` - Specialized bot implementations
- `src/commands/` - Command handlers
- `src/utils/` - Utility functions
- `config/` - Configuration files
- `src/data/` - Data storage

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- [Mineflayer](https://github.com/PrismarineJS/mineflayer) - The JavaScript Minecraft bot library
- [Discord.js](https://discord.js.org/) - Discord API library 