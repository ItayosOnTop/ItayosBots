/**
 * Logger utility for consistent logging throughout the application
 */

// Log levels in order of verbosity
const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

// Default log level
let currentLogLevel = 'info';

/**
 * Set the global log level
 * @param {string} level - Log level ('debug', 'info', 'warn', 'error')
 */
function setLogLevel(level) {
  if (LOG_LEVELS[level] !== undefined) {
    currentLogLevel = level;
  } else {
    console.error(`Invalid log level: ${level}. Using 'info' instead.`);
    currentLogLevel = 'info';
  }
}

/**
 * Check if a log at the given level should be displayed
 * @param {string} level - Log level to check
 * @returns {boolean} - Whether the log should be displayed
 */
function shouldLog(level) {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLogLevel];
}

/**
 * Format current timestamp for log messages
 * @returns {string} - Formatted timestamp
 */
function getTimestamp() {
  return new Date().toISOString();
}

/**
 * Format a log message
 * @param {string} level - Log level
 * @param {string} message - Log message
 * @param {any} data - Additional data to log
 * @returns {string} - Formatted log message
 */
function formatLogMessage(level, message, data) {
  const timestamp = getTimestamp();
  let logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
  
  if (data) {
    if (data instanceof Error) {
      logMessage += `\n${data.stack || data.message}`;
    } else if (typeof data === 'object') {
      try {
        logMessage += `\n${JSON.stringify(data, null, 2)}`;
      } catch (err) {
        logMessage += `\n[Object cannot be stringified]`;
      }
    } else {
      logMessage += `\n${data}`;
    }
  }
  
  return logMessage;
}

// Logger object with methods for each log level
const logger = {
  debug(message, data) {
    if (shouldLog('debug')) {
      console.debug(formatLogMessage('debug', message, data));
    }
  },
  
  info(message, data) {
    if (shouldLog('info')) {
      console.info(formatLogMessage('info', message, data));
    }
  },
  
  warn(message, data) {
    if (shouldLog('warn')) {
      console.warn(formatLogMessage('warn', message, data));
    }
  },
  
  error(message, data) {
    if (shouldLog('error')) {
      console.error(formatLogMessage('error', message, data));
    }
  },
  
  setLevel: setLogLevel,
};

module.exports = {
  logger,
  setLogLevel,
}; 