/**
 * Data Store - Central repository for shared bot data
 * Enables communication and coordination between bot instances
 */

const { logger } = require('../utils/logger');
const fs = require('fs');
const path = require('path');

/**
 * Create a new data store instance
 * @returns {Object} - Data store instance
 */
function createDataStore() {
  // In-memory storage for different data types
  const store = {
    resources: new Map(), // Resource locations and amounts
    inventory: new Map(), // Bot inventory contents
    chests: new Map(), // Contents of discovered chests
    threats: new Map(), // Known threats and their locations
    tasks: new Map(), // Current tasks for each bot
    structures: new Map(), // Built or discovered structures
  };
  
  // File to persist data between sessions
  const dataDir = path.join(process.cwd(), 'src', 'data');
  const dataFile = path.join(dataDir, 'store.json');
  
  // Ensure data directory exists
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  
  // Load data from persistent storage if available
  try {
    if (fs.existsSync(dataFile)) {
      const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
      
      // Convert the loaded data back to Maps
      for (const [key, value] of Object.entries(data)) {
        if (store[key] instanceof Map) {
          store[key] = new Map(Object.entries(value));
        } else {
          store[key] = value;
        }
      }
      
      logger.info('Loaded data from persistent storage');
    }
  } catch (err) {
    logger.error('Failed to load data from persistent storage:', err);
  }
  
  /**
   * Save data to persistent storage
   */
  function saveData() {
    try {
      // Convert Maps to objects for serialization
      const data = {};
      
      for (const [key, value] of Object.entries(store)) {
        if (value instanceof Map) {
          data[key] = Object.fromEntries(value);
        } else {
          data[key] = value;
        }
      }
      
      fs.writeFileSync(dataFile, JSON.stringify(data, null, 2), 'utf8');
      logger.debug('Data saved to persistent storage');
    } catch (err) {
      logger.error('Failed to save data to persistent storage:', err);
    }
  }
  
  // Set up periodic saving
  const saveInterval = setInterval(saveData, 60000); // Save every minute
  
  // Resource-related methods
  const resourceMethods = {
    /**
     * Record a resource at a specific location
     */
    addResource(type, location, amount = 1) {
      const key = `${type}:${location.x},${location.y},${location.z}`;
      store.resources.set(key, { type, location, amount, updated: Date.now() });
      return true;
    },
    
    /**
     * Get all resources of a specific type
     */
    getResourcesByType(type) {
      const resources = [];
      
      for (const [_, resource] of store.resources) {
        if (resource.type === type) {
          resources.push(resource);
        }
      }
      
      return resources;
    },
    
    /**
     * Get resources within a specific area
     */
    getResourcesInArea(center, radius) {
      const resources = [];
      
      for (const [_, resource] of store.resources) {
        const dx = resource.location.x - center.x;
        const dy = resource.location.y - center.y;
        const dz = resource.location.z - center.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        if (distance <= radius) {
          resources.push(resource);
        }
      }
      
      return resources;
    },
    
    /**
     * Remove a resource (e.g., after it has been mined)
     */
    removeResource(type, location) {
      const key = `${type}:${location.x},${location.y},${location.z}`;
      return store.resources.delete(key);
    },
  };
  
  // Inventory-related methods
  const inventoryMethods = {
    /**
     * Update a bot's inventory
     */
    updateInventory(botName, items) {
      store.inventory.set(botName, {
        items,
        updated: Date.now(),
      });
      return true;
    },
    
    /**
     * Get a bot's inventory
     */
    getInventory(botName) {
      return store.inventory.get(botName);
    },
    
    /**
     * Check if any bot has a specific item
     */
    findItem(itemName) {
      for (const [botName, inventory] of store.inventory) {
        const item = inventory.items.find(i => i.name === itemName);
        
        if (item) {
          return { botName, item };
        }
      }
      
      return null;
    },
  };
  
  // Chest-related methods
  const chestMethods = {
    /**
     * Record contents of a chest
     */
    updateChest(location, contents) {
      const key = `${location.x},${location.y},${location.z}`;
      store.chests.set(key, {
        location,
        contents,
        updated: Date.now(),
      });
      return true;
    },
    
    /**
     * Get contents of a specific chest
     */
    getChest(location) {
      const key = `${location.x},${location.y},${location.z}`;
      return store.chests.get(key);
    },
    
    /**
     * Find chests containing a specific item
     */
    findChestsWithItem(itemName) {
      const chests = [];
      
      for (const [_, chest] of store.chests) {
        const hasItem = chest.contents.some(item => item.name === itemName);
        
        if (hasItem) {
          chests.push(chest);
        }
      }
      
      return chests;
    },
  };
  
  // Threat-related methods
  const threatMethods = {
    /**
     * Record a threat
     */
    addThreat(type, location, dangerLevel = 'medium') {
      const key = `${type}:${location.x},${location.y},${location.z}`;
      store.threats.set(key, {
        type,
        location,
        dangerLevel,
        spotted: Date.now(),
      });
      return true;
    },
    
    /**
     * Get all current threats
     */
    getAllThreats() {
      // Only return threats spotted in the last 5 minutes
      const threats = [];
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      
      for (const [_, threat] of store.threats) {
        if (threat.spotted >= fiveMinutesAgo) {
          threats.push(threat);
        }
      }
      
      return threats;
    },
    
    /**
     * Get threats within a specific area
     */
    getThreatsInArea(center, radius) {
      const threats = this.getAllThreats();
      
      return threats.filter(threat => {
        const dx = threat.location.x - center.x;
        const dy = threat.location.y - center.y;
        const dz = threat.location.z - center.z;
        const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        return distance <= radius;
      });
    },
    
    /**
     * Remove a threat (e.g., after it has been eliminated)
     */
    removeThreat(type, location) {
      const key = `${type}:${location.x},${location.y},${location.z}`;
      return store.threats.delete(key);
    },
  };
  
  // Task-related methods
  const taskMethods = {
    /**
     * Assign a task to a bot
     */
    assignTask(botName, task) {
      store.tasks.set(botName, {
        ...task,
        assigned: Date.now(),
        status: 'pending',
      });
      return true;
    },
    
    /**
     * Update a task's status
     */
    updateTaskStatus(botName, status, progress = null) {
      const task = store.tasks.get(botName);
      
      if (task) {
        task.status = status;
        task.updated = Date.now();
        
        if (progress !== null) {
          task.progress = progress;
        }
        
        store.tasks.set(botName, task);
        return true;
      }
      
      return false;
    },
    
    /**
     * Get a bot's current task
     */
    getTask(botName) {
      return store.tasks.get(botName);
    },
    
    /**
     * Get all current tasks
     */
    getAllTasks() {
      const tasks = {};
      
      for (const [botName, task] of store.tasks) {
        tasks[botName] = task;
      }
      
      return tasks;
    },
  };
  
  // Structure-related methods
  const structureMethods = {
    /**
     * Record a structure
     */
    addStructure(name, type, location, dimensions) {
      store.structures.set(name, {
        type,
        location,
        dimensions,
        created: Date.now(),
      });
      return true;
    },
    
    /**
     * Get a specific structure
     */
    getStructure(name) {
      return store.structures.get(name);
    },
    
    /**
     * Get all structures
     */
    getAllStructures() {
      return Array.from(store.structures.values());
    },
  };
  
  // Clean up on exit
  process.on('exit', () => {
    clearInterval(saveInterval);
    saveData();
  });
  
  // Combine all methods into a single API
  return {
    ...resourceMethods,
    ...inventoryMethods,
    ...chestMethods,
    ...threatMethods,
    ...taskMethods,
    ...structureMethods,
    
    // Force save data
    save: saveData,
    
    // Get raw store data (for debugging)
    getRawData() {
      const data = {};
      
      for (const [key, value] of Object.entries(store)) {
        if (value instanceof Map) {
          data[key] = Object.fromEntries(value);
        } else {
          data[key] = value;
        }
      }
      
      return data;
    },
  };
}

module.exports = {
  createDataStore,
}; 