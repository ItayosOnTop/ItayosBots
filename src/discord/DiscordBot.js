/**
 * DiscordBot - Discord integration for ItayosBot
 * 
 * This class handles communication with Discord, including commands and status reporting.
 */

const { Client, IntentsBitField, EmbedBuilder } = require('discord.js');
const { discordConfig, embedTemplates } = require('./discordConfig');

class DiscordBot {
  /**
   * Create a new Discord bot
   * @param {Object} options - Configuration options
   * @param {function} options.handleCommand - Function to handle commands
   * @param {Object} options.botManager - Bot manager instance
   * @param {Object} options.dataStore - Data store instance
   */
  constructor({ handleCommand, botManager, dataStore }) {
    this.client = null;
    this.handleCommand = handleCommand;
    this.botManager = botManager;
    this.dataStore = dataStore;
    this.channelId = discordConfig.channelId;
    
    // Bind methods
    this._onReady = this._onReady.bind(this);
    this._onMessage = this._onMessage.bind(this);
    this._handleBotEvents = this._handleBotEvents.bind(this);
  }
  
  /**
   * Connect to Discord
   * @returns {Promise<boolean>} - Whether connection was successful
   */
  async connect() {
    if (!discordConfig.enabled) {
      console.log('Discord integration is disabled');
      return false;
    }
    
    try {
      // Create Discord client
      this.client = new Client({
        intents: [
          IntentsBitField.Flags.Guilds,
          IntentsBitField.Flags.GuildMessages,
          IntentsBitField.Flags.MessageContent,
        ]
      });
      
      // Set up event handlers
      this.client.on('ready', this._onReady);
      this.client.on('messageCreate', this._onMessage);
      
      // Set up bot event handlers
      this._handleBotEvents();
      
      // Login to Discord
      await this.client.login(discordConfig.token);
      
      return true;
    } catch (error) {
      console.error('Discord connection error:', error);
      return false;
    }
  }
  
  /**
   * Disconnect from Discord
   */
  async disconnect() {
    if (this.client) {
      this.client.destroy();
      this.client = null;
    }
  }
  
  /**
   * Send a message to the configured channel
   * @param {string} message - Message to send
   * @returns {Promise<boolean>} - Whether send was successful
   */
  async sendMessage(message) {
    if (!this.client || !this.channelId) {
      return false;
    }
    
    try {
      const channel = await this.client.channels.fetch(this.channelId);
      if (!channel) {
        console.error(`Discord channel ${this.channelId} not found`);
        return false;
      }
      
      await channel.send(message);
      return true;
    } catch (error) {
      console.error('Failed to send Discord message:', error);
      return false;
    }
  }
  
  /**
   * Send an embed to the configured channel
   * @param {Object} embed - Discord embed object
   * @returns {Promise<boolean>} - Whether send was successful
   */
  async sendEmbed(embed) {
    if (!this.client || !this.channelId) {
      return false;
    }
    
    try {
      const channel = await this.client.channels.fetch(this.channelId);
      if (!channel) {
        console.error(`Discord channel ${this.channelId} not found`);
        return false;
      }
      
      await channel.send({ embeds: [embed] });
      return true;
    } catch (error) {
      console.error('Failed to send Discord embed:', error);
      return false;
    }
  }
  
  /**
   * Send bot status
   * @param {string} botName - Bot name
   * @returns {Promise<boolean>} - Whether status was sent
   */
  async sendBotStatus(botName) {
    const bot = this.botManager.getBot(botName);
    
    if (!bot) {
      return false;
    }
    
    const statusData = bot.getStatus();
    const embed = embedTemplates.status(botName, statusData);
    
    return await this.sendEmbed(embed);
  }
  
  /**
   * Send an error message
   * @param {string} botName - Bot name (or system)
   * @param {string} errorMessage - Error message
   * @returns {Promise<boolean>} - Whether message was sent
   */
  async sendError(botName, errorMessage) {
    const embed = embedTemplates.error(botName, errorMessage);
    return await this.sendEmbed(embed);
  }
  
  /**
   * Send a success message
   * @param {string} botName - Bot name (or system)
   * @param {string} message - Success message
   * @returns {Promise<boolean>} - Whether message was sent
   */
  async sendSuccess(botName, message) {
    const embed = embedTemplates.success(botName, message);
    return await this.sendEmbed(embed);
  }
  
  /**
   * Handler for Discord ready event
   * @private
   */
  _onReady() {
    console.log(`Logged in as ${this.client.user.tag}`);
    
    // Set bot status
    this.client.user.setActivity('Minecraft', { type: 'PLAYING' });
    
    // Send startup message
    this.sendMessage('ItayosBot Discord integration active!');
  }
  
  /**
   * Handler for Discord message events
   * @private
   * @param {Message} message - Discord message
   */
  async _onMessage(message) {
    // Ignore bot messages
    if (message.author.bot) return;
    
    // Only handle messages in designated channel
    if (message.channel.id !== this.channelId) return;
    
    // Try to handle as command
    const result = await this.handleCommand({
      message: message.content,
      platform: 'discord',
      sender: message.author.id,
      context: { message, discord: this }
    });
    
    // If not a command or command failed, ignore
    if (!result || !result.success) return;
    
    // Handle command result
    await this._handleCommandResult(message, result);
  }
  
  /**
   * Handle bot manager events
   * @private
   */
  _handleBotEvents() {
    // Bot created
    this.botManager.on('botCreated', (data) => {
      this.sendSuccess('System', `Bot ${data.username} (${data.type}) created and started`);
    });
    
    // Bot stopped
    this.botManager.on('botStopped', (data) => {
      this.sendMessage(`Bot ${data.username} stopped`);
    });
    
    // Bot error
    this.botManager.on('botError', (data) => {
      this.sendError(data.username, data.error.message || 'Unknown error');
    });
    
    // Bot kicked
    this.botManager.on('botKicked', (data) => {
      this.sendError(data.username, `Bot was kicked: ${data.reason}`);
    });
    
    // Bot death
    this.botManager.on('botDeath', (data) => {
      const position = data.position;
      this.sendMessage(`Bot ${data.username} died at X:${position.x.toFixed(0)}, Y:${position.y.toFixed(0)}, Z:${position.z.toFixed(0)}`);
    });
  }
  
  /**
   * Handle command result
   * @private
   * @param {Message} message - Discord message
   * @param {Object} result - Command result
   */
  async _handleCommandResult(message, result) {
    if (!result.result) return;
    
    const { type } = result.result;
    
    // Different handlers based on result type
    switch (type) {
      case 'help':
        await this._sendHelpEmbed(message, result.result.commands);
        break;
        
      case 'command-help':
        await this._sendCommandHelpEmbed(message, result.result.command);
        break;
        
      case 'bot-help':
        await this._sendBotHelpEmbed(message, result.result);
        break;
        
      case 'bot-list':
        await this._sendBotListEmbed(message, result.result.bots);
        break;
        
      case 'status-bot':
        await this._sendStatusEmbed(message, result.result.status);
        break;
        
      case 'status-all':
        await this._sendAllStatusEmbed(message, result.result.bots);
        break;
        
      case 'stop-bot':
        await message.reply(`Bot ${result.result.botName} has been stopped`);
        break;
        
      case 'stop-all':
        await message.reply(`All bots stopped (${result.result.count} bots)`);
        break;
        
      case 'login':
      case 'login-multiple':
        await message.reply(`Bot(s) created successfully`);
        break;
        
      default:
        await message.reply(`Command executed successfully`);
    }
  }
  
  /**
   * Send help embed
   * @private
   * @param {Message} message - Discord message
   * @param {Object} commands - Commands object grouped by category
   */
  async _sendHelpEmbed(message, commands) {
    const embed = embedTemplates.help(commands);
    message.channel.send({ embeds: [embed] });
  }
  
  /**
   * Send command help embed
   * @private
   * @param {Message} message - Discord message
   * @param {Object} command - Command information
   */
  async _sendCommandHelpEmbed(message, command) {
    const embed = new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle(`Command: ${command.name}`)
      .setDescription(command.description)
      .addFields(
        { name: 'Usage', value: command.usage },
        { name: 'Category', value: command.group }
      );
      
    message.channel.send({ embeds: [embed] });
  }
  
  /**
   * Send bot help embed
   * @private
   * @param {Message} message - Discord message
   * @param {Object} data - Bot help data
   */
  async _sendBotHelpEmbed(message, data) {
    const { botName, botType, commands } = data;
    
    const embed = new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle(`Help for ${botName} (${botType})`)
      .setDescription(`Available commands for ${botType} bots:`);
      
    // Add commands
    if (commands && commands.length > 0) {
      const commandText = commands.map(cmd => `\`${cmd.usage}\`: ${cmd.description}`).join('\n');
      embed.addFields({ name: `${botType} Commands`, value: commandText });
    } else {
      embed.addFields({ name: 'Commands', value: 'No specific commands available' });
    }
    
    message.channel.send({ embeds: [embed] });
  }
  
  /**
   * Send bot list embed
   * @private
   * @param {Message} message - Discord message
   * @param {Array} bots - List of bots
   */
  async _sendBotListEmbed(message, bots) {
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
    
    message.channel.send({ embeds: [embed] });
  }
  
  /**
   * Send status embed
   * @private
   * @param {Message} message - Discord message
   * @param {Object} status - Bot status
   */
  async _sendStatusEmbed(message, status) {
    const embed = embedTemplates.status(status.username, status);
    message.channel.send({ embeds: [embed] });
  }
  
  /**
   * Send all bots status embed
   * @private
   * @param {Message} message - Discord message
   * @param {Array} bots - All bot statuses
   */
  async _sendAllStatusEmbed(message, bots) {
    const embed = new EmbedBuilder()
      .setColor('#00FF00')
      .setTitle('All Bots Status')
      .setDescription(`Total: ${bots.length} bot(s)`);
      
    // Add each bot as a field
    bots.forEach(bot => {
      const pos = bot.position ? `X:${bot.position.x.toFixed(0)}, Y:${bot.position.y.toFixed(0)}, Z:${bot.position.z.toFixed(0)}` : 'Unknown';
      
      const statusText = [
        `Status: ${bot.status || 'Unknown'}`,
        `Position: ${pos}`,
        `Health: ${bot.health || 'N/A'}`,
        `Task: ${bot.currentTask || 'None'}`
      ].join('\n');
      
      embed.addFields({ name: `${bot.username} (${bot.type})`, value: statusText });
    });
    
    message.channel.send({ embeds: [embed] });
  }
}

module.exports = DiscordBot; 