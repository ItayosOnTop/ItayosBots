/**
 * ItayosBot Configuration
 * This file contains all configurable parameters for the bot system
 */

module.exports = {
    // Owner information
    owner: {
      minecraftUsername: 'YourMinecraftUsername', // Your Minecraft username
      discordId: 'YourDiscordUserId', // Your Discord user ID
    },
  
    // Bot system settings
    system: {
      commandPrefix: '#', // Prefix for bot commands
      dataSharingEnabled: true, // Whether bots should share data
    },
  
    // Discord integration
    discord: {
      enabled: true, // Set to false to disable Discord integration
      token: 'YOUR_DISCORD_BOT_TOKEN', // Your Discord bot token
      channelId: 'YOUR_DISCORD_CHANNEL_ID', // Discord channel ID for bot communication
    },
  
    // Minecraft server connection
    server: {
      host: 'localhost', // Minecraft server address
      port: 25565, // Minecraft server port
      version: '1.19.2', // Minecraft version
    },
  
    // Bot configuration
    bots: {
      // Default settings for all bots
      defaults: {
        viewDistance: 4, // View distance in chunks
        tickRate: 50, // Bot tick rate in milliseconds
      },
      
      // Bot instances to create on startup
      instances: [
        {
          username: 'MinerBot1',
          type: 'miner',
          password: '', // Optional password for online-mode servers
        },
        {
          username: 'BuilderBot1',
          type: 'builder',
          password: '',
        },
        {
          username: 'ProtectorBot1',
          type: 'protector',
          password: '',
        },
      ],
    },
  
    // Type-specific settings
    botTypes: {
      miner: {
        resourcePriorities: ['diamond', 'iron', 'gold', 'coal'], // Priority of resources to mine
        miningPatterns: ['strip', 'branch'], // Available mining patterns
        returnWhenInventoryFull: true, // Whether to return to base when inventory is full
      },
      builder: {
        schematicsFolder: './schematics', // Folder containing schematic files
        maxBuildHeight: 256, // Maximum build height
        autoCraftMissingItems: true, // Whether to craft missing items automatically
      },
      protector: {
        protectionRadius: 50, // Radius in blocks to protect
        aggressionLevel: 'medium', // low, medium, high
        retreatHealthThreshold: 7, // Health points at which to retreat
      },
    },
  
    // Storage settings
    storage: {
      chestLocations: {
        valuables: {x: 0, y: 0, z: 0}, // Location for storing valuable items
        tools: {x: 0, y: 0, z: 0}, // Location for storing tools
        blocks: {x: 0, y: 0, z: 0}, // Location for storing building blocks
      },
    },
  
    // Safe zones where bots can retreat to
    safeZones: [
      {x: 0, y: 0, z: 0, radius: 20, name: 'Base'},
    ],
  
    // Advanced settings
    advanced: {
      logLevel: 'info', // debug, info, warn, error
      pathfindingTimeout: 10000, // Timeout for pathfinding in milliseconds
      maxPathfindingDistance: 100, // Maximum pathfinding distance in blocks
      memoryUsageLimit: 1024, // Memory usage limit in MB
    },
  }; 