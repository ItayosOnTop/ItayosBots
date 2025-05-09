/**
 * ItayosBot System - Main Entry Point
 * 
 * This file initializes all system components and connects them together.
 */

const config = require('./config');
const createCommandSystem = require('./src/commands');
const createSharedDataSystem = require('./src/shared');
const createDiscordIntegration = require('./src/discord');
const path = require('path');
const fs = require('fs-extra');

/**
 * Initialize the ItayosBot system
 */
async function initSystem() {
  console.log('Initializing ItayosBot System...');
  
  try {
    // Ensure data directory exists
    const dataDir = path.join(__dirname, 'data');
    await fs.ensureDir(dataDir);
    
    // Initialize shared data system
    console.log('Initializing shared data system...');
    const sharedDataSystem = await createSharedDataSystem({
      storageDir: dataDir
    });
    
    // Initialize command system
    console.log('Initializing command system...');
    const commandSystem = createCommandSystem({
      prefix: config.system.commandPrefix
    });
    
    // Initialize Discord integration
    console.log('Initializing Discord integration...');
    const discordIntegration = await createDiscordIntegration({
      handleCommand: commandSystem.handleCommand,
      botManager: commandSystem.botManager,
      dataStore: sharedDataSystem.dataStore,
      commandParser: commandSystem.commandParser
    });
    
    // Add event handler for Minecraft chat messages
    // This would typically be connected to the bots' chat events
    // For now, we'll use a placeholder function that would be called by bots
    const handleMinecraftChat = async (username, message) => {
      // Process message as a potential command
      await commandSystem.handleCommand({
        message,
        platform: 'minecraft',
        sender: username,
        context: { source: 'minecraft' }
      });
    };
    
    console.log('ItayosBot System initialized successfully!');
    
    // Return the initialized system components
    return {
      commandSystem,
      sharedDataSystem,
      discordIntegration,
      handleMinecraftChat
    };
  } catch (error) {
    console.error('Failed to initialize ItayosBot System:', error);
    throw error;
  }
}

// Start the system if this file is run directly (not imported)
if (require.main === module) {
  initSystem()
    .then(() => {
      console.log('ItayosBot System running...');
    })
    .catch(error => {
      console.error('ItayosBot System failed to start:', error);
      process.exit(1);
    });
}

module.exports = initSystem; 