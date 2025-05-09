# ItayosBot - Advanced Minecraft Bot System Specification

## Table of Contents
- [Overview](#overview)
- [System Architecture](#system-architecture)
- [BaseBot Capabilities](#basebot-capabilities)
- [Command System](#command-system)
  - [Global Commands](#global-commands)
  - [Specialized Bot Commands](#specialized-bot-commands)
- [Bot Types](#bot-types)
  - [Miner Bot](#miner-bot)
  - [Builder Bot](#builder-bot)
  - [Protector Bot](#protector-bot)
- [Shared Data System](#shared-data-system)
- [Discord Integration](#discord-integration)
- [Bot Management](#bot-management)
- [Security](#security)
- [Technical Requirements](#technical-requirements)
- [Dependencies](#dependencies)
- [API References](#api-references)

## Overview
ItayosBot is a sophisticated Minecraft bot system built on the Mineflayer framework. It enables automation of various Minecraft tasks through multiple cooperative bots that can be controlled via Discord and in-game chat commands. The system is designed for seamless integration, efficient task execution, and reliable performance.

**Target Environment:**
- Minecraft Version: 1.21
- Mineflayer Version: 4.27.0

## System Architecture
The system follows a modular architecture with a base class (`BaseBot`) that provides core functionality, extended by specialized bot types for specific tasks. This design allows for code reuse, consistent behavior, and easier maintenance.

```
BaseBot (Core)
  ├── MinerBot
  ├── BuilderBot
  └── ProtectorBot
```

## BaseBot Capabilities
The `BaseBot` class serves as the foundation for all specialized bots, providing essential functionalities:

### Movement & Navigation
- Advanced pathfinding with obstacle avoidance
- Various movement modes (walking, swimming, climbing)
- Coordinate and target-based navigation

### World Interaction
- Block identification and interaction
- Item collection and manipulation
- Entity detection and tracking
- Environmental awareness and physics handling

### Combat & Survival
- Entity attacking and defensive maneuvers
- Automatic armor management and equipment
- Automatic food consumption for survival
- Totem usage for protection

### Inventory Management
- Item sorting and organization
- Chest interaction and storage
- Crafting capabilities
- Tool selection and management

### Communication
- Chat monitoring and response
- Command parsing and execution
- Status reporting and feedback

## Command System
Commands can be issued through in-game chat or Discord channels. All commands use the `#` prefix for identification.

### Global Commands
Available to all bot types:

| Command | Format | Description | Platform |
|---------|--------|-------------|----------|
| Help | `#help [BotName] [command]` | Display help information for a specific bot or command | All |
| List | `#list` | List all active bots and their status | Discord only |
| Stop | `#stop [bot_name]` | Stop all bots or a specific bot | All |
| Goto | `#goto [bot_name] [x] [y] [z]` or `#goto [bot_name] [blockName]` | Command bot(s) to move to coordinates or a specific block type | All |
| Come | `#come [bot_name]` | Command bot(s) to come to your location | All |
| Status | `#status [bot_name]` | Get detailed status report of bot(s) | Discord only |

### Specialized Bot Commands
Each bot type has specific commands tailored to its functionality.

## Bot Types

### Miner Bot
Specialized for efficient resource gathering and mining operations.

**Capabilities:**
- Block type identification and prioritization
- Efficient mining patterns
- Inventory management for collected resources
- Storage system integration

**Commands:**

| Command | Format | Description |
|---------|--------|-------------|
| Mine | `#mine <blockName> <amount>` | Mine specified block type until reaching target amount |
| Store | `#store <ItemName>` | Store specified item in designated storage |
| MineArea | `#minearea <x1> <y1> <z1> <x2> <y2> <z2>` | Mine all blocks in the specified 3D area |

### Builder Bot
Specialized for construction tasks based on blueprints or patterns.

**Capabilities:**
- Blueprint reading and interpretation
- Efficient block placement
- Material management
- Structure verification

**Commands:**

| Command | Format | Description |
|---------|--------|-------------|
| Build | `#build <FileName>` | Construct structure according to specified blueprint file |

### Protector Bot
Specialized for security and combat operations.

**Capabilities:**
- Entity detection and threat assessment
- Combat tactics and weapon usage
- Area patrol and surveillance
- Player protection

**Commands:**

| Command | Format | Description |
|---------|--------|-------------|
| Guard | `#guard <playerName>` or `#guard <x> <y> <z>` | Guard specified player or coordinate location |
| Patrol | `#patrol <x1> <y1> <z1> <x2> <y2> <z2>` | Patrol within specified area boundaries |
| Follow | `#follow <playerName>` or `#follow <EntityName>` | Follow specified player or entity type |
| Whitelist | `#whitelist <playerName>` | Add player to protection whitelist (will not attack) |

## Shared Data System
Bots share a centralized data store to coordinate activities and share information:

- Resource inventory tracking
- World state information
- Task completion status
- Player information

**Implementation:**
The system maintains shared data through persistent storage (files) and in-memory structures that are synchronized between bots. Example: When a MinerBot stores resources in a chest, it updates the shared inventory database accessible to all bots, allowing BuilderBot to know what materials are available.

## Discord Integration
All system functions are accessible through a Discord bot interface:

- Command execution with identical syntax to in-game commands
- Rich status reporting with formatted output
- Event notifications and alerts
- Log access and history

## Bot Management

**Bot Creation:**

| Command | Format | Description |
|---------|--------|-------------|
| Login | `#login <BotName> <BotType> <ServerIP> <Port>` | Create and connect a single bot |
| LoginMultiple | `#loginMultiple <FileNameWithBotsNamesInIt> <BotType> <ServerIP> <Port>` | Create and connect multiple bots defined in a file |

**Authentication:**
Bots authenticate using Minecraft accounts specified in the configuration. For online-mode servers, valid Minecraft accounts are required.

## Security
- Bots respond only to commands from authorized users (specified by Discord ID or Minecraft username)
- Command validation prevents malicious inputs
- Rate limiting prevents command spam
- Configurable permission levels for different commands

## Technical Requirements
- Node.js v16+
- Sufficient RAM for multiple bot instances (minimum 256MB per bot)
- Network connectivity to Minecraft server and Discord API
- Storage for shared data and configurations

## Dependencies
Required Mineflayer plugins:
- mineflayer-auto-eat: Automated food consumption
- mineflayer-pvp: Combat capabilities
- mineflayer-utils: Utility functions
- mineflayer-tool: Tool selection and management
- mineflayer-armor-manager: Armor equipment management
- mineflayer-collectblock: Block collection functionality
- mineflayer-blockfinder: Efficient block location
- mineflayer-totem-auto: Automated totem usage

## API References
- Mineflayer API: [https://github.com/PrismarineJS/mineflayer/blob/master/docs/api.md](https://github.com/PrismarineJS/mineflayer/blob/master/docs/api.md)
- Mineflayer PVP API: [https://github.com/PrismarineJS/mineflayer-pvp/blob/master/docs/api.md](https://github.com/PrismarineJS/mineflayer-pvp/blob/master/docs/api.md)
- Example Implementations: [https://github.com/PrismarineJS/mineflayer/tree/master/examples](https://github.com/PrismarineJS/mineflayer/tree/master/examples)