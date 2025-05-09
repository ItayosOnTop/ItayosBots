/**
 * Bot-specific configurations
 * This file contains specific settings and templates for different bot types
 */

const fs = require('fs-extra');
const path = require('path');
const mainConfig = require('../../config');

// Bot configuration templates
const botTemplates = {
  miner: {
    inventory: {
      keepItems: ['diamond_pickaxe', 'iron_pickaxe', 'stone_pickaxe', 'torch', 'bread', 'cooked_beef'],
      priorityItems: ['diamond', 'emerald', 'gold_ore', 'iron_ore'],
    },
    behavior: {
      miningDepth: 11, // Y-level for diamond mining
      returnThreshold: 0.8, // Return to storage when inventory is 80% full
      torchInterval: 8, // Place torch every X blocks
    }
  },
  
  builder: {
    inventory: {
      keepItems: ['diamond_pickaxe', 'stone', 'dirt', 'wood'],
      priorityItems: ['redstone', 'quartz', 'stone_bricks'],
    },
    behavior: {
      checkMaterials: true,
      requestMissingMaterials: true,
      buildSpeed: 'normal', // slow, normal, fast
    }
  },
  
  protector: {
    inventory: {
      keepItems: ['diamond_sword', 'shield', 'bow', 'arrow', 'golden_apple', 'totem_of_undying'],
      priorityItems: ['arrow', 'golden_apple'],
    },
    behavior: {
      attackPriority: ['hostile', 'neutral', 'passive'],
      useBow: true,
      defendOtherBots: true,
      retreatWhenLowHealth: true,
    },
    combat: {
      preferredWeapon: 'diamond_sword',
      useShield: true,
      useTotem: true,
    }
  }
};

// Function to load bot-specific configurations
function loadBotConfig(botType) {
  if (!botTemplates[botType]) {
    throw new Error(`No configuration template found for bot type: ${botType}`);
  }
  
  // Get bot type specific config if it exists
  const botTypeConfig = mainConfig.botTypes && mainConfig.botTypes[botType] 
    ? mainConfig.botTypes[botType] 
    : {};
  
  // Merge with global settings
  return {
    ...mainConfig.bots.defaults,
    ...botTemplates[botType],
    ...botTypeConfig,
    // Add server config for easy access
    server: mainConfig.server
  };
}

module.exports = {
  botTemplates,
  loadBotConfig
}; 