import crypto from 'crypto';

const MASTER_USER_ID = '979837953339719721';

class DiscordOAuth {
  constructor(clientId, clientSecret, redirectUri) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectUri = redirectUri;
    this.sessions = new Map(); // sessionToken -> { userId, expiresAt }
  }

  // Generate OAuth URL for login
  getAuthorizationUrl() {
    const state = crypto.randomBytes(16).toString('hex');
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'identify guilds',
      state: state
    });

    return {
      url: `https://discord.com/api/oauth2/authorize?${params.toString()}`,
      state
    };
  }

  // Exchange authorization code for access token
  async exchangeCode(code) {
    const params = new URLSearchParams({
      client_id: this.clientId,
      client_secret: this.clientSecret,
      grant_type: 'authorization_code',
      code: code,
      redirect_uri: this.redirectUri
    });

    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: params.toString()
    });

    if (!response.ok) {
      throw new Error(`OAuth token exchange failed: ${response.statusText}`);
    }

    return await response.json();
  }

  // Get user information
  async getUser(accessToken) {
    const response = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get user info: ${response.statusText}`);
    }

    return await response.json();
  }

  // Get user's guilds
  async getUserGuilds(accessToken) {
    const response = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    });

    if (!response.ok) {
      throw new Error(`Failed to get user guilds: ${response.statusText}`);
    }

    return await response.json();
  }

  // Check if user has admin permission in a guild
  userHasAdminPermission(guild) {
    // Check if user is owner
    if (guild.owner) {
      return true;
    }

    // Check for ADMINISTRATOR permission (bit flag 0x8)
    if (guild.permissions) {
      const permissions = BigInt(guild.permissions);
      const ADMINISTRATOR = BigInt(0x8);
      return (permissions & ADMINISTRATOR) === ADMINISTRATOR;
    }

    return false;
  }

  // Get guilds where user has admin permission or is master user
  async getAdminGuilds(accessToken, userId, botGuilds, whitelistedGuildIds) {
    const userGuilds = await this.getUserGuilds(accessToken);

    // If master user, return all bot guilds that are whitelisted
    if (userId === MASTER_USER_ID) {
      return botGuilds.filter(guild => whitelistedGuildIds.includes(guild.id));
    }

    // Filter guilds where:
    // 1. User has admin permission
    // 2. Bot is in the guild
    // 3. Guild is whitelisted
    const adminGuilds = userGuilds.filter(guild => {
      const hasAdmin = this.userHasAdminPermission(guild);
      const botInGuild = botGuilds.some(bg => bg.id === guild.id);
      const isWhitelisted = whitelistedGuildIds.includes(guild.id);

      return hasAdmin && botInGuild && isWhitelisted;
    });

    return adminGuilds;
  }

  // Create session token
  createSession(userId, expiresInMs = 30 * 24 * 60 * 60 * 1000) { // 30 days default
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = Date.now() + expiresInMs;

    this.sessions.set(sessionToken, {
      userId,
      expiresAt
    });

    return { sessionToken, expiresAt };
  }

  // Validate session token
  validateSession(sessionToken) {
    const session = this.sessions.get(sessionToken);

    if (!session) {
      return null;
    }

    if (Date.now() > session.expiresAt) {
      this.sessions.delete(sessionToken);
      return null;
    }

    return session;
  }

  // Destroy session
  destroySession(sessionToken) {
    this.sessions.delete(sessionToken);
  }

  // Clean up expired sessions
  cleanupExpiredSessions() {
    const now = Date.now();
    for (const [token, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(token);
      }
    }
  }

  // Check if user is master
  isMasterUser(userId) {
    return userId === MASTER_USER_ID;
  }
}

export default DiscordOAuth;
