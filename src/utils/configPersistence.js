import fs from 'fs';
import path from 'path';

/**
 * Manages persistent configuration that can be updated at runtime
 * Stores non-secret settings in config.json
 */
class ConfigPersistence {
  constructor() {
    this.configDir = path.join(process.cwd(), 'data');
    this.configFile = path.join(this.configDir, 'config.json');
    this.config = this.loadConfig();
  }

  /**
   * Load configuration from file or create with defaults
   */
  loadConfig() {
    try {
      // Ensure data directory exists
      if (!fs.existsSync(this.configDir)) {
        fs.mkdirSync(this.configDir, { recursive: true });
      }

      // Load existing config or create default
      if (fs.existsSync(this.configFile)) {
        const data = fs.readFileSync(this.configFile, 'utf8');
        const config = JSON.parse(data);
        console.log('✅ Loaded persistent configuration from config.json');
        return config;
      } else {
        // Create default config
        const defaultConfig = {
          systemPrompt: null, // Will use default from aiService.js if null
          lastUpdated: Date.now(),
          version: '1.0.0'
        };
        this.saveConfig(defaultConfig);
        console.log('✅ Created new config.json with defaults');
        return defaultConfig;
      }
    } catch (error) {
      console.error('Error loading config:', error);
      return {
        systemPrompt: null,
        lastUpdated: Date.now(),
        version: '1.0.0'
      };
    }
  }

  /**
   * Save configuration to file
   */
  saveConfig(config) {
    try {
      config.lastUpdated = Date.now();
      fs.writeFileSync(this.configFile, JSON.stringify(config, null, 2), 'utf8');
      this.config = config;
      return true;
    } catch (error) {
      console.error('Error saving config:', error);
      return false;
    }
  }

  /**
   * Get current configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Update specific config value
   */
  updateValue(key, value) {
    this.config[key] = value;
    return this.saveConfig(this.config);
  }

  /**
   * Get system prompt (returns null if using default)
   */
  getSystemPrompt() {
    return this.config.systemPrompt;
  }

  /**
   * Set system prompt
   */
  setSystemPrompt(prompt) {
    return this.updateValue('systemPrompt', prompt);
  }

  /**
   * Reset system prompt to default
   */
  resetSystemPrompt() {
    return this.updateValue('systemPrompt', null);
  }
}

// Export singleton instance
const configPersistence = new ConfigPersistence();
export default configPersistence;
