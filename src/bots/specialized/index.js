/**
 * Specialized Bots - Entry point
 * 
 * This file exports the specialized bot types.
 */

const ProtectorBot = require('./ProtectorBot');

/**
 * Factory function for creating a ProtectorBot
 * @param {Object} options - Bot configuration
 * @returns {ProtectorBot} - New ProtectorBot instance
 */
function createProtectorBot(options) {
  return new ProtectorBot(options);
}

/**
 * Factory function for creating a MinerBot
 * @param {Object} options - Bot configuration
 * @returns {MinerBot} - New MinerBot instance
 */
function createMinerBot(options) {
  // Temporarily use ProtectorBot as a substitute until MinerBot is fully implemented
  const bot = new ProtectorBot({
    ...options,
    type: 'miner'
  });
  return bot;
}

/**
 * Factory function for creating a BuilderBot
 * @param {Object} options - Bot configuration
 * @returns {BuilderBot} - New BuilderBot instance
 */
function createBuilderBot(options) {
  // Temporarily use ProtectorBot as a substitute until BuilderBot is fully implemented
  const bot = new ProtectorBot({
    ...options,
    type: 'builder'
  });
  return bot;
}

module.exports = {
  ProtectorBot,
  createProtectorBot,
  createMinerBot,
  createBuilderBot
}; 