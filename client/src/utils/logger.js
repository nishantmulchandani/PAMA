// Centralized logging utility for PAMA
class PAMALogger {
  constructor() {
    this.logs = [];
    this.maxLogs = 1000; // Keep last 1000 log entries
    this.logLevels = {
      ERROR: 0,
      WARN: 1,
      INFO: 2,
      DEBUG: 3
    };
    this.currentLevel = this.logLevels.INFO;
    this.enableConsole = true;
    this.enableStorage = true;
  }

  setLevel(level) {
    if (typeof level === 'string') {
      this.currentLevel = this.logLevels[level.toUpperCase()] || this.logLevels.INFO;
    } else {
      this.currentLevel = level;
    }
  }

  _shouldLog(level) {
    return this.logLevels[level] <= this.currentLevel;
  }

  _formatMessage(level, category, message, data) {
    const timestamp = new Date().toISOString();
    const formattedMessage = `[${timestamp}] [${level}] [${category}] ${message}`;
    
    return {
      timestamp,
      level,
      category,
      message,
      data,
      formattedMessage
    };
  }

  _log(level, category, message, data = null) {
    if (!this._shouldLog(level)) return;

    const logEntry = this._formatMessage(level, category, message, data);

    // Store in memory
    if (this.enableStorage) {
      this.logs.push(logEntry);
      if (this.logs.length > this.maxLogs) {
        this.logs.shift(); // Remove oldest entry
      }
    }

    // Console output
    if (this.enableConsole) {
      const consoleMethod = level === 'ERROR' ? 'error' : 
                           level === 'WARN' ? 'warn' : 
                           level === 'DEBUG' ? 'debug' : 'log';
      
      if (data) {
        console[consoleMethod](logEntry.formattedMessage, data);
      } else {
        console[consoleMethod](logEntry.formattedMessage);
      }
    }

    // JSX logging for After Effects console
    if (typeof CSInterface !== 'undefined') {
      try {
        const cs = new CSInterface();
        const jsxMessage = `PAMA ${level}: [${category}] ${message}`;
        cs.evalScript(`$.writeln("${jsxMessage.replace(/"/g, '\\"')}")`, function() {});
      } catch (error) {
        // Ignore JSX logging errors
      }
    }

    return logEntry;
  }

  error(category, message, data) {
    return this._log('ERROR', category, message, data);
  }

  warn(category, message, data) {
    return this._log('WARN', category, message, data);
  }

  info(category, message, data) {
    return this._log('INFO', category, message, data);
  }

  debug(category, message, data) {
    return this._log('DEBUG', category, message, data);
  }

  // Specialized logging methods for different components
  jsx(message, data) {
    return this.info('JSX', message, data);
  }

  react(message, data) {
    return this.info('REACT', message, data);
  }

  redux(message, data) {
    return this.info('REDUX', message, data);
  }

  import(message, data) {
    return this.info('IMPORT', message, data);
  }

  bridge(message, data) {
    return this.info('BRIDGE', message, data);
  }

  // Get logs with optional filtering
  getLogs(filter = {}) {
    let filteredLogs = [...this.logs];

    if (filter.level) {
      const levelValue = this.logLevels[filter.level.toUpperCase()];
      filteredLogs = filteredLogs.filter(log => this.logLevels[log.level] <= levelValue);
    }

    if (filter.category) {
      filteredLogs = filteredLogs.filter(log => log.category === filter.category);
    }

    if (filter.since) {
      const sinceTime = new Date(filter.since);
      filteredLogs = filteredLogs.filter(log => new Date(log.timestamp) >= sinceTime);
    }

    return filteredLogs;
  }

  // Export logs as text
  exportLogs(filter = {}) {
    const logs = this.getLogs(filter);
    return logs.map(log => log.formattedMessage).join('\n');
  }

  // Clear all logs
  clear() {
    this.logs = [];
    if (this.enableConsole) {
      console.clear();
    }
  }

  // Get summary statistics
  getStats() {
    const stats = {
      total: this.logs.length,
      byLevel: {},
      byCategory: {},
      timeRange: null
    };

    if (this.logs.length > 0) {
      stats.timeRange = {
        start: this.logs[0].timestamp,
        end: this.logs[this.logs.length - 1].timestamp
      };

      this.logs.forEach(log => {
        // Count by level
        stats.byLevel[log.level] = (stats.byLevel[log.level] || 0) + 1;
        
        // Count by category
        stats.byCategory[log.category] = (stats.byCategory[log.category] || 0) + 1;
      });
    }

    return stats;
  }
}

// Create global logger instance
const logger = new PAMALogger();

// Make it available globally
if (typeof window !== 'undefined') {
  window.PAMALogger = logger;
}

export default logger;
