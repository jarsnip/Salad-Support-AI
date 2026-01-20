/**
 * Server Configuration Manager
 * Manages per-server settings and caches configurations
 */
class ServerConfigManager {
  constructor(database) {
    this.database = database;
    this.configCache = new Map(); // guildId -> config
    this.cacheExpiry = 5 * 60 * 1000; // 5 minutes
    this.lastCacheUpdate = new Map(); // guildId -> timestamp
  }

  /**
   * Get configuration for a specific server
   * Returns cached config if available, otherwise fetches from database
   */
  getServerConfig(guildId) {
    const now = Date.now();
    const lastUpdate = this.lastCacheUpdate.get(guildId);

    // Return cached config if still valid
    if (lastUpdate && (now - lastUpdate) < this.cacheExpiry) {
      return this.configCache.get(guildId);
    }

    // Fetch from database
    const config = this.database.getServerConfig(guildId);

    if (config) {
      this.configCache.set(guildId, config);
      this.lastCacheUpdate.set(guildId, now);
    }

    return config;
  }

  /**
   * Get Anthropic API key for a server
   */
  getApiKey(guildId) {
    const config = this.getServerConfig(guildId);
    return config?.anthropic_api_key || null;
  }

  /**
   * Get system prompt for a server
   */
  getSystemPrompt(guildId) {
    const config = this.getServerConfig(guildId);
    return config?.system_prompt || null;
  }

  /**
   * Get ticket category name for a server
   */
  getTicketCategoryName(guildId) {
    const config = this.getServerConfig(guildId);
    return config?.ticket_category_name || 'Support Tickets';
  }

  /**
   * Check if server has required configuration
   */
  isServerConfigured(guildId) {
    const config = this.getServerConfig(guildId);
    return config && config.anthropic_api_key;
  }

  /**
   * Update server configuration and invalidate cache
   */
  updateServerConfig(guildId, updates) {
    this.database.updateServerConfig(guildId, updates);

    // Invalidate cache
    this.configCache.delete(guildId);
    this.lastCacheUpdate.delete(guildId);
  }

  /**
   * Invalidate cache for a server
   */
  invalidateCache(guildId) {
    this.configCache.delete(guildId);
    this.lastCacheUpdate.delete(guildId);
  }

  /**
   * Clear all caches
   */
  clearAllCaches() {
    this.configCache.clear();
    this.lastCacheUpdate.clear();
  }
}

export default ServerConfigManager;
