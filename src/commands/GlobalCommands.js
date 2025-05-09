/**
 * GlobalCommands - Implementation of global commands
 * 
 * This file contains the implementation of global commands available to all bot types.
 */

/**
 * Create global commands
 * @param {Object} dependencies - System dependencies
 * @param {BotManager} dependencies.botManager - Bot manager instance
 * @param {CommandParser} dependencies.commandParser - Command parser instance
 */
function createGlobalCommands({ botManager, commandParser }) {
  // Help command
  commandParser.registerCommand({
    name: 'help',
    description: 'Display help information',
    usage: '#help [botName] [command]',
    group: 'global',
    execute: async ({ args, platform }) => {
      if (args.length === 0) {
        // Show general help
        return {
          type: 'help',
          commands: commandParser.getCommands()
        };
      }
      
      const botName = args[0];
      const commandName = args[1];
      
      if (commandName) {
        // Show help for specific command
        const command = commandParser.commands.get(commandName);
        if (!command) {
          throw new Error(`Command '${commandName}' not found`);
        }
        
        return {
          type: 'command-help',
          command: {
            name: command.name,
            description: command.description,
            usage: command.usage,
            group: command.group
          }
        };
      }
      
      // Show help for specific bot type
      const bot = botManager.getBot(botName);
      if (!bot) {
        throw new Error(`Bot '${botName}' not found`);
      }
      
      // Find commands for the bot's type
      const botCommands = commandParser.getCommands(bot.type);
      
      return {
        type: 'bot-help',
        botName: botName,
        botType: bot.type,
        commands: botCommands
      };
    }
  });
  
  // List command
  commandParser.registerCommand({
    name: 'list',
    description: 'List all active bots and their status',
    usage: '#list [type]',
    group: 'global',
    platforms: ['discord'], // Only available on Discord
    execute: async ({ args }) => {
      const type = args[0];
      const bots = botManager.listBots(type);
      
      return {
        type: 'bot-list',
        bots: bots.map(bot => ({
          name: bot.username,
          type: bot.type,
          active: bot.active,
          status: bot.currentTask ? 'busy' : 'idle',
          task: bot.currentTask
        }))
      };
    }
  });
  
  // Stop command
  commandParser.registerCommand({
    name: 'stop',
    description: 'Stop all bots or a specific bot',
    usage: '#stop [botName]',
    group: 'global',
    execute: async ({ args }) => {
      const botName = args[0];
      
      if (!botName) {
        // Stop all bots
        const stoppedCount = await botManager.stopAllBots();
        return {
          type: 'stop-all',
          count: stoppedCount
        };
      }
      
      // Stop specific bot
      const success = await botManager.stopBot(botName);
      
      if (!success) {
        throw new Error(`Failed to stop bot '${botName}'`);
      }
      
      return {
        type: 'stop-bot',
        botName: botName
      };
    }
  });
  
  // Goto command
  commandParser.registerCommand({
    name: 'goto',
    description: 'Command bot(s) to move to coordinates or a block type',
    usage: '#goto [botName] [x] [y] [z] or #goto [botName] [blockName]',
    group: 'global',
    execute: async ({ args }) => {
      if (args.length < 2) {
        throw new Error('Not enough arguments. Usage: #goto [botName] [x] [y] [z] or #goto [botName] [blockName]');
      }
      
      const botName = args[0];
      const bot = botManager.getBot(botName);
      
      if (!bot) {
        throw new Error(`Bot '${botName}' not found`);
      }
      
      // Check if arguments are coordinates or block name
      if (args.length >= 4 && !isNaN(args[1]) && !isNaN(args[2]) && !isNaN(args[3])) {
        // Coordinates
        const x = parseInt(args[1]);
        const y = parseInt(args[2]);
        const z = parseInt(args[3]);
        
        const success = await bot.goTo({ x, y, z });
        
        if (!success) {
          throw new Error(`Failed to navigate to ${x}, ${y}, ${z}`);
        }
        
        return {
          type: 'goto-coords',
          botName: botName,
          coordinates: { x, y, z }
        };
      } else {
        // Block name
        const blockName = args[1];
        
        // Find block
        const blocks = bot.findBlocks({ blockType: blockName, maxDistance: 64 });
        
        if (blocks.length === 0) {
          throw new Error(`No ${blockName} blocks found within range`);
        }
        
        // Navigate to the first block
        const targetPos = blocks[0];
        const success = await bot.goTo({ 
          x: targetPos.x, 
          y: targetPos.y, 
          z: targetPos.z 
        });
        
        if (!success) {
          throw new Error(`Failed to navigate to ${blockName} at ${targetPos.x}, ${targetPos.y}, ${targetPos.z}`);
        }
        
        return {
          type: 'goto-block',
          botName: botName,
          blockName: blockName,
          coordinates: targetPos
        };
      }
    }
  });
  
  // Come command
  commandParser.registerCommand({
    name: 'come',
    description: 'Command bot(s) to come to your location',
    usage: '#come [botName]',
    group: 'global',
    execute: async ({ args, sender, platform, context }) => {
      if (args.length < 1) {
        throw new Error('Not enough arguments. Usage: #come [botName]');
      }
      
      const botName = args[0];
      const bot = botManager.getBot(botName);
      
      if (!bot) {
        throw new Error(`Bot '${botName}' not found`);
      }
      
      if (platform === 'discord') {
        throw new Error('This command can only be used in-game');
      }
      
      // Find player
      const player = bot.bot.players[sender];
      
      if (!player || !player.entity) {
        throw new Error(`Cannot find player ${sender}`);
      }
      
      // Navigate to player
      const position = player.entity.position;
      const success = await bot.goTo({ 
        x: position.x, 
        y: position.y, 
        z: position.z 
      }, 2); // Stay 2 blocks away
      
      if (!success) {
        throw new Error(`Failed to navigate to ${sender}`);
      }
      
      return {
        type: 'come',
        botName: botName,
        playerName: sender
      };
    }
  });
  
  // Status command
  commandParser.registerCommand({
    name: 'status',
    description: 'Get detailed status report of bot(s)',
    usage: '#status [botName]',
    group: 'global',
    platforms: ['discord'], // Only available on Discord
    execute: async ({ args }) => {
      const botName = args[0];
      
      if (!botName) {
        // Get status of all bots
        const bots = botManager.listBots();
        
        return {
          type: 'status-all',
          bots: bots.map(bot => bot.getStatus())
        };
      }
      
      // Get status of specific bot
      const bot = botManager.getBot(botName);
      
      if (!bot) {
        throw new Error(`Bot '${botName}' not found`);
      }
      
      return {
        type: 'status-bot',
        status: bot.getStatus()
      };
    }
  });
  
  // Login command
  commandParser.registerCommand({
    name: 'login',
    description: 'Create and connect a bot',
    usage: '#login <botName> <botType> [serverIP] [port]',
    group: 'management',
    execute: async ({ args }) => {
      if (args.length < 2) {
        throw new Error('Not enough arguments. Usage: #login <botName> <botType> [serverIP] [port]');
      }
      
      const botName = args[0];
      const botType = args[1].toLowerCase();
      const serverIP = args[2] || undefined;
      const port = args[3] ? parseInt(args[3]) : undefined;
      
      const bot = await botManager.createBot({
        username: botName,
        type: botType,
        server: {
          host: serverIP,
          port: port
        }
      });
      
      if (!bot) {
        throw new Error(`Failed to create bot '${botName}'`);
      }
      
      return {
        type: 'login',
        botName: botName,
        botType: botType
      };
    }
  });
  
  // LoginMultiple command
  commandParser.registerCommand({
    name: 'loginMultiple',
    description: 'Create and connect multiple bots defined in a file',
    usage: '#loginMultiple <fileName> <botType> [serverIP] [port]',
    group: 'management',
    execute: async ({ args }) => {
      if (args.length < 2) {
        throw new Error('Not enough arguments. Usage: #loginMultiple <fileName> <botType> [serverIP] [port]');
      }
      
      const fileName = args[0];
      const botType = args[1].toLowerCase();
      const serverIP = args[2] || undefined;
      const port = args[3] ? parseInt(args[3]) : undefined;
      
      const fs = require('fs-extra');
      
      try {
        // Read bot names from file
        const fileContent = await fs.readFile(fileName, 'utf8');
        const botNames = fileContent.split('\n')
          .map(line => line.trim())
          .filter(line => line && !line.startsWith('#'));
        
        // Create bots
        const createdBots = [];
        
        for (const botName of botNames) {
          const bot = await botManager.createBot({
            username: botName,
            type: botType,
            server: {
              host: serverIP,
              port: port
            }
          });
          
          if (bot) {
            createdBots.push(botName);
          }
        }
        
        return {
          type: 'login-multiple',
          count: createdBots.length,
          bots: createdBots,
          botType: botType
        };
      } catch (error) {
        throw new Error(`Failed to read bot names file: ${error.message}`);
      }
    }
  });
}

module.exports = createGlobalCommands; 