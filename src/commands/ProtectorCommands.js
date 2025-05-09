/**
 * ProtectorCommands - Implementation of ProtectorBot-specific commands
 * 
 * This file contains the implementation of commands specific to the ProtectorBot.
 */

/**
 * Create ProtectorBot commands
 * @param {Object} dependencies - System dependencies
 * @param {BotManager} dependencies.botManager - Bot manager instance
 * @param {CommandParser} dependencies.commandParser - Command parser instance
 */
function createProtectorCommands({ botManager, commandParser }) {
  // Guard command
  commandParser.registerCommand({
    name: 'guard',
    description: 'Guard specified player or coordinate location',
    usage: '#guard <botName> <playerName> or #guard <botName> <x> <y> <z> [radius]',
    group: 'protector',
    execute: async ({ args, sender, platform }) => {
      if (args.length < 2) {
        throw new Error('Not enough arguments. Usage: #guard <botName> <playerName> or #guard <botName> <x> <y> <z> [radius]');
      }
      
      const botName = args[0];
      const bot = botManager.getBot(botName);
      
      if (!bot) {
        throw new Error(`Bot '${botName}' not found`);
      }
      
      if (bot.type !== 'protector') {
        throw new Error(`Bot '${botName}' is not a protector bot`);
      }
      
      // Check if arguments are coordinates or player name
      if (args.length >= 4 && !isNaN(args[1]) && !isNaN(args[2]) && !isNaN(args[3])) {
        // Coordinates
        const x = parseInt(args[1]);
        const y = parseInt(args[2]);
        const z = parseInt(args[3]);
        const radius = args.length >= 5 && !isNaN(args[4]) ? parseInt(args[4]) : 16;
        
        const success = await bot.guardPosition({ 
          position: { x, y, z },
          radius
        });
        
        if (!success) {
          throw new Error(`Failed to guard position ${x}, ${y}, ${z}`);
        }
        
        return {
          type: 'guard-position',
          botName: botName,
          position: { x, y, z },
          radius: radius
        };
      } else {
        // Player name
        const playerName = args[1];
        const followDistance = args.length >= 3 && !isNaN(args[2]) ? parseInt(args[2]) : 3;
        
        const success = await bot.guardPlayer({ 
          playerName,
          followDistance
        });
        
        if (!success) {
          throw new Error(`Failed to guard player ${playerName}`);
        }
        
        return {
          type: 'guard-player',
          botName: botName,
          playerName: playerName,
          followDistance: followDistance
        };
      }
    }
  });
  
  // Patrol command
  commandParser.registerCommand({
    name: 'patrol',
    description: 'Patrol within specified area boundaries',
    usage: '#patrol <botName> <x1> <y1> <z1> <x2> <y2> <z2> [checkRadius]',
    group: 'protector',
    execute: async ({ args }) => {
      if (args.length < 7) {
        throw new Error('Not enough arguments. Usage: #patrol <botName> <x1> <y1> <z1> <x2> <y2> <z2> [checkRadius]');
      }
      
      const botName = args[0];
      const bot = botManager.getBot(botName);
      
      if (!bot) {
        throw new Error(`Bot '${botName}' not found`);
      }
      
      if (bot.type !== 'protector') {
        throw new Error(`Bot '${botName}' is not a protector bot`);
      }
      
      // Parse coordinates
      const x1 = parseInt(args[1]);
      const y1 = parseInt(args[2]);
      const z1 = parseInt(args[3]);
      const x2 = parseInt(args[4]);
      const y2 = parseInt(args[5]);
      const z2 = parseInt(args[6]);
      const radius = args.length >= 8 && !isNaN(args[7]) ? parseInt(args[7]) : 5;
      
      // Validate coordinates
      if (isNaN(x1) || isNaN(y1) || isNaN(z1) || isNaN(x2) || isNaN(y2) || isNaN(z2)) {
        throw new Error('Invalid coordinates. All coordinates must be numbers.');
      }
      
      // Create patrol points - for now just use corners, but could add more sophisticated path
      const points = [
        { x: x1, y: y1, z: z1 },
        { x: x1, y: y1, z: z2 },
        { x: x2, y: y2, z: z2 },
        { x: x2, y: y2, z: z1 }
      ];
      
      const success = await bot.patrol({
        points,
        radius
      });
      
      if (!success) {
        throw new Error('Failed to start patrol');
      }
      
      return {
        type: 'patrol',
        botName: botName,
        points: points,
        radius: radius
      };
    }
  });
  
  // Follow command
  commandParser.registerCommand({
    name: 'follow',
    description: 'Follow specified player or entity type',
    usage: '#follow <botName> <playerName> [distance]',
    group: 'protector',
    execute: async ({ args, sender, platform }) => {
      if (args.length < 2) {
        throw new Error('Not enough arguments. Usage: #follow <botName> <playerName> [distance]');
      }
      
      const botName = args[0];
      const bot = botManager.getBot(botName);
      
      if (!bot) {
        throw new Error(`Bot '${botName}' not found`);
      }
      
      if (bot.type !== 'protector') {
        throw new Error(`Bot '${botName}' is not a protector bot`);
      }
      
      const playerName = args[1];
      const followDistance = args.length >= 3 && !isNaN(args[2]) ? parseInt(args[2]) : 3;
      
      // For now, follow is implemented using guardPlayer since it has the same functionality
      const success = await bot.guardPlayer({
        playerName,
        followDistance
      });
      
      if (!success) {
        throw new Error(`Failed to follow ${playerName}`);
      }
      
      return {
        type: 'follow',
        botName: botName,
        playerName: playerName,
        followDistance: followDistance
      };
    }
  });
  
  // Whitelist command
  commandParser.registerCommand({
    name: 'whitelist',
    description: 'Add player to protection whitelist (will not attack)',
    usage: '#whitelist <botName> add/remove <playerName>',
    group: 'protector',
    execute: async ({ args }) => {
      if (args.length < 3) {
        throw new Error('Not enough arguments. Usage: #whitelist <botName> add/remove <playerName>');
      }
      
      const botName = args[0];
      const action = args[1].toLowerCase();
      const playerName = args[2];
      
      const bot = botManager.getBot(botName);
      
      if (!bot) {
        throw new Error(`Bot '${botName}' not found`);
      }
      
      if (bot.type !== 'protector') {
        throw new Error(`Bot '${botName}' is not a protector bot`);
      }
      
      let success = false;
      
      if (action === 'add') {
        success = bot.whitelistPlayer(playerName);
        
        if (!success) {
          throw new Error(`Failed to add ${playerName} to whitelist`);
        }
        
        return {
          type: 'whitelist-add',
          botName: botName,
          playerName: playerName
        };
      } else if (action === 'remove') {
        success = bot.unwhitelistPlayer(playerName);
        
        if (!success) {
          throw new Error(`Failed to remove ${playerName} from whitelist`);
        }
        
        return {
          type: 'whitelist-remove',
          botName: botName,
          playerName: playerName
        };
      } else {
        throw new Error(`Invalid action: ${action}. Must be 'add' or 'remove'`);
      }
    }
  });
  
  // Aggression command
  commandParser.registerCommand({
    name: 'aggression',
    description: 'Set aggression level for a protector bot',
    usage: '#aggression <botName> <level>',
    aliases: ['aggro'],
    group: 'protector',
    execute: async ({ args }) => {
      if (args.length < 2) {
        throw new Error('Not enough arguments. Usage: #aggression <botName> <level>');
      }
      
      const botName = args[0];
      const level = args[1].toLowerCase();
      
      const bot = botManager.getBot(botName);
      
      if (!bot) {
        throw new Error(`Bot '${botName}' not found`);
      }
      
      if (bot.type !== 'protector') {
        throw new Error(`Bot '${botName}' is not a protector bot`);
      }
      
      if (!['low', 'medium', 'high'].includes(level)) {
        throw new Error(`Invalid aggression level: ${level}. Must be 'low', 'medium', or 'high'`);
      }
      
      const success = bot.setAggressionLevel(level);
      
      if (!success) {
        throw new Error(`Failed to set aggression level to ${level}`);
      }
      
      return {
        type: 'aggression',
        botName: botName,
        level: level
      };
    }
  });
  
  // Stop protection command
  commandParser.registerCommand({
    name: 'stopProtection',
    description: 'Stop all protection tasks',
    usage: '#stopProtection <botName>',
    aliases: ['stopProtect'],
    group: 'protector',
    execute: async ({ args }) => {
      if (args.length < 1) {
        throw new Error('Not enough arguments. Usage: #stopProtection <botName>');
      }
      
      const botName = args[0];
      const bot = botManager.getBot(botName);
      
      if (!bot) {
        throw new Error(`Bot '${botName}' not found`);
      }
      
      if (bot.type !== 'protector') {
        throw new Error(`Bot '${botName}' is not a protector bot`);
      }
      
      const success = bot.stopProtection();
      
      if (!success) {
        throw new Error('Failed to stop protection');
      }
      
      return {
        type: 'stop-protection',
        botName: botName
      };
    }
  });
}

module.exports = createProtectorCommands; 