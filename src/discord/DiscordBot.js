/**
 * DiscordBot - Discord integration for ItayosBot
 * 
 * This class handles communication with Discord, including commands and status reporting.
 */

const { Client, IntentsBitField, EmbedBuilder, REST, Routes, ApplicationCommandOptionType } = require('discord.js');
const { discordConfig, embedTemplates } = require('./discordConfig');
const mainConfig = require('../../config');

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
    this.commands = new Map();
    this.commandData = [];
    this.prefix = mainConfig.system.commandPrefix;
    
    // Bind methods
    this._onReady = this._onReady.bind(this);
    this._onInteraction = this._onInteraction.bind(this);
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
   * Register slash commands from the command parser
   * This is disabled as we're using prefix commands now
   * @param {Object} commandParser - The command parser instance
   */
  async registerSlashCommands(commandParser) {
    console.log('Slash commands are disabled. Using prefix commands instead.');
    return true;
  }
  
  /**
   * Handle incoming Discord messages
   * @private
   * @param {Message} message - Discord message
   */
  async _onMessage(message) {
    // Ignore messages from bots to prevent loops
    if (message.author.bot) return;
    
    // Only process messages in the designated channel if one is set
    if (this.channelId && message.channelId !== this.channelId) return;
    
    // Check if message starts with the command prefix
    if (!message.content.startsWith(this.prefix)) return;
    
    try {
      // Process the command
      const result = await this.handleCommand({
        message: message.content,
        platform: 'discord',
        sender: message.author.id,
        context: { message, discord: this }
      });
      
      // Handle command result
      if (!result || !result.success) {
        await message.reply(result?.error || 'An error occurred executing the command');
        return;
      }
      
      if (!result.result) {
        await message.reply('Command executed successfully');
        return;
      }
      
      const { type, data } = result.result;
      
      switch (type) {
        case 'text':
          await message.reply(data);
          break;
          
        case 'status':
          if (typeof data === 'string') {
            // Single bot status
            await this.sendBotStatus(data);
            await message.reply(`Status for ${data} has been posted in the channel`);
          } else {
            // Multiple bot status or detailed status
            const embed = this._generateStatusEmbed(data);
            await message.reply({ embeds: [embed] });
          }
          break;
          
        case 'list':
          const listEmbed = embedTemplates.botList(data);
          await message.reply({ embeds: [listEmbed] });
          break;
          
        case 'help':
          if (typeof data === 'string') {
            // Help for specific command or bot
            const helpEmbed = data.startsWith('bot:') 
              ? embedTemplates.botHelp(data.substring(4))
              : embedTemplates.commandHelp(data);
            await message.reply({ embeds: [helpEmbed] });
          } else {
            // General help
            const helpEmbed = embedTemplates.help(data);
            await message.reply({ embeds: [helpEmbed] });
          }
          break;
          
        default:
          // Default success message
          await message.reply('Command executed successfully');
      }
    } catch (error) {
      console.error('Error handling message:', error);
      await message.reply(`Error executing command: ${error.message}`);
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
    if (!this.client) {
      return false;
    }
    
    try {
      // If no specific channel is configured, use the system channel or first available text channel
      if (!this.channelId) {
        // Try to use the system channel if available
        const guild = this.client.guilds.cache.first();
        if (!guild) {
          console.error('No guilds available for the bot');
          return false;
        }
        
        const channel = guild.systemChannel || 
                        guild.channels.cache.find(ch => 
                          ch.type === 0 && // TextChannel
                          ch.permissionsFor(guild.members.me).has('SendMessages')
                        );
        
        if (!channel) {
          console.error('No suitable channel found to send messages');
          return false;
        }
        
        await channel.send(message);
        return true;
      }
      
      // Use the configured channel
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
    if (!this.client) {
      return false;
    }
    
    try {
      // If no specific channel is configured, use the system channel or first available text channel
      if (!this.channelId) {
        // Try to use the system channel if available
        const guild = this.client.guilds.cache.first();
        if (!guild) {
          console.error('No guilds available for the bot');
          return false;
        }
        
        const channel = guild.systemChannel || 
                        guild.channels.cache.find(ch => 
                          ch.type === 0 && // TextChannel
                          ch.permissionsFor(guild.members.me).has('SendMessages')
                        );
        
        if (!channel) {
          console.error('No suitable channel found to send messages');
          return false;
        }
        
        await channel.send({ embeds: [embed] });
        return true;
      }
      
      // Use the configured channel
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
   * Handler for Discord interaction events
   * @private
   * @param {Interaction} interaction - Discord interaction
   */
  async _onInteraction(interaction) {
    if (!interaction.isCommand()) return;
    
    // Only handle commands in designated channel if channel ID is set
    if (this.channelId && interaction.channelId !== this.channelId) {
      await interaction.reply({ 
        content: `Commands can only be used in the designated channel <#${this.channelId}>`, 
        ephemeral: true 
      });
      return;
    }
    
    const { commandName } = interaction;
    const command = this.commands.get(commandName);
    
    if (!command) {
      await interaction.reply({ 
        content: `Command not found: ${commandName}`, 
        ephemeral: true 
      });
      return;
    }
    
    try {
      // Defer reply to give time for processing
      await interaction.deferReply();
      
      // Convert interaction options to args format
      const args = this._optionsToArgs(interaction.options);
      
      // Execute command using the original command name from the command object
      const result = await this.handleCommand({
        message: `#${command.name} ${args.join(' ')}`, // Use original command name, not sanitized
        platform: 'discord',
        sender: interaction.user.id,
        context: { interaction, discord: this }
      });
      
      // Handle command result
      await this._handleInteractionResult(interaction, result);
    } catch (error) {
      console.error('Error handling interaction:', error);
      
      // If we've already deferred, editReply instead of reply
      const replyMethod = interaction.deferred ? 'editReply' : 'reply';
      
      await interaction[replyMethod]({ 
        content: `Error executing command: ${error.message}`, 
        ephemeral: true 
      });
    }
  }
  
  /**
   * Convert interaction options to args array
   * @private
   * @param {CommandInteractionOptionResolver} options - Interaction options
   * @returns {Array<string>} - Arguments array
   */
  _optionsToArgs(options) {
    const args = [];
    const resolvedOptions = options.data;
    
    resolvedOptions.forEach(option => {
      args.push(option.value.toString());
    });
    
    return args;
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
   * Handle command result for interactions
   * @private
   * @param {CommandInteraction} interaction - Discord interaction
   * @param {Object} result - Command result
   */
  async _handleInteractionResult(interaction, result) {
    if (!result || !result.success) {
      await interaction.editReply({
        content: result?.error || 'An error occurred executing the command',
      });
      return;
    }
    
    if (!result.result) {
      await interaction.editReply({ content: 'Command executed successfully' });
      return;
    }
    
    const { type, data } = result.result;
    
    switch (type) {
      case 'text':
        await interaction.editReply({ content: data });
        break;
        
      case 'status':
        if (typeof data === 'string') {
          // Single bot status
          await this.sendBotStatus(data);
          await interaction.editReply({ content: `Status for ${data} has been posted in the channel` });
        } else {
          // Multiple bot status or detailed status
          const embed = this._generateStatusEmbed(data);
          await interaction.editReply({ embeds: [embed] });
        }
        break;
        
      case 'list':
        const listEmbed = embedTemplates.botList(data);
        await interaction.editReply({ embeds: [listEmbed] });
        break;
        
      case 'help':
        if (typeof data === 'string') {
          // Help for specific command or bot
          const helpEmbed = data.startsWith('bot:') 
            ? embedTemplates.botHelp(data.substring(4))
            : embedTemplates.commandHelp(data);
          await interaction.editReply({ embeds: [helpEmbed] });
        } else {
          // General help
          const helpEmbed = embedTemplates.help(data);
          await interaction.editReply({ embeds: [helpEmbed] });
        }
        break;
        
      default:
        // Default success message
        await interaction.editReply({ content: 'Command executed successfully' });
    }
  }
  
  /**
   * Generate a status embed from data
   * @private
   * @param {Object} data - Status data
   * @returns {EmbedBuilder} - Generated embed
   */
  _generateStatusEmbed(data) {
    // If this is a single bot's status
    if (data.botName) {
      return embedTemplates.status(data.botName, data);
    }
    
    // If this is a collection of bots
    const embed = new EmbedBuilder()
      .setColor('#0099FF')
      .setTitle('Bot Status Report')
      .setDescription('Current status of all bots')
      .setTimestamp();
    
    Object.entries(data).forEach(([botName, botData]) => {
      embed.addFields({
        name: botName,
        value: `Status: ${botData.status || 'Unknown'}\nLocation: X:${botData.position?.x || 0}, Y:${botData.position?.y || 0}, Z:${botData.position?.z || 0}\nTask: ${botData.currentTask || 'None'}`
      });
    });
    
    return embed;
  }
}

module.exports = DiscordBot;