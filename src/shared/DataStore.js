/**
 * DataStore - Shared data storage and synchronization
 * 
 * This class provides a centralized data store for bots to share information
 * about resources, world state, tasks, and other important data.
 */

const fs = require('fs-extra');
const path = require('path');
const EventEmitter = require('events');

class DataStore extends EventEmitter {
  /**
   * Create a new DataStore
   * @param {Object} options - Configuration options
   * @param {string} [options.storageDir='./data'] - Directory for data storage
   */
  constructor(options = {}) {
    super();
    
    this.storageDir = options.storageDir || './data';
    this.data = {
      resources: {}, // Resource inventory
      world: {},     // World state information
      tasks: {},     // Task completion status
      players: {},   // Player information
      positions: {}, // Important positions
      chests: {}     // Chest contents
    };
    
    this.dirty = false;
    this.saveInterval = null;
    
    // Ensure storage directory exists
    this._ensureStorageDir();
  }
  
  /**
   * Initialize the data store
   * @returns {Promise<boolean>} - Whether initialization was successful
   */
  async initialize() {
    try {
      // Load existing data if available
      await this._loadData();
      
      // Set up auto-save interval
      this.saveInterval = setInterval(() => {
        if (this.dirty) {
          this._saveData();
          this.dirty = false;
        }
      }, 60000); // Save every minute if there are changes
      
      return true;
    } catch (error) {
      console.error('Failed to initialize data store:', error);
      return false;
    }
  }
  
  /**
   * Stop the data store and save any pending changes
   */
  async stop() {
    if (this.saveInterval) {
      clearInterval(this.saveInterval);
      this.saveInterval = null;
    }
    
    if (this.dirty) {
      await this._saveData();
      this.dirty = false;
    }
  }
  
  /**
   * Get data by key
   * @param {string} category - Data category
   * @param {string} key - Data key
   * @returns {*} - Stored data or undefined
   */
  getData(category, key) {
    if (!this.data[category]) {
      return undefined;
    }
    
    return key ? this.data[category][key] : this.data[category];
  }
  
  /**
   * Set data by key
   * @param {string} category - Data category
   * @param {string} key - Data key
   * @param {*} value - Data value
   * @returns {boolean} - Whether operation was successful
   */
  setData(category, key, value) {
    if (!this.data[category]) {
      this.data[category] = {};
    }
    
    this.data[category][key] = value;
    this.dirty = true;
    
    // Emit change event
    this.emit('dataChanged', { category, key, value });
    
    return true;
  }
  
  /**
   * Update resource inventory
   * @param {Object} options - Update options
   * @param {string} options.item - Item name
   * @param {number} options.count - Item count (negative to remove)
   * @param {string} [options.source] - Source of update (bot name)
   * @returns {Object} - Updated resource count
   */
  updateResource({ item, count, source }) {
    if (!this.data.resources[item]) {
      this.data.resources[item] = { count: 0, sources: {} };
    }
    
    // Update total count
    this.data.resources[item].count += count;
    
    // Update source-specific count if provided
    if (source) {
      if (!this.data.resources[item].sources[source]) {
        this.data.resources[item].sources[source] = 0;
      }
      
      this.data.resources[item].sources[source] += count;
    }
    
    this.dirty = true;
    
    // Emit resource change event
    this.emit('resourceChanged', { 
      item, 
      count: this.data.resources[item].count,
      change: count,
      source 
    });
    
    return { 
      item,
      count: this.data.resources[item].count 
    };
  }
  
  /**
   * Record the contents of a chest at a specific location
   * @param {Object} options - Chest data
   * @param {Object} options.position - Chest position
   * @param {Array} options.items - Items in the chest
   * @param {string} [options.name] - Optional chest name/identifier
   * @returns {boolean} - Whether operation was successful
   */
  recordChestContents({ position, items, name }) {
    const posKey = `${position.x},${position.y},${position.z}`;
    
    this.data.chests[posKey] = {
      position,
      items,
      name: name || posKey,
      lastUpdated: Date.now()
    };
    
    this.dirty = true;
    
    // Emit chest updated event
    this.emit('chestUpdated', { 
      position,
      name: name || posKey,
      itemCount: items.length
    });
    
    return true;
  }
  
  /**
   * Find chests containing a specific item
   * @param {string} itemName - Item name to search for
   * @returns {Array} - Array of chests containing the item
   */
  findChestsWithItem(itemName) {
    return Object.values(this.data.chests)
      .filter(chest => chest.items.some(item => item.name === itemName))
      .map(chest => ({
        position: chest.position,
        name: chest.name,
        count: chest.items
          .filter(item => item.name === itemName)
          .reduce((sum, item) => sum + item.count, 0)
      }));
  }
  
  /**
   * Record an important position
   * @param {Object} options - Position data
   * @param {string} options.name - Position name
   * @param {Object} options.position - Coordinates
   * @param {string} [options.category] - Position category
   * @returns {boolean} - Whether operation was successful
   */
  recordPosition({ name, position, category = 'general' }) {
    if (!this.data.positions[category]) {
      this.data.positions[category] = {};
    }
    
    this.data.positions[category][name] = {
      ...position,
      lastUpdated: Date.now()
    };
    
    this.dirty = true;
    
    // Emit position recorded event
    this.emit('positionRecorded', { 
      name,
      category,
      position
    });
    
    return true;
  }
  
  /**
   * Get a recorded position
   * @param {string} name - Position name
   * @param {string} [category] - Position category
   * @returns {Object|null} - Position coordinates or null if not found
   */
  getPosition(name, category = 'general') {
    if (!this.data.positions[category] || !this.data.positions[category][name]) {
      return null;
    }
    
    const { lastUpdated, ...position } = this.data.positions[category][name];
    return position;
  }
  
  /**
   * Record information about a task
   * @param {Object} options - Task data
   * @param {string} options.taskId - Task identifier
   * @param {string} options.status - Task status
   * @param {Object} options.data - Additional task data
   * @returns {boolean} - Whether operation was successful
   */
  recordTask({ taskId, status, data = {} }) {
    this.data.tasks[taskId] = {
      status,
      ...data,
      lastUpdated: Date.now()
    };
    
    this.dirty = true;
    
    // Emit task updated event
    this.emit('taskUpdated', { 
      taskId,
      status,
      data
    });
    
    return true;
  }
  
  /**
   * Save all data immediately
   * @returns {Promise<boolean>} - Whether save was successful
   */
  async saveNow() {
    try {
      await this._saveData();
      this.dirty = false;
      return true;
    } catch (error) {
      console.error('Failed to save data:', error);
      return false;
    }
  }
  
  /**
   * Ensure the storage directory exists
   * @private
   */
  _ensureStorageDir() {
    try {
      fs.ensureDirSync(this.storageDir);
    } catch (error) {
      console.error('Failed to create storage directory:', error);
      throw error;
    }
  }
  
  /**
   * Load data from storage
   * @private
   * @returns {Promise<void>}
   */
  async _loadData() {
    try {
      // Check if data files exist
      const categories = Object.keys(this.data);
      
      for (const category of categories) {
        const filePath = path.join(this.storageDir, `${category}.json`);
        
        if (await fs.pathExists(filePath)) {
          const data = await fs.readJson(filePath);
          this.data[category] = data;
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
      throw error;
    }
  }
  
  /**
   * Save data to storage
   * @private
   * @returns {Promise<void>}
   */
  async _saveData() {
    try {
      // Save each category to its own file
      const categories = Object.keys(this.data);
      
      for (const category of categories) {
        const filePath = path.join(this.storageDir, `${category}.json`);
        await fs.writeJson(filePath, this.data[category], { spaces: 2 });
      }
    } catch (error) {
      console.error('Error saving data:', error);
      throw error;
    }
  }
}

module.exports = DataStore; 