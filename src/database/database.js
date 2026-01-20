import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class MultiTenantDB {
  constructor() {
    // Ensure data directory exists
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const dbPath = path.join(dataDir, 'multitenant.db');
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');

    this.initTables();
  }

  initTables() {
    // Servers table - whitelisted servers
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS servers (
        guild_id TEXT PRIMARY KEY,
        guild_name TEXT NOT NULL,
        whitelisted INTEGER DEFAULT 1,
        active INTEGER DEFAULT 1,
        added_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `);

    // Server configs - per-server settings
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS server_configs (
        guild_id TEXT PRIMARY KEY,
        anthropic_api_key TEXT,
        system_prompt TEXT,
        ticket_category_name TEXT DEFAULT 'Support Tickets',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (guild_id) REFERENCES servers(guild_id) ON DELETE CASCADE
      )
    `);

    // User sessions for OAuth
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        user_id TEXT PRIMARY KEY,
        username TEXT NOT NULL,
        discriminator TEXT,
        avatar TEXT,
        access_token TEXT,
        refresh_token TEXT,
        token_expires_at INTEGER,
        last_login INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      )
    `);

    // User-server access tracking
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS user_server_access (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id TEXT NOT NULL,
        guild_id TEXT NOT NULL,
        last_accessed INTEGER NOT NULL,
        UNIQUE(user_id, guild_id),
        FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
        FOREIGN KEY (guild_id) REFERENCES servers(guild_id) ON DELETE CASCADE
      )
    `);

    // Create indexes
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_servers_whitelisted ON servers(whitelisted)`);
    this.db.exec(`CREATE INDEX IF NOT EXISTS idx_user_server_access ON user_server_access(user_id, guild_id)`);
  }

  // ===== SERVER MANAGEMENT =====

  addServer(guildId, guildName, whitelisted = true) {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO servers (guild_id, guild_name, whitelisted, active, added_at, updated_at)
      VALUES (?, ?, ?, 1, ?, ?)
    `);

    stmt.run(guildId, guildName, whitelisted ? 1 : 0, now, now);

    // Create default config
    const configStmt = this.db.prepare(`
      INSERT OR IGNORE INTO server_configs (guild_id, created_at, updated_at)
      VALUES (?, ?, ?)
    `);
    configStmt.run(guildId, now, now);
  }

  isServerWhitelisted(guildId) {
    const stmt = this.db.prepare('SELECT whitelisted FROM servers WHERE guild_id = ?');
    const result = stmt.get(guildId);
    return result && result.whitelisted === 1;
  }

  getServer(guildId) {
    const stmt = this.db.prepare('SELECT * FROM servers WHERE guild_id = ?');
    return stmt.get(guildId);
  }

  getAllServers() {
    const stmt = this.db.prepare('SELECT * FROM servers ORDER BY guild_name ASC');
    return stmt.all();
  }

  updateServerName(guildId, guildName) {
    const stmt = this.db.prepare(`
      UPDATE servers
      SET guild_name = ?, updated_at = ?
      WHERE guild_id = ?
    `);
    stmt.run(guildName, Date.now(), guildId);
  }

  removeServer(guildId) {
    const stmt = this.db.prepare('DELETE FROM servers WHERE guild_id = ?');
    stmt.run(guildId);
  }

  setServerWhitelist(guildId, whitelisted) {
    const stmt = this.db.prepare(`
      UPDATE servers
      SET whitelisted = ?, updated_at = ?
      WHERE guild_id = ?
    `);
    stmt.run(whitelisted ? 1 : 0, Date.now(), guildId);
  }

  // ===== SERVER CONFIG MANAGEMENT =====

  getServerConfig(guildId) {
    const stmt = this.db.prepare('SELECT * FROM server_configs WHERE guild_id = ?');
    return stmt.get(guildId);
  }

  updateServerConfig(guildId, config) {
    const fields = [];
    const values = [];

    if (config.anthropic_api_key !== undefined) {
      fields.push('anthropic_api_key = ?');
      values.push(config.anthropic_api_key);
    }
    if (config.system_prompt !== undefined) {
      fields.push('system_prompt = ?');
      values.push(config.system_prompt);
    }
    if (config.ticket_category_name !== undefined) {
      fields.push('ticket_category_name = ?');
      values.push(config.ticket_category_name);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = ?');
    values.push(Date.now());
    values.push(guildId);

    const stmt = this.db.prepare(`
      UPDATE server_configs
      SET ${fields.join(', ')}
      WHERE guild_id = ?
    `);

    stmt.run(...values);
  }

  // ===== USER MANAGEMENT =====

  upsertUser(userData) {
    const now = Date.now();
    const stmt = this.db.prepare(`
      INSERT INTO users (user_id, username, discriminator, avatar, access_token, refresh_token, token_expires_at, last_login, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(user_id) DO UPDATE SET
        username = excluded.username,
        discriminator = excluded.discriminator,
        avatar = excluded.avatar,
        access_token = excluded.access_token,
        refresh_token = excluded.refresh_token,
        token_expires_at = excluded.token_expires_at,
        last_login = excluded.last_login
    `);

    stmt.run(
      userData.id,
      userData.username,
      userData.discriminator || '0',
      userData.avatar,
      userData.access_token,
      userData.refresh_token,
      userData.token_expires_at,
      now,
      now
    );
  }

  getUser(userId) {
    const stmt = this.db.prepare('SELECT * FROM users WHERE user_id = ?');
    return stmt.get(userId);
  }

  getUserByAccessToken(accessToken) {
    const stmt = this.db.prepare('SELECT * FROM users WHERE access_token = ?');
    return stmt.get(accessToken);
  }

  // ===== USER-SERVER ACCESS =====

  recordServerAccess(userId, guildId) {
    const stmt = this.db.prepare(`
      INSERT INTO user_server_access (user_id, guild_id, last_accessed)
      VALUES (?, ?, ?)
      ON CONFLICT(user_id, guild_id) DO UPDATE SET
        last_accessed = excluded.last_accessed
    `);
    stmt.run(userId, guildId, Date.now());
  }

  getUserAccessibleServers(userId) {
    const stmt = this.db.prepare(`
      SELECT s.*
      FROM servers s
      INNER JOIN user_server_access usa ON s.guild_id = usa.guild_id
      WHERE usa.user_id = ? AND s.whitelisted = 1 AND s.active = 1
      ORDER BY usa.last_accessed DESC
    `);
    return stmt.all(userId);
  }

  // ===== UTILITY =====

  close() {
    this.db.close();
  }
}

export default MultiTenantDB;
