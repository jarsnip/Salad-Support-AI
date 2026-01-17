class Logger {
  constructor() {
    this.logLevel = process.env.LOG_LEVEL || 'info';
    this.levels = {
      error: 0,
      warn: 1,
      info: 2,
      debug: 3
    };
  }

  formatMessage(level, message, data = null) {
    const timestamp = new Date().toISOString();
    const emoji = {
      error: '❌',
      warn: '⚠️',
      info: 'ℹ️',
      debug: '🔍'
    };

    let logMessage = `[${timestamp}] ${emoji[level]} ${level.toUpperCase()}: ${message}`;

    if (data) {
      logMessage += `\n${JSON.stringify(data, null, 2)}`;
    }

    return logMessage;
  }

  shouldLog(level) {
    return this.levels[level] <= this.levels[this.logLevel];
  }

  error(message, data = null) {
    if (this.shouldLog('error')) {
      console.error(this.formatMessage('error', message, data));
    }
  }

  warn(message, data = null) {
    if (this.shouldLog('warn')) {
      console.warn(this.formatMessage('warn', message, data));
    }
  }

  info(message, data = null) {
    if (this.shouldLog('info')) {
      console.log(this.formatMessage('info', message, data));
    }
  }

  debug(message, data = null) {
    if (this.shouldLog('debug')) {
      console.log(this.formatMessage('debug', message, data));
    }
  }
}

export default new Logger();
