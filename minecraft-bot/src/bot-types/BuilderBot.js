/**
 * BuilderBot - Specialized bot for construction and building tasks
 */

const BaseBot = require('./BaseBot');
const Vec3 = require('vec3');

class BuilderBot extends BaseBot {
  /**
   * Create a new BuilderBot instance
   * @param {Object} bot - Mineflayer bot instance
   * @param {Object} config - Global configuration
   * @param {Object} dataStore - Shared data store
   */
  constructor(bot, config, dataStore) {
    super(bot, config, dataStore);
    this.type = 'builder';
    this.buildQueue = [];
    this.currentBuild = null;
    this.clipboard = null;
    this.lastOperations = [];
    this.redoStack = [];
    
    // Initialize builder-specific event handlers
    this.setupBuilderEvents();
  }
  
  /**
   * Set up builder-specific event handlers
   */
  setupBuilderEvents() {
    // Add builder-specific events here
    this.bot.on('blockUpdate', (oldBlock, newBlock) => {
      // Track block changes for undo/redo functionality
      if (this.currentBuild && oldBlock && newBlock) {
        this.lastOperations.push({
          oldBlock,
          newBlock,
          timestamp: Date.now()
        });
      }
    });
  }
  
  /**
   * Handle builder-specific commands
   * @param {string} command - Command name
   * @param {Array} args - Command arguments
   * @returns {string|null} - Command response
   */
  handleCommand(command, args) {
    switch (command) {
      case 'build':
        return this.handleBuildCommand(args);
      case 'clear':
        return this.handleClearCommand(args);
      case 'fill':
        return this.handleFillCommand(args);
      case 'copy':
        return this.handleCopyCommand(args);
      case 'paste':
        return this.handlePasteCommand();
      case 'undo':
        return this.handleUndoCommand();
      case 'redo':
        return this.handleRedoCommand();
      default:
        return super.handleCommand(command, args);
    }
  }
  
  /**
   * Handle the build command
   * @param {Array} args - Command arguments
   * @returns {string} - Command response
   */
  handleBuildCommand(args) {
    if (args.length < 1) {
      return 'Usage: #build [schematic]';
    }
    
    const schematicName = args[0];
    return `Starting build of ${schematicName}`;
  }
  
  /**
   * Handle the clear command
   * @param {Array} args - Command arguments
   * @returns {string} - Command response
   */
  handleClearCommand(args) {
    if (args.length < 1) {
      return 'Usage: #clear [radius]';
    }
    
    const radius = parseInt(args[0], 10);
    if (isNaN(radius) || radius <= 0) {
      return 'Invalid radius. Usage: #clear [radius]';
    }
    
    return `Clearing area with radius ${radius} blocks`;
  }
  
  /**
   * Handle the fill command
   * @param {Array} args - Command arguments
   * @returns {string} - Command response
   */
  handleFillCommand(args) {
    if (args.length < 2) {
      return 'Usage: #fill [block] [radius]';
    }
    
    const blockType = args[0];
    const radius = parseInt(args[1], 10);
    if (isNaN(radius) || radius <= 0) {
      return 'Invalid radius. Usage: #fill [block] [radius]';
    }
    
    return `Filling area with ${blockType} in radius ${radius} blocks`;
  }
  
  /**
   * Handle the copy command
   * @param {Array} args - Command arguments
   * @returns {string} - Command response
   */
  handleCopyCommand(args) {
    if (args.length < 1) {
      return 'Usage: #copy [radius]';
    }
    
    const radius = parseInt(args[0], 10);
    if (isNaN(radius) || radius <= 0) {
      return 'Invalid radius. Usage: #copy [radius]';
    }
    
    return `Copied area with radius ${radius} blocks to clipboard`;
  }
  
  /**
   * Handle the paste command
   * @returns {string} - Command response
   */
  handlePasteCommand() {
    if (!this.clipboard) {
      return 'Nothing in clipboard to paste';
    }
    
    return 'Pasting clipboard contents';
  }
  
  /**
   * Handle the undo command
   * @returns {string} - Command response
   */
  handleUndoCommand() {
    if (this.lastOperations.length === 0) {
      return 'Nothing to undo';
    }
    
    return 'Undoing last operation';
  }
  
  /**
   * Handle the redo command
   * @returns {string} - Command response
   */
  handleRedoCommand() {
    if (this.redoStack.length === 0) {
      return 'Nothing to redo';
    }
    
    return 'Redoing last undone operation';
  }
  
  /**
   * Start the builder bot
   * @returns {boolean} - Success status
   */
  async start() {
    this.isActive = true;
    this.currentTask = 'Builder bot activated';
    return true;
  }
  
  getTypeSpecificHelp() {
    return [
      `${this.config.system.commandPrefix}build [schematic] - Build a structure from schematic`,
      `${this.config.system.commandPrefix}clear [radius] - Clear area around bot`,
      `${this.config.system.commandPrefix}fill [block] [radius] - Fill area with blocks`,
      `${this.config.system.commandPrefix}copy [radius] - Copy area to clipboard`,
      `${this.config.system.commandPrefix}paste - Paste clipboard contents`,
      `${this.config.system.commandPrefix}undo - Undo last build operation`,
      `${this.config.system.commandPrefix}redo - Redo last undone operation`
    ];
  }
  
  getTypeSpecificCommandHelp() {
    return {
      'build': `Usage: ${this.config.system.commandPrefix}build [schematic]\nBuild a structure from a schematic file`,
      'clear': `Usage: ${this.config.system.commandPrefix}clear [radius]\nClear blocks in specified radius`,
      'fill': `Usage: ${this.config.system.commandPrefix}fill [block] [radius]\nFill area with specified block`,
      'copy': `Usage: ${this.config.system.commandPrefix}copy [radius]\nCopy area to clipboard`,
      'paste': `Usage: ${this.config.system.commandPrefix}paste\nPaste clipboard contents`,
      'undo': `Usage: ${this.config.system.commandPrefix}undo\nUndo last build operation`,
      'redo': `Usage: ${this.config.system.commandPrefix}redo\nRedo last undone operation`
    };
  }
}

module.exports = BuilderBot; 