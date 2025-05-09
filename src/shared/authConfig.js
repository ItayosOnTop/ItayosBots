/**
 * Authentication and authorization configuration
 * Manages user permissions and access levels
 */

const mainConfig = require('../../config');

// Permission levels
const PERMISSION_LEVELS = {
  OWNER: 3,     // Full control over all systems
  ADMIN: 2,     // Can manage bots and configurations
  TRUSTED: 1,   // Can control bot actions
  GUEST: 0      // Limited access, basic commands only
};

// Default authorized users
const defaultAuthorizedUsers = {
  minecraft: {
    [mainConfig.owner.minecraftUsername]: PERMISSION_LEVELS.OWNER,
  },
  discord: {
    [mainConfig.owner.discordId]: PERMISSION_LEVELS.OWNER,
  }
};

// Permission requirements for commands
const commandPermissions = {
  // Global commands
  help: PERMISSION_LEVELS.GUEST,
  list: PERMISSION_LEVELS.GUEST,
  status: PERMISSION_LEVELS.GUEST,
  stop: PERMISSION_LEVELS.TRUSTED,
  goto: PERMISSION_LEVELS.TRUSTED,
  come: PERMISSION_LEVELS.TRUSTED,
  
  // Bot management
  login: PERMISSION_LEVELS.ADMIN,
  loginMultiple: PERMISSION_LEVELS.ADMIN,
  
  // MinerBot commands
  mine: PERMISSION_LEVELS.TRUSTED,
  store: PERMISSION_LEVELS.TRUSTED,
  minearea: PERMISSION_LEVELS.TRUSTED,
  
  // BuilderBot commands
  build: PERMISSION_LEVELS.TRUSTED,
  
  // ProtectorBot commands
  guard: PERMISSION_LEVELS.TRUSTED,
  patrol: PERMISSION_LEVELS.TRUSTED,
  follow: PERMISSION_LEVELS.TRUSTED,
  whitelist: PERMISSION_LEVELS.ADMIN,
};

/**
 * Check if a user has sufficient permissions for a command
 * @param {string} platform - 'minecraft' or 'discord'
 * @param {string} userId - User's ID or username
 * @param {string} command - Command to check permission for
 * @returns {boolean} - Whether user has permission
 */
function hasPermission(platform, userId, command) {
  const users = authorizedUsers[platform] || {};
  const userLevel = users[userId] || PERMISSION_LEVELS.GUEST;
  const requiredLevel = commandPermissions[command] || PERMISSION_LEVELS.ADMIN;
  
  return userLevel >= requiredLevel;
}

/**
 * Add a user to the authorized users list
 * @param {string} platform - 'minecraft' or 'discord'
 * @param {string} userId - User's ID or username
 * @param {number} level - Permission level
 */
function addAuthorizedUser(platform, userId, level) {
  if (!authorizedUsers[platform]) {
    authorizedUsers[platform] = {};
  }
  
  authorizedUsers[platform][userId] = level;
}

// Initialize with default authorized users
const authorizedUsers = { ...defaultAuthorizedUsers };

module.exports = {
  PERMISSION_LEVELS,
  authorizedUsers,
  commandPermissions,
  hasPermission,
  addAuthorizedUser
}; 