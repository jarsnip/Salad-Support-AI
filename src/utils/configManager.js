import fs from 'fs';
import path from 'path';

class ConfigManager {
  constructor() {
    this.envPath = path.join(process.cwd(), '.env');
    this.envExamplePath = path.join(process.cwd(), '.env.example');

    // Define configuration schema with types and descriptions
    this.schema = {
      // Discord Configuration
      DISCORD_TOKEN: {
        type: 'string',
        category: 'Discord',
        description: 'Discord bot authentication token',
        required: true,
        sensitive: true
      },
      DISCORD_CLIENT_ID: {
        type: 'string',
        category: 'Discord',
        description: 'Discord application client ID',
        required: true
      },
      GUILD_ID: {
        type: 'string',
        category: 'Discord',
        description: 'Discord server (guild) ID where bot operates',
        required: true
      },
      SUPPORT_CHANNEL_ID: {
        type: 'string',
        category: 'Discord',
        description: 'Channel ID for support threads',
        required: true
      },
      NEGATIVE_FEEDBACK_CHANNEL_ID: {
        type: 'string',
        category: 'Discord',
        description: 'Channel ID for negative feedback notifications',
        required: false
      },

      // Anthropic API Configuration
      ANTHROPIC_API_KEY: {
        type: 'string',
        category: 'API',
        description: 'Anthropic API key for Claude AI',
        required: true,
        sensitive: true
      },

      // Bot Configuration
      BOT_NAME: {
        type: 'string',
        category: 'Bot',
        description: 'Display name for the bot',
        required: false,
        default: 'Support Bot'
      },
      MAX_CONVERSATION_HISTORY: {
        type: 'number',
        category: 'Bot',
        description: 'Maximum number of messages to keep in conversation history',
        required: false,
        default: 10,
        min: 1,
        max: 100
      },
      AI_MODEL: {
        type: 'string',
        category: 'Bot',
        description: 'Claude AI model to use',
        required: false,
        default: 'claude-sonnet-4-20250514',
        options: [
          'claude-sonnet-4-20250514',
          'claude-opus-4-5-20251101',
          'claude-3-5-sonnet-20241022'
        ]
      },

      // Dashboard Configuration
      DASHBOARD_PORT: {
        type: 'number',
        category: 'Dashboard',
        description: 'Port for dashboard web server',
        required: false,
        default: 3000,
        min: 1024,
        max: 65535
      },

      // Spam Filter Configuration
      SPAM_FILTER_ENABLED: {
        type: 'boolean',
        category: 'Spam Filter',
        description: 'Enable spam filter',
        required: false,
        default: true
      },
      SPAM_MAX_THREADS_PER_WINDOW: {
        type: 'number',
        category: 'Spam Filter',
        description: 'Maximum threads per time window',
        required: false,
        default: 3,
        min: 1,
        max: 20
      },
      SPAM_TIME_WINDOW: {
        type: 'number',
        category: 'Spam Filter',
        description: 'Time window in minutes',
        required: false,
        default: 10,
        min: 1,
        max: 60,
        unit: 'minutes'
      },
      SPAM_COOLDOWN: {
        type: 'number',
        category: 'Spam Filter',
        description: 'Cooldown between threads in minutes',
        required: false,
        default: 2,
        min: 0,
        max: 10,
        unit: 'minutes'
      },
      SPAM_AUTO_BAN_THRESHOLD: {
        type: 'number',
        category: 'Spam Filter',
        description: 'Number of violations before auto-ban',
        required: false,
        default: 5,
        min: 1,
        max: 20
      },
      SPAM_BAN_DURATION: {
        type: 'number',
        category: 'Spam Filter',
        description: 'Ban duration in minutes',
        required: false,
        default: 60,
        min: 1,
        max: 1440,
        unit: 'minutes'
      },

      // Conversation Auto-End Configuration
      AUTO_END_ENABLED: {
        type: 'boolean',
        category: 'Auto-End',
        description: 'Enable automatic conversation ending',
        required: false,
        default: true
      },
      AUTO_END_TIMEOUT: {
        type: 'number',
        category: 'Auto-End',
        description: 'Timeout for auto-ending in minutes',
        required: false,
        default: 5,
        min: 1,
        max: 60,
        unit: 'minutes'
      },
      THREAD_DELETE_AFTER_END: {
        type: 'number',
        category: 'Auto-End',
        description: 'Delete thread after end in minutes',
        required: false,
        default: 5,
        min: 0,
        max: 60,
        unit: 'minutes'
      },
      THREAD_DELETE_AFTER_FEEDBACK: {
        type: 'number',
        category: 'Auto-End',
        description: 'Delete thread after feedback in minutes',
        required: false,
        default: 2,
        min: 0,
        max: 60,
        unit: 'minutes'
      },
      SEND_TRANSCRIPTS: {
        type: 'boolean',
        category: 'Auto-End',
        description: 'Send HTML transcripts when ending conversations',
        required: false,
        default: true
      }
    };
  }

  /**
   * Parse .env file content into key-value pairs
   */
  parseEnvFile(content) {
    const config = {};
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#')) {
        continue;
      }

      // Parse KEY=value
      const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (match) {
        const [, key, value] = match;
        config[key] = value.trim();
      }
    }

    return config;
  }

  /**
   * Read current .env configuration
   */
  readConfig() {
    try {
      if (!fs.existsSync(this.envPath)) {
        return { error: 'Configuration file not found' };
      }

      const content = fs.readFileSync(this.envPath, 'utf8');
      const rawConfig = this.parseEnvFile(content);

      // Convert to typed values with schema
      const config = {};
      for (const [key, schema] of Object.entries(this.schema)) {
        const rawValue = rawConfig[key];

        config[key] = {
          value: this.convertValue(rawValue, schema),
          ...schema,
          isset: rawValue !== undefined
        };
      }

      return config;
    } catch (error) {
      console.error('Error reading config:', error);
      return { error: error.message };
    }
  }

  /**
   * Convert raw string value to typed value based on schema
   */
  convertValue(rawValue, schema) {
    if (rawValue === undefined) {
      return schema.default;
    }

    switch (schema.type) {
      case 'boolean':
        return rawValue.toLowerCase() === 'true';

      case 'number':
        let num = parseInt(rawValue);
        if (isNaN(num)) return schema.default;

        // Convert milliseconds to minutes for display
        if (schema.unit === 'minutes') {
          num = Math.round(num / 60000);
        }

        return num;

      case 'string':
      default:
        return rawValue;
    }
  }

  /**
   * Validate configuration values
   */
  validateConfig(config) {
    const errors = [];

    for (const [key, value] of Object.entries(config)) {
      const schema = this.schema[key];

      if (!schema) {
        errors.push(`Unknown configuration key: ${key}`);
        continue;
      }

      // Check required fields
      if (schema.required && (value === undefined || value === '')) {
        errors.push(`${key} is required`);
        continue;
      }

      // Skip validation if value is empty and not required
      if (value === undefined || value === '') {
        continue;
      }

      // Type validation
      if (schema.type === 'number') {
        const num = typeof value === 'number' ? value : parseInt(value);

        if (isNaN(num)) {
          errors.push(`${key} must be a number`);
          continue;
        }

        if (schema.min !== undefined && num < schema.min) {
          errors.push(`${key} must be at least ${schema.min}`);
        }

        if (schema.max !== undefined && num > schema.max) {
          errors.push(`${key} must be at most ${schema.max}`);
        }
      }

      if (schema.type === 'boolean') {
        if (typeof value !== 'boolean' && value !== 'true' && value !== 'false') {
          errors.push(`${key} must be true or false`);
        }
      }

      // Options validation
      if (schema.options && !schema.options.includes(value)) {
        errors.push(`${key} must be one of: ${schema.options.join(', ')}`);
      }
    }

    return errors;
  }

  /**
   * Update configuration values
   */
  updateConfig(updates) {
    try {
      // Validate updates
      const errors = this.validateConfig(updates);
      if (errors.length > 0) {
        return { success: false, errors };
      }

      // Convert values for storage (minutes -> milliseconds)
      const storageUpdates = {};
      for (const [key, value] of Object.entries(updates)) {
        const schema = this.schema[key];
        let storageValue = value;

        // Convert minutes to milliseconds for storage
        if (schema && schema.unit === 'minutes' && schema.type === 'number') {
          storageValue = parseInt(value) * 60000;
        }

        storageUpdates[key] = storageValue;
      }

      // Read current .env file
      let content = '';
      if (fs.existsSync(this.envPath)) {
        content = fs.readFileSync(this.envPath, 'utf8');
      } else if (fs.existsSync(this.envExamplePath)) {
        // Use .env.example as template if .env doesn't exist
        content = fs.readFileSync(this.envExamplePath, 'utf8');
      }

      const lines = content.split('\n');
      const updatedLines = [];
      const processedKeys = new Set();

      // Update existing lines
      for (const line of lines) {
        const trimmed = line.trim();

        // Keep comments and empty lines
        if (!trimmed || trimmed.startsWith('#')) {
          updatedLines.push(line);
          continue;
        }

        // Check if this line has a key we're updating
        const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=/);
        if (match) {
          const key = match[1];

          if (storageUpdates.hasOwnProperty(key)) {
            // Update this line with converted value
            updatedLines.push(`${key}=${storageUpdates[key]}`);
            processedKeys.add(key);
          } else {
            // Keep line as-is
            updatedLines.push(line);
          }
        } else {
          // Keep line as-is
          updatedLines.push(line);
        }
      }

      // Add new keys that weren't in the file
      for (const [key, value] of Object.entries(storageUpdates)) {
        if (!processedKeys.has(key)) {
          updatedLines.push(`${key}=${value}`);
        }
      }

      // Write back to .env
      fs.writeFileSync(this.envPath, updatedLines.join('\n'), 'utf8');

      return { success: true, message: 'Configuration updated successfully' };
    } catch (error) {
      console.error('Error updating config:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get configuration schema
   */
  getSchema() {
    return this.schema;
  }

  /**
   * Get configuration by category
   */
  getConfigByCategory() {
    const config = this.readConfig();

    if (config.error) {
      return config;
    }

    const categorized = {};

    for (const [key, data] of Object.entries(config)) {
      const category = data.category || 'Other';

      if (!categorized[category]) {
        categorized[category] = {};
      }

      categorized[category][key] = data;
    }

    return categorized;
  }

  /**
   * Validate .env file exists and has required fields
   */
  validateEnvFile() {
    if (!fs.existsSync(this.envPath)) {
      return {
        valid: false,
        error: '.env file not found',
        missingRequired: Object.keys(this.schema).filter(k => this.schema[k].required)
      };
    }

    const config = this.readConfig();
    const missingRequired = [];

    for (const [key, schema] of Object.entries(this.schema)) {
      if (schema.required && !config[key].isset) {
        missingRequired.push(key);
      }
    }

    return {
      valid: missingRequired.length === 0,
      missingRequired
    };
  }
}

export default ConfigManager;
