/**
 * Discord integration configuration
 * Settings and utilities for Discord bot integration
 */

const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const mainConfig = require('../../config');

// Discord client configuration
const discordConfig = {
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  token: mainConfig.discord.token,
  channelId: mainConfig.discord.channelId,
  enabled: mainConfig.discord.enabled,
};

// Embed templates for different message types
const embedTemplates = {
  // Status report embed
  status: (botName, data) => {
    return new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle(`${botName} Status Report`)
      .setDescription(`Current status of ${botName}`)
      .addFields(
        { name: 'Status', value: data.status || 'Unknown' },
        { name: 'Location', value: `X: ${data.position?.x || 0}, Y: ${data.position?.y || 0}, Z: ${data.position?.z || 0}` },
        { name: 'Health', value: `${data.health || 0} / ${data.maxHealth || 20}` },
        { name: 'Inventory', value: `${data.inventoryFull || 0}% full` },
        { name: 'Current Task', value: data.currentTask || 'None' }
      )
      .setTimestamp();
  },
  
  // Error notification embed
  error: (botName, errorMessage) => {
    return new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle(`${botName} Error`)
      .setDescription(errorMessage)
      .setTimestamp();
  },
  
  // Success notification embed
  success: (botName, message) => {
    return new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle(`${botName} Success`)
      .setDescription(message)
      .setTimestamp();
  },
  
  // Help embed
  help: (commands) => {
    const embed = new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle('Available Commands')
      .setDescription('Here are the commands you can use:');
    
    // Add fields for each command category
    Object.entries(commands).forEach(([category, commandList]) => {
      const commandText = commandList.map(cmd => `\`/${cmd.name}\`: ${cmd.description}`).join('\n');
      embed.addFields({ name: category, value: commandText });
    });
    
    return embed;
  },
  
  // Bot list embed
  botList: (bots) => {
    const embed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('Active Bots')
      .setDescription(`Total: ${bots.length} bot(s)`);
      
    // Group by type
    const botsByType = {};
    
    bots.forEach(bot => {
      if (!botsByType[bot.type]) {
        botsByType[bot.type] = [];
      }
      
      botsByType[bot.type].push(bot);
    });
    
    // Add fields for each type
    for (const [type, typeBots] of Object.entries(botsByType)) {
      const botList = typeBots.map(bot => 
        `${bot.name} (${bot.status}${bot.task ? `: ${bot.task}` : ''})`
      ).join('\n');
      
      embed.addFields({ name: type, value: botList || 'None' });
    }
    
    return embed;
  },
  
  // Command help embed
  commandHelp: (command) => {
    return new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle(`Command: /${command.name}`)
      .setDescription(command.description)
      .addFields(
        { name: 'Usage', value: command.usage.replace('#', '/') },
        { name: 'Category', value: command.group }
      );
  },
  
  // Bot help embed
  botHelp: (data) => {
    const { botName, botType, commands } = data;
    
    const embed = new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle(`Help for ${botName} (${botType})`)
      .setDescription(`Available commands for ${botType} bots:`);
      
    // Add commands
    if (commands && commands.length > 0) {
      const commandText = commands.map(cmd => `\`/${cmd.name}\`: ${cmd.description}`).join('\n');
      embed.addFields({ name: `${botType} Commands`, value: commandText });
    } else {
      embed.addFields({ name: 'Commands', value: 'No specific commands available' });
    }
    
    return embed;
  }
};

module.exports = {
  discordConfig,
  embedTemplates
}; 