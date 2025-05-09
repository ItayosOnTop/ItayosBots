/**
 * BotDataInterface - Interface for bots to access shared data
 * 
 * This class provides methods for bots to interact with the shared data system.
 */

class BotDataInterface {
  /**
   * Create a new BotDataInterface
   * @param {Object} options - Configuration options
   * @param {DataStore} options.dataStore - Reference to the data store
   * @param {string} options.botName - Name of the bot using this interface
   * @param {string} options.botType - Type of the bot using this interface
   */
  constructor({ dataStore, botName, botType }) {
    this.dataStore = dataStore;
    this.botName = botName;
    this.botType = botType;
    
    // Set up event listeners
    this._setupEventListeners();
  }
  
  /**
   * Report inventory change
   * @param {Object} options - Inventory change data
   * @param {string} options.item - Item name
   * @param {number} options.count - Change in count (positive for gain, negative for loss)
   * @returns {boolean} - Whether operation was successful
   */
  reportInventoryChange({ item, count }) {
    try {
      this.dataStore.updateResource({
        item,
        count,
        source: this.botName
      });
      
      return true;
    } catch (error) {
      console.error(`[${this.botName}] Failed to report inventory change:`, error);
      return false;
    }
  }
  
  /**
   * Report chest contents
   * @param {Object} options - Chest data
   * @param {Object} options.position - Chest position
   * @param {Array} options.items - Items in the chest
   * @param {string} [options.name] - Optional chest name/identifier
   * @returns {boolean} - Whether operation was successful
   */
  reportChestContents({ position, items, name }) {
    try {
      this.dataStore.recordChestContents({
        position,
        items,
        name,
        reporter: this.botName
      });
      
      return true;
    } catch (error) {
      console.error(`[${this.botName}] Failed to report chest contents:`, error);
      return false;
    }
  }
  
  /**
   * Find chests containing specific items
   * @param {string} itemName - Item to search for
   * @returns {Array} - Chest positions containing the item
   */
  findChestsWithItem(itemName) {
    try {
      return this.dataStore.findChestsWithItem(itemName);
    } catch (error) {
      console.error(`[${this.botName}] Failed to find chests with item:`, error);
      return [];
    }
  }
  
  /**
   * Report an important position
   * @param {Object} options - Position data
   * @param {string} options.name - Position name
   * @param {Object} options.position - Coordinates
   * @param {string} [options.category] - Position category
   * @returns {boolean} - Whether operation was successful
   */
  reportPosition({ name, position, category }) {
    try {
      this.dataStore.recordPosition({
        name,
        position,
        category,
        reporter: this.botName
      });
      
      return true;
    } catch (error) {
      console.error(`[${this.botName}] Failed to report position:`, error);
      return false;
    }
  }
  
  /**
   * Get a saved position
   * @param {string} name - Position name
   * @param {string} [category] - Position category
   * @returns {Object|null} - Position coordinates or null if not found
   */
  getPosition(name, category) {
    try {
      return this.dataStore.getPosition(name, category);
    } catch (error) {
      console.error(`[${this.botName}] Failed to get position:`, error);
      return null;
    }
  }
  
  /**
   * Start a task and record it in the shared data
   * @param {Object} options - Task data
   * @param {string} options.taskId - Task identifier
   * @param {string} [options.description] - Task description
   * @param {Object} [options.data] - Additional task data
   * @returns {boolean} - Whether operation was successful
   */
  startTask({ taskId, description, data = {} }) {
    try {
      // Generate a unique task ID if not provided
      const id = taskId || `${this.botName}-${Date.now()}`;
      
      this.dataStore.recordTask({
        taskId: id,
        status: 'in_progress',
        data: {
          bot: this.botName,
          botType: this.botType,
          description,
          startTime: Date.now(),
          ...data
        }
      });
      
      return true;
    } catch (error) {
      console.error(`[${this.botName}] Failed to start task:`, error);
      return false;
    }
  }
  
  /**
   * Complete a task
   * @param {Object} options - Task data
   * @param {string} options.taskId - Task identifier
   * @param {Object} [options.results] - Task results
   * @returns {boolean} - Whether operation was successful
   */
  completeTask({ taskId, results = {} }) {
    try {
      // Get existing task data
      const task = this.dataStore.getData('tasks', taskId);
      
      if (!task) {
        console.warn(`[${this.botName}] Tried to complete unknown task: ${taskId}`);
        return false;
      }
      
      // Update task status
      this.dataStore.recordTask({
        taskId,
        status: 'completed',
        data: {
          ...task,
          completionTime: Date.now(),
          results
        }
      });
      
      return true;
    } catch (error) {
      console.error(`[${this.botName}] Failed to complete task:`, error);
      return false;
    }
  }
  
  /**
   * Fail a task
   * @param {Object} options - Task data
   * @param {string} options.taskId - Task identifier
   * @param {string} options.reason - Failure reason
   * @returns {boolean} - Whether operation was successful
   */
  failTask({ taskId, reason }) {
    try {
      // Get existing task data
      const task = this.dataStore.getData('tasks', taskId);
      
      if (!task) {
        console.warn(`[${this.botName}] Tried to fail unknown task: ${taskId}`);
        return false;
      }
      
      // Update task status
      this.dataStore.recordTask({
        taskId,
        status: 'failed',
        data: {
          ...task,
          failureTime: Date.now(),
          failureReason: reason
        }
      });
      
      return true;
    } catch (error) {
      console.error(`[${this.botName}] Failed to fail task:`, error);
      return false;
    }
  }
  
  /**
   * Find available tasks of a specific type
   * @param {string} taskType - Task type to look for
   * @returns {Array} - Available tasks
   */
  findAvailableTasks(taskType) {
    try {
      const allTasks = this.dataStore.getData('tasks');
      
      return Object.entries(allTasks)
        .filter(([_, task]) => 
          task.status === 'available' && 
          task.data.type === taskType
        )
        .map(([id, task]) => ({
          id,
          ...task
        }));
    } catch (error) {
      console.error(`[${this.botName}] Failed to find available tasks:`, error);
      return [];
    }
  }
  
  /**
   * Claim a task for this bot
   * @param {string} taskId - Task identifier
   * @returns {boolean} - Whether claim was successful
   */
  claimTask(taskId) {
    try {
      // Get existing task data
      const task = this.dataStore.getData('tasks', taskId);
      
      if (!task) {
        console.warn(`[${this.botName}] Tried to claim unknown task: ${taskId}`);
        return false;
      }
      
      if (task.status !== 'available') {
        console.warn(`[${this.botName}] Tried to claim unavailable task: ${taskId}`);
        return false;
      }
      
      // Update task status
      this.dataStore.recordTask({
        taskId,
        status: 'in_progress',
        data: {
          ...task.data,
          assignedTo: this.botName,
          claimTime: Date.now()
        }
      });
      
      return true;
    } catch (error) {
      console.error(`[${this.botName}] Failed to claim task:`, error);
      return false;
    }
  }
  
  /**
   * Check if an item is available in storage
   * @param {string} itemName - Item to check
   * @param {number} [quantity=1] - Required quantity
   * @returns {boolean} - Whether item is available
   */
  isItemAvailable(itemName, quantity = 1) {
    try {
      const resource = this.dataStore.getData('resources', itemName);
      
      if (!resource) {
        return false;
      }
      
      return resource.count >= quantity;
    } catch (error) {
      console.error(`[${this.botName}] Failed to check item availability:`, error);
      return false;
    }
  }
  
  /**
   * Set up event listeners for data changes
   * @private
   */
  _setupEventListeners() {
    // Listen for resource changes
    this.dataStore.on('resourceChanged', (data) => {
      if (data.source !== this.botName) {
        // Another bot updated a resource
        this._handleResourceChange(data);
      }
    });
    
    // Listen for chest updates
    this.dataStore.on('chestUpdated', (data) => {
      if (data.reporter !== this.botName) {
        // Another bot updated a chest
        this._handleChestUpdate(data);
      }
    });
    
    // Listen for task updates
    this.dataStore.on('taskUpdated', (data) => {
      this._handleTaskUpdate(data);
    });
  }
  
  /**
   * Handle resource change event
   * @private
   * @param {Object} data - Resource change data
   */
  _handleResourceChange(data) {
    // Bot-specific handling can be implemented in subclasses
  }
  
  /**
   * Handle chest update event
   * @private
   * @param {Object} data - Chest update data
   */
  _handleChestUpdate(data) {
    // Bot-specific handling can be implemented in subclasses
  }
  
  /**
   * Handle task update event
   * @private
   * @param {Object} data - Task update data
   */
  _handleTaskUpdate(data) {
    // Bot-specific handling can be implemented in subclasses
  }
}

module.exports = BotDataInterface; 