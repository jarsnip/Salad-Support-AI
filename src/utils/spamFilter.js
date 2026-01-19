import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

class SpamFilter {
  constructor(config = {}) {
    this.enabled = config.enabled !== false;
    this.maxThreadsPerWindow = config.maxThreadsPerWindow || 3;
    this.timeWindow = config.timeWindow || 10 * 60 * 1000; // 10 minutes
    this.cooldownPeriod = config.cooldownPeriod || 2 * 60 * 1000; // 2 minutes
    this.autoBanThreshold = config.autoBanThreshold || 5;
    this.banDuration = config.banDuration || 60 * 60 * 1000; // 1 hour
    this.bypassRoles = config.bypassRoles || ['Administrator', 'Moderator', 'Admin', 'Mod'];
    this.blacklistFile = path.join(process.cwd(), 'data', 'blacklist.json');

    // Track user activity
    this.userActivity = new Map(); // userId -> { threads: [], violations: [], lastThreadTime, cooldownAttempts }
    this.messageHashes = new Map(); // messageHash -> { userId, timestamp }
    this.bannedUsers = new Map(); // userId -> { until: timestamp, reason }
    this.blacklist = new Map(); // userId -> { username, reason, blockedBy, timestamp }
    this.spamEvents = []; // Log spam attempts
    this.maxSpamEvents = 100;
    this.spamEventTTL = 2 * 60 * 1000; // Auto-clear spam events after 2 minutes

    // Load blacklist from file
    this.loadBlacklist();

    // Cleanup old data every 5 minutes
    // Store interval reference for cleanup
    this.cleanupInterval = setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  // Method to stop spam filter and clean up resources
  stop() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  loadBlacklist() {
    try {
      // Ensure data directory exists
      const dataDir = path.dirname(this.blacklistFile);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      // Load blacklist if file exists
      if (fs.existsSync(this.blacklistFile)) {
        const data = fs.readFileSync(this.blacklistFile, 'utf8');
        const blacklistArray = JSON.parse(data);
        this.blacklist = new Map(blacklistArray.map(item => [item.userId, item]));
        console.log(`Loaded ${this.blacklist.size} blacklisted users from file`);
      }
    } catch (error) {
      console.error('Error loading blacklist:', error);
    }
  }

  saveBlacklist() {
    try {
      const blacklistArray = Array.from(this.blacklist.entries()).map(([userId, data]) => ({
        userId,
        ...data
      }));
      fs.writeFileSync(this.blacklistFile, JSON.stringify(blacklistArray, null, 2));
    } catch (error) {
      console.error('Error saving blacklist:', error);
    }
  }

  async checkUser(userId, username, content, guildMember) {
    if (!this.enabled) {
      return { allowed: true };
    }

    // Check if user has bypass role
    if (this.hasBypassRole(guildMember)) {
      return { allowed: true, reason: 'bypass_role' };
    }

    // Check if user is blacklisted (permanent block)
    const blacklistCheck = this.checkBlacklist(userId);
    if (!blacklistCheck.allowed) {
      this.logSpamEvent(userId, username, content, 'blacklisted');
      return blacklistCheck;
    }

    // Check if user is banned
    const banCheck = this.checkBan(userId);
    if (!banCheck.allowed) {
      this.logSpamEvent(userId, username, content, banCheck.reason);
      return banCheck;
    }

    // Check rate limiting
    const rateLimitCheck = this.checkRateLimit(userId);
    if (!rateLimitCheck.allowed) {
      this.recordViolation(userId, username, rateLimitCheck.reason);
      this.logSpamEvent(userId, username, content, rateLimitCheck.reason);
      return rateLimitCheck;
    }

    // Check cooldown
    const cooldownCheck = this.checkCooldown(userId);
    if (!cooldownCheck.allowed) {
      // Only log spam and record violation if user has attempted 3+ times
      if (cooldownCheck.details.attempts >= 3) {
        this.recordViolation(userId, username, cooldownCheck.reason);
        this.logSpamEvent(userId, username, content, cooldownCheck.reason, { attempts: cooldownCheck.details.attempts });
      }
      return cooldownCheck;
    }

    // Check duplicate messages
    const duplicateCheck = this.checkDuplicate(userId, content);
    if (!duplicateCheck.allowed) {
      this.recordViolation(userId, username, duplicateCheck.reason);
      this.logSpamEvent(userId, username, content, duplicateCheck.reason);
      return duplicateCheck;
    }

    // Check content patterns
    const contentCheck = this.checkContent(content);
    if (!contentCheck.allowed) {
      this.recordViolation(userId, username, contentCheck.reason);
      this.logSpamEvent(userId, username, content, contentCheck.reason);
      return contentCheck;
    }

    // All checks passed
    return { allowed: true };
  }

  hasBypassRole(guildMember) {
    if (!guildMember) return false;

    return guildMember.roles.cache.some(role =>
      this.bypassRoles.some(bypassRole =>
        role.name.toLowerCase().includes(bypassRole.toLowerCase())
      )
    );
  }

  checkBlacklist(userId) {
    const blacklisted = this.blacklist.get(userId);
    if (!blacklisted) return { allowed: true };

    return {
      allowed: false,
      reason: 'blacklisted',
      message: '🚫 You are blacklisted from creating support threads.',
      details: {
        blockedBy: blacklisted.blockedBy,
        reason: blacklisted.reason,
        timestamp: blacklisted.timestamp
      }
    };
  }

  checkBan(userId) {
    const ban = this.bannedUsers.get(userId);
    if (!ban) return { allowed: true };

    if (Date.now() < ban.until) {
      const remainingMinutes = Math.ceil((ban.until - Date.now()) / 60000);
      return {
        allowed: false,
        reason: 'banned',
        message: `🚫 You are temporarily banned from creating support threads. Time remaining: ${remainingMinutes} minutes.`,
        details: { until: ban.until, banReason: ban.reason }
      };
    }

    // Ban expired, remove it
    this.bannedUsers.delete(userId);
    return { allowed: true };
  }

  checkRateLimit(userId) {
    const activity = this.getUserActivity(userId);
    const now = Date.now();

    // Remove threads outside the time window
    activity.threads = activity.threads.filter(timestamp => now - timestamp < this.timeWindow);

    if (activity.threads.length >= this.maxThreadsPerWindow) {
      const oldestThread = Math.min(...activity.threads);
      const waitTime = Math.ceil((oldestThread + this.timeWindow - now) / 60000);

      return {
        allowed: false,
        reason: 'rate_limit',
        message: `⏰ You've reached the limit of ${this.maxThreadsPerWindow} support threads per ${this.timeWindow / 60000} minutes. Please wait ${waitTime} minutes before creating another thread.`,
        details: { threads: activity.threads.length, limit: this.maxThreadsPerWindow, waitTime }
      };
    }

    return { allowed: true };
  }

  checkCooldown(userId) {
    const activity = this.getUserActivity(userId);
    const now = Date.now();

    if (activity.lastThreadTime && (now - activity.lastThreadTime) < this.cooldownPeriod) {
      const waitTime = Math.ceil((activity.lastThreadTime + this.cooldownPeriod - now) / 1000);

      // Increment cooldown attempts counter
      activity.cooldownAttempts = (activity.cooldownAttempts || 0) + 1;

      return {
        allowed: false,
        reason: 'cooldown',
        message: `⏱️ Please wait ${waitTime} seconds before creating another support thread.`,
        details: { waitTime, attempts: activity.cooldownAttempts }
      };
    }

    // Reset cooldown attempts when cooldown period passes
    activity.cooldownAttempts = 0;

    return { allowed: true };
  }

  checkDuplicate(userId, content) {
    const hash = this.hashMessage(content);
    const existing = this.messageHashes.get(hash);
    const now = Date.now();

    if (existing && existing.userId === userId && (now - existing.timestamp) < 5 * 60 * 1000) {
      return {
        allowed: false,
        reason: 'duplicate',
        message: '🔄 You already sent this exact message recently. Please wait a few minutes or provide more details.',
        details: { lastSent: existing.timestamp }
      };
    }

    return { allowed: true };
  }

  checkContent(content) {
    // Check for excessive links
    const urlCount = (content.match(/https?:\/\//gi) || []).length;
    if (urlCount > 3) {
      return {
        allowed: false,
        reason: 'too_many_links',
        message: '🔗 Your message contains too many links. Please limit to 3 links per message.',
        details: { urlCount }
      };
    }

    // Check for excessive caps
    const alphaChars = content.replace(/[^A-Za-z]/g, '');
    if (alphaChars.length > 20) {
      const capsRatio = content.replace(/[^A-Z]/g, '').length / alphaChars.length;
      if (capsRatio > 0.8) {
        return {
          allowed: false,
          reason: 'excessive_caps',
          message: '🔠 Please avoid using excessive capital letters.',
          details: { capsRatio }
        };
      }
    }

    // Check for repeated characters
    if (/(.)\1{15,}/.test(content)) {
      return {
        allowed: false,
        reason: 'repeated_chars',
        message: '🔤 Please avoid excessive repeated characters.',
        details: {}
      };
    }

    return { allowed: true };
  }

  recordThread(userId) {
    const activity = this.getUserActivity(userId);
    const now = Date.now();

    activity.threads.push(now);
    activity.lastThreadTime = now;
  }

  recordMessage(userId, content) {
    const hash = this.hashMessage(content);
    this.messageHashes.set(hash, {
      userId,
      timestamp: Date.now()
    });
  }

  recordViolation(userId, username, reason) {
    const activity = this.getUserActivity(userId);

    activity.violations.push({
      reason,
      timestamp: Date.now(),
      username
    });

    // Check if user should be auto-banned
    const recentViolations = activity.violations.filter(
      v => Date.now() - v.timestamp < this.timeWindow
    );

    if (recentViolations.length >= this.autoBanThreshold) {
      this.banUser(userId, username, 'auto_ban_threshold', this.banDuration);
      console.log(`🚫 Auto-banned user ${username} (${userId}) for ${recentViolations.length} violations`);
    }
  }

  banUser(userId, username, reason, duration = this.banDuration) {
    this.bannedUsers.set(userId, {
      until: Date.now() + duration,
      reason,
      username,
      timestamp: Date.now()
    });

    this.logSpamEvent(userId, username, '', 'user_banned', { reason, duration });
  }

  unbanUser(userId) {
    const wasBlocked = this.bannedUsers.delete(userId);
    return wasBlocked;
  }

  addToBlacklist(userId, username, reason, blockedBy) {
    this.blacklist.set(userId, {
      username,
      reason: reason || 'No reason provided',
      blockedBy,
      timestamp: Date.now()
    });

    // Save to file
    this.saveBlacklist();

    this.logSpamEvent(userId, username, '', 'blacklisted', {
      reason,
      blockedBy
    });

    console.log(`🚫 User ${username} (${userId}) added to blacklist by ${blockedBy}`);
    return true;
  }

  removeFromBlacklist(userId) {
    const wasBlacklisted = this.blacklist.delete(userId);
    if (wasBlacklisted) {
      // Save to file
      this.saveBlacklist();
      console.log(`✅ User ${userId} removed from blacklist`);
    }
    return wasBlacklisted;
  }

  getBlacklist() {
    const blacklisted = [];
    for (const [userId, data] of this.blacklist.entries()) {
      blacklisted.push({
        userId,
        username: data.username,
        reason: data.reason,
        blockedBy: data.blockedBy,
        timestamp: data.timestamp
      });
    }
    return blacklisted.sort((a, b) => b.timestamp - a.timestamp);
  }

  isBlacklisted(userId) {
    return this.blacklist.has(userId);
  }

  getUserActivity(userId) {
    if (!this.userActivity.has(userId)) {
      this.userActivity.set(userId, {
        threads: [],
        violations: [],
        lastThreadTime: null,
        cooldownAttempts: 0
      });
    }
    return this.userActivity.get(userId);
  }

  hashMessage(content) {
    return crypto.createHash('md5').update(content.toLowerCase().trim()).digest('hex');
  }

  logSpamEvent(userId, username, content, reason, details = {}) {
    this.spamEvents.push({
      userId,
      username,
      content: content.substring(0, 100),
      reason,
      details,
      timestamp: Date.now()
    });

    if (this.spamEvents.length > this.maxSpamEvents) {
      this.spamEvents.shift();
    }
  }

  getSpamEvents() {
    const now = Date.now();
    // Filter out spam events older than 2 minutes
    const recentEvents = this.spamEvents.filter(event =>
      now - event.timestamp < this.spamEventTTL
    );
    return [...recentEvents].reverse();
  }

  getBannedUsers() {
    const banned = [];
    for (const [userId, ban] of this.bannedUsers.entries()) {
      if (Date.now() < ban.until) {
        banned.push({
          userId,
          username: ban.username,
          until: ban.until,
          reason: ban.reason,
          remainingMs: ban.until - Date.now()
        });
      }
    }
    return banned;
  }

  getStats() {
    return {
      totalSpamEvents: this.spamEvents.length,
      bannedUsers: this.getBannedUsers().length,
      blacklistedUsers: this.blacklist.size,
      trackedUsers: this.userActivity.size
    };
  }

  cleanup() {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours

    // Clean up old message hashes
    for (const [hash, data] of this.messageHashes.entries()) {
      if (now - data.timestamp > 5 * 60 * 1000) {
        this.messageHashes.delete(hash);
      }
    }

    // Clean up old spam events (older than 10 minutes to preserve some history)
    const oldEventCount = this.spamEvents.length;
    this.spamEvents = this.spamEvents.filter(event =>
      now - event.timestamp < 10 * 60 * 1000
    );

    // Clean up old user activity
    for (const [userId, activity] of this.userActivity.entries()) {
      activity.threads = activity.threads.filter(t => now - t < this.timeWindow);
      activity.violations = activity.violations.filter(v => now - v.timestamp < maxAge);

      if (activity.threads.length === 0 && activity.violations.length === 0 &&
          (!activity.lastThreadTime || now - activity.lastThreadTime > maxAge)) {
        this.userActivity.delete(userId);
      }
    }

    // Clean up expired bans
    for (const [userId, ban] of this.bannedUsers.entries()) {
      if (now >= ban.until) {
        this.bannedUsers.delete(userId);
      }
    }

    const cleaned = {
      users: this.userActivity.size,
      hashes: this.messageHashes.size,
      bans: this.bannedUsers.size,
      spamEvents: this.spamEvents.length
    };

    if (this.userActivity.size > 0 || this.messageHashes.size > 0 || this.bannedUsers.size > 0 || oldEventCount > this.spamEvents.length) {
      console.log(`🧹 Spam filter cleanup: ${cleaned.users} users, ${cleaned.hashes} hashes, ${cleaned.bans} bans, ${cleaned.spamEvents} spam events`);
    }
  }
}

export default SpamFilter;
