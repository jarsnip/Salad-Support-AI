import crypto from 'crypto';

class SpamFilter {
  constructor(config = {}) {
    this.enabled = config.enabled !== false;
    this.maxThreadsPerWindow = config.maxThreadsPerWindow || 3;
    this.timeWindow = config.timeWindow || 10 * 60 * 1000; // 10 minutes
    this.cooldownPeriod = config.cooldownPeriod || 2 * 60 * 1000; // 2 minutes
    this.autoBanThreshold = config.autoBanThreshold || 5;
    this.banDuration = config.banDuration || 60 * 60 * 1000; // 1 hour
    this.bypassRoles = config.bypassRoles || ['Administrator', 'Moderator', 'Admin', 'Mod'];

    // Track user activity
    this.userActivity = new Map(); // userId -> { threads: [], violations: [], lastThreadTime }
    this.messageHashes = new Map(); // messageHash -> { userId, timestamp }
    this.bannedUsers = new Map(); // userId -> { until: timestamp, reason }
    this.spamEvents = []; // Log spam attempts
    this.maxSpamEvents = 100;

    // Cleanup old data every 5 minutes
    setInterval(() => this.cleanup(), 5 * 60 * 1000);
  }

  async checkUser(userId, username, content, guildMember) {
    if (!this.enabled) {
      return { allowed: true };
    }

    // Check if user has bypass role
    if (this.hasBypassRole(guildMember)) {
      return { allowed: true, reason: 'bypass_role' };
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
      this.recordViolation(userId, username, cooldownCheck.reason);
      this.logSpamEvent(userId, username, content, cooldownCheck.reason);
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

      return {
        allowed: false,
        reason: 'cooldown',
        message: `⏱️ Please wait ${waitTime} seconds before creating another support thread.`,
        details: { waitTime }
      };
    }

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
    // Check if message is too short
    if (content.trim().length < 10) {
      return {
        allowed: false,
        reason: 'too_short',
        message: '📝 Please provide more details about your issue (at least 10 characters).',
        details: { length: content.trim().length }
      };
    }

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

  getUserActivity(userId) {
    if (!this.userActivity.has(userId)) {
      this.userActivity.set(userId, {
        threads: [],
        violations: [],
        lastThreadTime: null
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
    return [...this.spamEvents].reverse();
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
      bans: this.bannedUsers.size
    };

    if (this.userActivity.size > 0 || this.messageHashes.size > 0 || this.bannedUsers.size > 0) {
      console.log(`🧹 Spam filter cleanup: ${cleaned.users} users, ${cleaned.hashes} hashes, ${cleaned.bans} bans`);
    }
  }
}

export default SpamFilter;
