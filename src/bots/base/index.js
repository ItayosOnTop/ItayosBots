/**
 * BaseBot index - Combines all mixins into a complete BaseBot class
 * 
 * This file imports the base class and all mixins, then combines them
 * to create a fully functional BaseBot with all capabilities.
 */

const BaseBot = require('./BaseBot');
const WorldInteraction = require('./WorldInteraction');
const InventoryManager = require('./InventoryManager');
const CombatManager = require('./CombatManager');

// Utility function to apply mixins
function applyMixins(baseClass, mixins) {
  return class extends baseClass {
    constructor(...args) {
      super(...args);
      
      // Add mixin methods
      Object.assign(this, ...mixins);
    }
  };
}

// Create enhanced BaseBot with all mixins
const EnhancedBaseBot = applyMixins(BaseBot, [
  WorldInteraction,
  InventoryManager,
  CombatManager
]);

module.exports = EnhancedBaseBot; 