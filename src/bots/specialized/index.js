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

module.exports = {
  ProtectorBot,
  createProtectorBot
}; 