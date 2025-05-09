/**
 * Discord Configuration
 * 
 * This file contains Discord-specific configuration and templates.
 */

const { EmbedBuilder } = require('discord.js');
const config = require('../../config');

// Discord bot configuration
const discordConfig = {
  enabled: config.discord.enabled,
  token: config.discord.token,
  channelId: config.discord.channelId,
  guildId: config.discord.guildId
};

// Embed templates for various messages
const embedTemplates = {
  // Success message embed
  success: (botName, message) => {
    return new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle(`${botName} - Success`)
      .setDescription(message)
      .setTimestamp();
  },
  
  // Error message embed
  error: (botName, errorMessage) => {
    return new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle(`${botName} - Error`)
      .setDescription(errorMessage)
      .setTimestamp();
  },
  
  // Simple info message embed
  info: (botName, message) => {
    return new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle(`${botName} - Info`)
      .setDescription(message)
      .setTimestamp();
  },
  
  // Bot status embed
  status: (botName, statusData) => {
    const embed = new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle(`Bot Status: ${botName}`)
      .setTimestamp();
    
    if (!statusData) {
      embed.setDescription('Status information not available');
      return embed;
    }
    
    // Add basic status fields
    embed.addFields([
      { name: 'Type', value: statusData.type || 'Unknown', inline: true },
      { name: 'Status', value: statusData.status || 'Unknown', inline: true },
      { name: 'Task', value: statusData.currentTask || 'None', inline: true }
    ]);
    
    // Add position if available
    if (statusData.position) {
      embed.addFields({
        name: 'Position',
        value: `X: ${Math.round(statusData.position.x)} Y: ${Math.round(statusData.position.y)} Z: ${Math.round(statusData.position.z)}`
      });
    }
    
    // Add additional info based on bot type
    if (statusData.type === 'protector') {
      if (statusData.guardTarget) {
        embed.addFields({
          name: 'Guarding', 
          value: statusData.guardTarget.type === 'player' 
            ? `Player: ${statusData.guardTarget.name}`
            : `Position: ${statusData.guardTarget.position.x}, ${statusData.guardTarget.position.y}, ${statusData.guardTarget.position.z}`
        });
      }
    }
    
    return embed;
  },
  
  // Help embed
  help: (data) => {
    if (!data) {
      return new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle('ItayosBot Help')
        .setDescription('No help information available')
        .setTimestamp();
    }
    
    const embed = new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle('ItayosBot Help')
      .setDescription('Available Commands')
      .setTimestamp();
    
    // Add fields for each command group
    if (typeof data === 'object') {
      Object.entries(data).forEach(([category, commands]) => {
        if (commands && commands.length > 0) {
          let fieldValue = '';
          commands.forEach(cmd => {
            fieldValue += `\`${cmd.usage || cmd.name}\` - ${cmd.description || 'No description'}\n`;
          });
          
          embed.addFields({
            name: category.charAt(0).toUpperCase() + category.slice(1),
            value: fieldValue
          });
        }
      });
    }
    
    return embed;
  },
  
  // Command help embed
  commandHelp: (command) => {
    if (!command) {
      return new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle('Command Help')
        .setDescription('Command information not available')
        .setTimestamp();
    }
    
    return new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle(`Command: ${command.name}`)
      .setDescription(command.description || 'No description available')
      .addFields([
        { name: 'Usage', value: command.usage || 'Not specified', inline: true },
        { name: 'Group', value: command.group || 'Not specified', inline: true }
      ])
      .setTimestamp();
  },
  
  // Bot help embed
  botHelp: (botType) => {
    return new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle(`Bot Type: ${botType}`)
      .setDescription(`Commands available for ${botType} bots`)
      .setTimestamp();
  },
  
  // Bot list embed
  botList: (bots) => {
    if (!bots || !Array.isArray(bots) || bots.length === 0) {
      return new EmbedBuilder()
        .setColor('#0099FF')
        .setTitle('Bot List')
        .setDescription('No bots currently active')
        .setTimestamp();
    }
    
    const embed = new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle('Active Bots')
      .setDescription(`${bots.length} bot(s) currently active`)
      .setTimestamp();
    
    bots.forEach(bot => {
      embed.addFields({
        name: bot.name,
        value: `Type: ${bot.type}\nStatus: ${bot.status}\nTask: ${bot.task || 'None'}`
      });
    });
    
    return embed;
  }
};

module.exports = {
  discordConfig,
  embedTemplates
};