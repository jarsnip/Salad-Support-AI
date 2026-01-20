import express from 'express';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import archiver from 'archiver';
import cookieParser from 'cookie-parser';
import crypto from 'crypto';
import docsManager from '../utils/docsManager.js';
import ConfigManager from '../utils/configManager.js';
import configPersistence from '../utils/configPersistence.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class DashboardServer {
  constructor(bot, config, database, oauth) {
    this.bot = bot;
    this.config = config;
    this.database = database;
    this.oauth = oauth;
    this.port = config.dashboardPort;
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });
    this.clients = new Set();
    this.errors = [];
    this.maxErrors = 100;
    this.feedbackData = [];
    this.feedbackFile = join(process.cwd(), 'data', 'feedback.json');
    this.configManager = new ConfigManager();

    this.loadFeedback();
    this.setupRoutes();
    this.setupWebSocket();
    this.setupBotEventListeners();
  }

  setupRoutes() {
    // Middleware for JSON and cookie parsing
    this.app.use(express.json());
    this.app.use(cookieParser());

    // ==== DISCORD OAUTH ROUTES (PUBLIC) ====

    // Redirect to Discord OAuth
    this.app.get('/auth/discord', (req, res) => {
      const { url, state } = this.oauth.getAuthorizationUrl();
      // Store state in cookie for verification
      res.cookie('oauth_state', state, {
        httpOnly: true,
        maxAge: 5 * 60 * 1000, // 5 minutes
        sameSite: 'lax'
      });
      res.redirect(url);
    });

    // OAuth callback
    this.app.get('/auth/callback', async (req, res) => {
      try {
        const { code, state } = req.query;
        const storedState = req.cookies.oauth_state;

        // Verify state to prevent CSRF
        if (!state || state !== storedState) {
          return res.status(400).send('Invalid state parameter');
        }

        // Clear state cookie
        res.clearCookie('oauth_state');

        // Exchange code for tokens
        const tokenData = await this.oauth.exchangeCode(code);

        // Get user info
        const user = await this.oauth.getUser(tokenData.access_token);

        // Save user to database
        this.database.upsertUser({
          id: user.id,
          username: user.username,
          discriminator: user.discriminator,
          avatar: user.avatar,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token,
          token_expires_at: Date.now() + (tokenData.expires_in * 1000)
        });

        // Create session
        const { sessionToken, expiresAt } = this.oauth.createSession(user.id);

        // Set session cookie
        res.cookie('dashboard_session', sessionToken, {
          httpOnly: true,
          maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
          sameSite: 'lax'
        });

        // Redirect to server selection
        res.redirect('/servers');
      } catch (error) {
        console.error('OAuth callback error:', error);
        res.status(500).send('Authentication failed');
      }
    });

    // Logout endpoint
    this.app.post('/auth/logout', (req, res) => {
      const token = req.cookies.dashboard_session;
      if (token) {
        this.oauth.destroySession(token);
        res.clearCookie('dashboard_session');
      }
      res.json({ success: true });
    });

    // ==== AUTHENTICATION MIDDLEWARE ====

    // Authentication middleware for protected routes
    const requireAuth = (req, res, next) => {
      // Skip auth for static files
      if (req.path.match(/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/)) {
        return next();
      }

      const token = req.cookies.dashboard_session;

      if (!token) {
        if (req.path.startsWith('/api/')) {
          return res.status(401).json({ error: 'Not authenticated' });
        }
        return res.redirect('/auth/discord');
      }

      const session = this.oauth.validateSession(token);

      if (!session) {
        res.clearCookie('dashboard_session');
        if (req.path.startsWith('/api/')) {
          return res.status(401).json({ error: 'Session expired' });
        }
        return res.redirect('/auth/discord');
      }

      // Attach user ID to request
      req.userId = session.userId;
      next();
    };

    // ==== PUBLIC ROUTES ====

    // Root redirects to Discord login
    this.app.get('/', (req, res) => {
      const token = req.cookies.dashboard_session;
      if (token && this.oauth.validateSession(token)) {
        return res.redirect('/servers');
      }
      res.redirect('/auth/discord');
    });

    // ==== PROTECTED ROUTES ====

    // Server selection page
    this.app.get('/servers', requireAuth, (req, res) => {
      res.sendFile(join(__dirname, 'public', 'servers.html'));
    });

    // API: Get current user info
    this.app.get('/api/user', requireAuth, (req, res) => {
      const MASTER_USER_ID = '979837953339719721';
      const user = this.database.getUser(req.userId);

      res.json({
        id: req.userId,
        username: user?.username || 'Unknown',
        isMaster: req.userId === MASTER_USER_ID
      });
    });

    // API: Get user's accessible servers
    this.app.get('/api/servers', requireAuth, async (req, res) => {
      try {
        const userId = req.userId;
        const user = this.database.getUser(userId);

        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }

        // Get bot's guilds
        const botGuilds = Array.from(this.bot.client.guilds.cache.values()).map(guild => ({
          id: guild.id,
          name: guild.name,
          icon: guild.icon
        }));

        // Get whitelisted guild IDs
        const whitelistedServers = this.database.getAllServers().filter(s => s.whitelisted);
        const whitelistedGuildIds = whitelistedServers.map(s => s.guild_id);

        // Get guilds where user has admin access
        const accessibleGuilds = await this.oauth.getAdminGuilds(
          user.access_token,
          userId,
          botGuilds,
          whitelistedGuildIds
        );

        // Record access for each server
        for (const guild of accessibleGuilds) {
          this.database.recordServerAccess(userId, guild.id);
        }

        res.json({ servers: accessibleGuilds });
      } catch (error) {
        console.error('Error getting servers:', error);
        res.status(500).json({ error: 'Failed to get servers' });
      }
    });

    // Dashboard for specific server
    this.app.get('/dashboard/:guildId', requireAuth, async (req, res) => {
      try {
        const { guildId } = req.params;
        const userId = req.userId;

        // Check if user has access to this server
        if (!await this.hasServerAccess(userId, guildId)) {
          return res.status(403).send('Access denied');
        }

        res.sendFile(join(__dirname, 'public', 'dashboard.html'));
      } catch (error) {
        console.error('Error loading dashboard:', error);
        res.status(500).send('Error loading dashboard');
      }
    });

    // ==== SERVER-SPECIFIC API ENDPOINTS ====

    // Get server configuration
    this.app.get('/api/server/:guildId/config', requireAuth, async (req, res) => {
      try {
        const { guildId } = req.params;

        if (!await this.hasServerAccess(req.userId, guildId)) {
          return res.status(403).json({ error: 'Access denied' });
        }

        const config = this.database.getServerConfig(guildId);
        const server = this.database.getServer(guildId);

        res.json({
          server: {
            id: guildId,
            name: server?.guild_name || 'Unknown Server'
          },
          config: {
            anthropic_api_key: config?.anthropic_api_key ? '***' + config.anthropic_api_key.slice(-4) : null,
            system_prompt: config?.system_prompt || null,
            ticket_category_name: config?.ticket_category_name || 'Support Tickets'
          }
        });
      } catch (error) {
        console.error('Error getting server config:', error);
        res.status(500).json({ error: 'Failed to get configuration' });
      }
    });

    // Update server configuration
    this.app.put('/api/server/:guildId/config', requireAuth, async (req, res) => {
      try {
        const { guildId } = req.params;

        if (!await this.hasServerAccess(req.userId, guildId)) {
          return res.status(403).json({ error: 'Access denied' });
        }

        const { anthropic_api_key, system_prompt, ticket_category_name } = req.body;

        const updates = {};
        if (anthropic_api_key !== undefined) updates.anthropic_api_key = anthropic_api_key;
        if (system_prompt !== undefined) updates.system_prompt = system_prompt;
        if (ticket_category_name !== undefined) updates.ticket_category_name = ticket_category_name;

        this.database.updateServerConfig(guildId, updates);

        // Invalidate server config cache
        this.bot.serverConfig.invalidateCache(guildId);

        res.json({ success: true, message: 'Configuration updated successfully' });
      } catch (error) {
        console.error('Error updating server config:', error);
        res.status(500).json({ error: 'Failed to update configuration' });
      }
    });

    // Get server stats
    this.app.get('/api/server/:guildId/stats', requireAuth, async (req, res) => {
      try {
        const { guildId } = req.params;

        if (!await this.hasServerAccess(req.userId, guildId)) {
          return res.status(403).json({ error: 'Access denied' });
        }

        const convStats = this.bot.conversationManager.getStats(guildId);
        const transcriptStats = this.bot.conversationManager.getTranscriptStats();

        res.json({
          activeConversations: convStats.activeConversations,
          totalMessages: convStats.totalMessages,
          totalTranscripts: transcriptStats.total
        });
      } catch (error) {
        console.error('Error getting server stats:', error);
        res.status(500).json({ error: 'Failed to get stats' });
      }
    });

    // Get server transcripts
    this.app.get('/api/server/:guildId/transcripts', requireAuth, async (req, res) => {
      try {
        const { guildId } = req.params;

        if (!await this.hasServerAccess(req.userId, guildId)) {
          return res.status(403).json({ error: 'Access denied' });
        }

        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;

        const result = this.bot.conversationManager.listTranscripts(limit, offset, guildId);

        res.json(result);
      } catch (error) {
        console.error('Error getting transcripts:', error);
        res.status(500).json({ error: 'Failed to get transcripts' });
      }
    });

    // ==== ADMIN ENDPOINTS (Master User Only) ====

    const requireMasterUser = (req, res, next) => {
      const MASTER_USER_ID = '979837953339719721';
      if (req.userId !== MASTER_USER_ID) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      next();
    };

    // Admin panel page
    this.app.get('/admin', requireAuth, requireMasterUser, (req, res) => {
      res.sendFile(join(__dirname, 'public', 'admin.html'));
    });

    // Get all servers (including non-whitelisted)
    this.app.get('/api/admin/servers', requireAuth, requireMasterUser, (req, res) => {
      try {
        // Get all servers from database
        const dbServers = this.database.getAllServers();

        // Get all servers bot is currently in
        const botGuilds = Array.from(this.bot.client.guilds.cache.values()).map(guild => ({
          id: guild.id,
          name: guild.name,
          memberCount: guild.memberCount,
          icon: guild.icon
        }));

        // Merge data
        const allServers = botGuilds.map(botGuild => {
          const dbServer = dbServers.find(s => s.guild_id === botGuild.id);
          return {
            id: botGuild.id,
            name: botGuild.name,
            memberCount: botGuild.memberCount,
            icon: botGuild.icon,
            whitelisted: dbServer?.whitelisted === 1,
            inDatabase: !!dbServer,
            addedAt: dbServer?.added_at || null
          };
        });

        res.json({ servers: allServers });
      } catch (error) {
        console.error('Error getting admin servers:', error);
        res.status(500).json({ error: 'Failed to get servers' });
      }
    });

    // Whitelist a server
    this.app.post('/api/admin/servers/:guildId/whitelist', requireAuth, requireMasterUser, async (req, res) => {
      try {
        const { guildId } = req.params;

        // Get guild from bot
        const guild = this.bot.client.guilds.cache.get(guildId);
        if (!guild) {
          return res.status(404).json({ error: 'Server not found in bot' });
        }

        // Add or update server in database
        this.database.addServer(guildId, guild.name, true);

        res.json({ success: true, message: `Server ${guild.name} has been whitelisted` });
      } catch (error) {
        console.error('Error whitelisting server:', error);
        res.status(500).json({ error: 'Failed to whitelist server' });
      }
    });

    // Remove server from whitelist
    this.app.delete('/api/admin/servers/:guildId/whitelist', requireAuth, requireMasterUser, (req, res) => {
      try {
        const { guildId } = req.params;

        // Update server to not whitelisted
        this.database.setServerWhitelist(guildId, false);

        res.json({ success: true, message: 'Server removed from whitelist' });
      } catch (error) {
        console.error('Error removing server from whitelist:', error);
        res.status(500).json({ error: 'Failed to remove server from whitelist' });
      }
    });

    // ==== LEGACY ROUTES (Redirect to server selection) ====

    // Serve dashboard page
    this.app.get('/dashboard', (req, res) => {
      res.redirect('/servers');
    });

    // Serve static files from public directory (after auth middleware)
    this.app.use(express.static(join(__dirname, 'public')));

    // API endpoint to get current conversations
    this.app.get('/api/conversations', (req, res) => {
      const conversations = this.getConversationsData();
      res.json(conversations);
    });

    // API endpoint to get errors
    this.app.get('/api/errors', (req, res) => {
      res.json(this.errors);
    });

    // API endpoint to get stats
    this.app.get('/api/stats', (req, res) => {
      const stats = this.bot.conversationManager.getStats();
      const spamStats = this.bot.spamFilter.getStats();
      res.json({
        activeConversations: stats.activeConversations,
        totalMessages: stats.totalMessages,
        errors: this.errors.length,
        feedback: this.feedbackData.length,
        spam: spamStats.totalSpamEvents,
        banned: spamStats.bannedUsers,
        blacklisted: spamStats.blacklistedUsers
      });
    });

    // API endpoint to get feedback data
    this.app.get('/api/feedback', (req, res) => {
      res.json(this.feedbackData);
    });

    // API endpoint to get daily feedback aggregation
    this.app.get('/api/feedback/daily', (req, res) => {
      res.json(this.getDailyFeedback());
    });

    // API endpoint to reset all feedback data
    this.app.post('/api/feedback/reset', (req, res) => {
      try {
        this.feedbackData = [];
        this.saveFeedback();
        console.log('🔄 Feedback data has been reset');
        res.json({ success: true, message: 'Feedback data reset successfully' });

        // Broadcast update to all connected clients
        this.broadcast({
          type: 'feedbackReset',
          data: { feedback: [] }
        });
      } catch (error) {
        console.error('Error resetting feedback:', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // API endpoint to get spam events
    this.app.get('/api/spam', (req, res) => {
      res.json(this.bot.spamFilter.getSpamEvents());
    });

    // API endpoint to get banned users
    this.app.get('/api/banned', (req, res) => {
      res.json(this.bot.spamFilter.getBannedUsers());
    });

    // API endpoint to unban a user
    this.app.delete('/api/banned/:userId', (req, res) => {
      try {
        const { userId } = req.params;

        if (!userId) {
          return res.status(400).send('userId is required');
        }

        const wasUnbanned = this.bot.spamFilter.unbanUser(userId);

        if (wasUnbanned) {
          // Broadcast update to all connected clients
          this.broadcast({
            type: 'bannedUpdated',
            data: { action: 'unbanned', userId }
          });

          res.json({ success: true, message: 'User unbanned successfully' });
        } else {
          res.status(404).send('User not found in banned list');
        }
      } catch (error) {
        console.error('Error unbanning user:', error);
        res.status(500).send('Internal server error');
      }
    });

    // API endpoint to get blacklisted users
    this.app.get('/api/blacklist', (req, res) => {
      res.json(this.bot.spamFilter.getBlacklist());
    });

    // API endpoint to add user to blacklist
    this.app.post('/api/blacklist', async (req, res) => {
      try {
        const { userId, username, reason, blockedBy } = req.body;

        if (!userId || !reason) {
          return res.status(400).send('userId and reason are required');
        }

        await this.bot.spamFilter.addToBlacklist(userId, username || `User ${userId}`, reason, blockedBy || 'Dashboard Admin');

        // Broadcast update to all connected clients
        this.broadcast({
          type: 'blacklistUpdated',
          data: { action: 'added', userId, username, reason }
        });

        res.json({ success: true, message: 'User blacklisted successfully' });
      } catch (error) {
        console.error('Error adding to blacklist:', error);
        res.status(500).send('Internal server error');
      }
    });

    // API endpoint to remove user from blacklist
    this.app.delete('/api/blacklist/:userId', async (req, res) => {
      try {
        const { userId } = req.params;

        if (!userId) {
          return res.status(400).send('userId is required');
        }

        await this.bot.spamFilter.removeFromBlacklist(userId);

        // Broadcast update to all connected clients
        this.broadcast({
          type: 'blacklistUpdated',
          data: { action: 'removed', userId }
        });

        res.json({ success: true, message: 'User unblacklisted successfully' });
      } catch (error) {
        console.error('Error removing from blacklist:', error);
        res.status(500).send('Internal server error');
      }
    });

    // API endpoint to end a conversation
    this.app.post('/api/conversations/:threadId/end', async (req, res) => {
      try {
        const { threadId } = req.params;

        if (!threadId) {
          return res.status(400).send('threadId is required');
        }

        // Trigger the bot to end the conversation
        await this.bot.endConversationFromDashboard(threadId);

        res.json({ success: true, message: 'Conversation ended successfully' });
      } catch (error) {
        console.error('Error ending conversation:', error);
        res.status(500).send(error.message || 'Internal server error');
      }
    });

    // API endpoint to list transcripts
    this.app.get('/api/transcripts', (req, res) => {
      try {
        const limit = parseInt(req.query.limit) || 20;
        const offset = parseInt(req.query.offset) || 0;
        const query = req.query.search;

        let result;
        if (query) {
          const transcripts = this.bot.conversationManager.searchTranscripts(query, limit);
          result = {
            transcripts,
            total: transcripts.length,
            limit,
            offset: 0,
            hasMore: false
          };
        } else {
          result = this.bot.conversationManager.listTranscripts(limit, offset);
        }

        res.json(result);
      } catch (error) {
        console.error('Error listing transcripts:', error);
        res.status(500).send('Internal server error');
      }
    });

    // API endpoint to download all transcripts as a zip file
    // IMPORTANT: This must be defined BEFORE the :threadId routes to avoid matching "download-all" as a threadId
    this.app.get('/api/transcripts/download-all', (req, res) => {
      try {
        // Get all transcripts with a very large limit
        const result = this.bot.conversationManager.listTranscripts(10000, 0);
        const transcripts = result.transcripts;

        if (transcripts.length === 0) {
          return res.status(404).send('No transcripts found');
        }

        // Set response headers for zip download
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="transcripts-${Date.now()}.zip"`);

        // Create archiver instance
        const archive = archiver('zip', {
          zlib: { level: 9 } // Maximum compression
        });

        // Handle archiver errors
        archive.on('error', (err) => {
          console.error('Error creating zip archive:', err);
          res.status(500).send('Error creating zip file');
        });

        // Pipe archive to response
        archive.pipe(res);

        // Add each transcript as HTML file to the zip
        for (const transcriptSummary of transcripts) {
          // Load the full transcript data (including messages)
          const fullTranscript = this.bot.conversationManager.getTranscript(transcriptSummary.threadId);

          if (!fullTranscript || !fullTranscript.messages) {
            continue; // Skip if transcript can't be loaded
          }

          const conversationObj = {
            threadId: fullTranscript.threadId,
            originalPosterUsername: fullTranscript.originalPosterUsername,
            createdAt: fullTranscript.createdAt,
            lastActivity: fullTranscript.endedAt || Date.now(),
            messages: fullTranscript.messages,
            feedback: fullTranscript.feedback || null
          };

          const html = this.bot.conversationManager.generateHTMLTranscript(conversationObj);

          if (html) {
            // Add HTML file to zip with sanitized filename
            const filename = `transcript-${fullTranscript.threadId}.html`;
            archive.append(html, { name: filename });
          }
        }

        // Finalize the archive
        archive.finalize();

        console.log(`📦 Generated zip file with ${transcripts.length} transcripts`);
      } catch (error) {
        console.error('Error downloading all transcripts:', error);
        res.status(500).send('Internal server error');
      }
    });

    // API endpoint to get transcript stats
    this.app.get('/api/transcripts/stats', (req, res) => {
      try {
        const stats = this.bot.conversationManager.getTranscriptStats();
        res.json(stats);
      } catch (error) {
        console.error('Error getting transcript stats:', error);
        res.status(500).send('Internal server error');
      }
    });

    // API endpoint to download transcript as HTML
    this.app.get('/api/transcripts/:threadId/download', (req, res) => {
      try {
        const { threadId } = req.params;

        if (!threadId) {
          return res.status(400).send('threadId is required');
        }

        const transcript = this.bot.conversationManager.getTranscript(threadId);

        if (!transcript) {
          return res.status(404).send('Transcript not found');
        }

        // Generate HTML using existing generateHTMLTranscript method
        // We need to reconstruct a conversation object for the method
        const conversationObj = {
          threadId: transcript.threadId,
          originalPosterUsername: transcript.originalPosterUsername,
          createdAt: transcript.createdAt,
          lastActivity: transcript.endedAt || Date.now(),
          messages: transcript.messages,
          feedback: transcript.feedback || null
        };

        const html = this.bot.conversationManager.generateHTMLTranscript(conversationObj);

        if (!html) {
          return res.status(500).send('Error generating HTML transcript');
        }

        res.setHeader('Content-Type', 'text/html');
        res.setHeader('Content-Disposition', `attachment; filename="transcript-${threadId}.html"`);
        res.send(html);
      } catch (error) {
        console.error('Error downloading transcript:', error);
        res.status(500).send('Internal server error');
      }
    });

    // API endpoint to get a specific transcript
    this.app.get('/api/transcripts/:threadId', (req, res) => {
      try {
        const { threadId } = req.params;

        if (!threadId) {
          return res.status(400).send('threadId is required');
        }

        const transcript = this.bot.conversationManager.getTranscript(threadId);

        if (!transcript) {
          return res.status(404).send('Transcript not found');
        }

        res.json(transcript);
      } catch (error) {
        console.error('Error getting transcript:', error);
        res.status(500).send('Internal server error');
      }
    });

    // API endpoint to delete a transcript
    this.app.delete('/api/transcripts/:threadId', (req, res) => {
      try {
        const { threadId } = req.params;

        if (!threadId) {
          return res.status(400).send('threadId is required');
        }

        const success = this.bot.conversationManager.deleteTranscript(threadId);

        if (!success) {
          return res.status(404).send('Transcript not found');
        }

        res.json({ success: true, message: 'Transcript deleted successfully' });
      } catch (error) {
        console.error('Error deleting transcript:', error);
        res.status(500).send('Internal server error');
      }
    });

    // ===== DOCUMENTATION MANAGEMENT ENDPOINTS =====

    // Configure multer for file uploads
    const upload = multer({
      storage: multer.memoryStorage(),
      fileFilter: (req, file, cb) => {
        // Only allow markdown and text files
        if (file.mimetype === 'text/markdown' ||
            file.mimetype === 'text/plain' ||
            file.originalname.endsWith('.md') ||
            file.originalname.endsWith('.txt')) {
          cb(null, true);
        } else {
          cb(new Error('Only .md and .txt files are allowed'));
        }
      },
      limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
      }
    });

    // API endpoint to list all documentation files
    this.app.get('/api/docs', (req, res) => {
      try {
        const docsPath = path.join(process.cwd(), 'docs');
        const structure = this.getDocsStructure(docsPath);
        res.json(structure);
      } catch (error) {
        console.error('Error listing docs:', error);
        res.status(500).send('Internal server error');
      }
    });

    // API endpoint to get documentation stats
    this.app.get('/api/docs/stats', (req, res) => {
      try {
        const stats = docsManager.getStats();
        res.json(stats);
      } catch (error) {
        console.error('Error getting docs stats:', error);
        res.status(500).send('Internal server error');
      }
    });

    // API endpoint to get a specific doc file
    this.app.get('/api/docs/file', (req, res) => {
      try {
        const filePath = req.query.path;

        if (!filePath) {
          return res.status(400).send('path parameter is required');
        }

        // Security: Prevent directory traversal with normalized paths
        const docsPath = path.resolve(process.cwd(), 'docs');
        const fullPath = path.resolve(docsPath, filePath);

        // Check that resolved path is still within docs directory
        if (!fullPath.startsWith(docsPath + path.sep) && fullPath !== docsPath) {
          return res.status(403).send('Access denied');
        }

        if (!fs.existsSync(fullPath)) {
          return res.status(404).send('File not found');
        }

        const content = fs.readFileSync(fullPath, 'utf8');
        const stats = fs.statSync(fullPath);

        res.json({
          path: filePath,
          content,
          size: stats.size,
          modified: stats.mtime,
          created: stats.birthtime
        });
      } catch (error) {
        console.error('Error reading doc file:', error);
        res.status(500).send('Internal server error');
      }
    });

    // API endpoint to create or upload a new doc file
    this.app.post('/api/docs/file', upload.single('file'), (req, res) => {
      try {
        let filePath, content;

        if (req.file) {
          // File upload
          filePath = req.body.path || req.file.originalname;
          content = req.file.buffer.toString('utf8');
        } else {
          // JSON body with path and content
          filePath = req.body.path;
          content = req.body.content;
        }

        if (!filePath || !content) {
          return res.status(400).send('path and content are required');
        }

        // Security: Prevent directory traversal with normalized paths
        const docsPath = path.resolve(process.cwd(), 'docs');
        const fullPath = path.resolve(docsPath, filePath);

        // Check that resolved path is still within docs directory
        if (!fullPath.startsWith(docsPath + path.sep) && fullPath !== docsPath) {
          return res.status(403).send('Access denied');
        }

        // Create directory if it doesn't exist
        const dir = path.dirname(fullPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }

        // Check if file already exists
        if (fs.existsSync(fullPath)) {
          return res.status(409).send('File already exists. Use PUT to update.');
        }

        // Write file
        fs.writeFileSync(fullPath, content, 'utf8');

        // Reload docs
        docsManager.reloadDocs();

        res.json({
          success: true,
          message: 'File created successfully',
          path: filePath
        });
      } catch (error) {
        console.error('Error creating doc file:', error);
        res.status(500).send('Internal server error');
      }
    });

    // API endpoint to update an existing doc file
    this.app.put('/api/docs/file', (req, res) => {
      try {
        const { path: filePath, content } = req.body;

        if (!filePath || content === undefined) {
          return res.status(400).send('path and content are required');
        }

        // Security: Prevent directory traversal with normalized paths
        const docsPath = path.resolve(process.cwd(), 'docs');
        const fullPath = path.resolve(docsPath, filePath);

        // Check that resolved path is still within docs directory
        if (!fullPath.startsWith(docsPath + path.sep) && fullPath !== docsPath) {
          return res.status(403).send('Access denied');
        }

        if (!fs.existsSync(fullPath)) {
          return res.status(404).send('File not found');
        }

        // Write file
        fs.writeFileSync(fullPath, content, 'utf8');

        // Reload docs
        docsManager.reloadDocs();

        res.json({
          success: true,
          message: 'File updated successfully',
          path: filePath
        });
      } catch (error) {
        console.error('Error updating doc file:', error);
        res.status(500).send('Internal server error');
      }
    });

    // API endpoint to delete a doc file
    this.app.delete('/api/docs/file', (req, res) => {
      try {
        const filePath = req.query.path;

        if (!filePath) {
          return res.status(400).send('path parameter is required');
        }

        // Security: Prevent directory traversal with normalized paths
        const docsPath = path.resolve(process.cwd(), 'docs');
        const fullPath = path.resolve(docsPath, filePath);

        // Check that resolved path is still within docs directory
        if (!fullPath.startsWith(docsPath + path.sep) && fullPath !== docsPath) {
          return res.status(403).send('Access denied');
        }

        if (!fs.existsSync(fullPath)) {
          return res.status(404).send('File not found');
        }

        // Delete file
        fs.unlinkSync(fullPath);

        // Reload docs
        docsManager.reloadDocs();

        res.json({
          success: true,
          message: 'File deleted successfully',
          path: filePath
        });
      } catch (error) {
        console.error('Error deleting doc file:', error);
        res.status(500).send('Internal server error');
      }
    });

    // API endpoint to reload all docs
    this.app.post('/api/docs/reload', (req, res) => {
      try {
        docsManager.reloadDocs();
        const stats = docsManager.getStats();

        res.json({
          success: true,
          message: 'Documentation reloaded successfully',
          stats
        });
      } catch (error) {
        console.error('Error reloading docs:', error);
        res.status(500).send('Internal server error');
      }
    });

    // ===== CONFIGURATION MANAGEMENT ENDPOINTS =====

    // API endpoint to get configuration schema
    this.app.get('/api/config/schema', (req, res) => {
      try {
        const schema = this.configManager.getSchema();
        res.json(schema);
      } catch (error) {
        console.error('Error getting config schema:', error);
        res.status(500).send('Internal server error');
      }
    });

    // API endpoint to get current configuration
    this.app.get('/api/config', (req, res) => {
      try {
        const config = this.configManager.readConfig();

        if (config.error) {
          return res.status(404).json(config);
        }

        // Mask sensitive values
        for (const [key, data] of Object.entries(config)) {
          if (data.sensitive && data.value) {
            config[key].value = '********';
            config[key].masked = true;
          }
        }

        res.json(config);
      } catch (error) {
        console.error('Error getting config:', error);
        res.status(500).send('Internal server error');
      }
    });

    // API endpoint to get configuration by category
    this.app.get('/api/config/categorized', (req, res) => {
      try {
        const config = this.configManager.getConfigByCategory();

        if (config.error) {
          return res.status(404).json(config);
        }

        // Mask sensitive values
        for (const category of Object.values(config)) {
          for (const [key, data] of Object.entries(category)) {
            if (data.sensitive && data.value) {
              category[key].value = '********';
              category[key].masked = true;
            }
          }
        }

        res.json(config);
      } catch (error) {
        console.error('Error getting categorized config:', error);
        res.status(500).send('Internal server error');
      }
    });

    // API endpoint to update configuration
    this.app.put('/api/config', (req, res) => {
      try {
        const updates = req.body;

        if (!updates || typeof updates !== 'object') {
          return res.status(400).send('Invalid request body');
        }

        const result = this.configManager.updateConfig(updates);

        if (!result.success) {
          return res.status(400).json(result);
        }

        // Note: Configuration changes require bot restart to take effect
        res.json({
          ...result,
          warning: 'Configuration updated. Bot restart required for changes to take effect.'
        });
      } catch (error) {
        console.error('Error updating config:', error);
        res.status(500).send('Internal server error');
      }
    });

    // API endpoint to validate configuration
    this.app.post('/api/config/validate', (req, res) => {
      try {
        const validation = this.configManager.validateEnvFile();
        res.json(validation);
      } catch (error) {
        console.error('Error validating config:', error);
        res.status(500).send('Internal server error');
      }
    });

    // API endpoint to get system prompt
    this.app.get('/api/config/system-prompt', (req, res) => {
      try {
        // Get the current system prompt from the AI service
        if (!this.bot.aiService) {
          return res.status(500).send('AI service not initialized');
        }

        const systemPrompt = this.bot.aiService.systemPrompt;
        res.json({ systemPrompt });
      } catch (error) {
        console.error('Error getting system prompt:', error);
        res.status(500).send('Internal server error');
      }
    });

    // API endpoint to update system prompt
    this.app.put('/api/config/system-prompt', (req, res) => {
      try {
        const { systemPrompt } = req.body;

        if (!systemPrompt || typeof systemPrompt !== 'string') {
          return res.status(400).send('systemPrompt is required and must be a string');
        }

        if (systemPrompt.trim().length === 0) {
          return res.status(400).send('systemPrompt cannot be empty');
        }

        // Update the system prompt in the AI service
        if (!this.bot.aiService) {
          return res.status(500).send('AI service not initialized');
        }

        // Save to persistent config
        const saved = configPersistence.setSystemPrompt(systemPrompt);

        if (!saved) {
          return res.status(500).send('Failed to save system prompt to config file');
        }

        // Update in-memory prompt immediately
        this.bot.aiService.systemPrompt = systemPrompt;

        res.json({
          success: true,
          message: 'System prompt updated and saved to config.json'
        });
      } catch (error) {
        console.error('Error updating system prompt:', error);
        res.status(500).send('Internal server error');
      }
    });

    // API endpoint to reset system prompt to default
    this.app.post('/api/config/system-prompt/reset', (req, res) => {
      try {
        if (!this.bot.aiService) {
          return res.status(500).send('AI service not initialized');
        }

        // Reset to default in config
        configPersistence.resetSystemPrompt();

        // Reload default prompt
        const defaultPrompt = this.bot.aiService.buildDefaultSystemPrompt();
        this.bot.aiService.systemPrompt = defaultPrompt;

        res.json({
          success: true,
          message: 'System prompt reset to default',
          systemPrompt: defaultPrompt
        });
      } catch (error) {
        console.error('Error resetting system prompt:', error);
        res.status(500).send('Internal server error');
      }
    });
  }

  setupWebSocket() {
    this.wss.on('connection', (ws) => {
      console.log('Dashboard client connected');
      this.clients.add(ws);

      // Send initial data
      ws.send(JSON.stringify({
        type: 'init',
        data: {
          guildId: this.bot.config.guildId,
          conversations: this.getConversationsData(),
          errors: this.errors,
          stats: this.bot.conversationManager.getStats(),
          feedback: this.feedbackData,
          spam: this.bot.spamFilter.getSpamEvents(),
          banned: this.bot.spamFilter.getBannedUsers(),
          blacklist: this.bot.spamFilter.getBlacklist()
        }
      }));

      ws.on('close', () => {
        console.log('Dashboard client disconnected');
        this.clients.delete(ws);
      });

      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        this.clients.delete(ws);
      });
    });
  }

  setupBotEventListeners() {
    // Listen for new messages
    this.bot.on('messageProcessed', (data) => {
      this.broadcast({
        type: 'messageProcessed',
        data
      });
    });

    // Listen for new conversations
    this.bot.on('conversationCreated', (data) => {
      this.broadcast({
        type: 'conversationCreated',
        data
      });
    });

    // Listen for errors
    this.bot.on('error', (error) => {
      this.addError(error);
      this.broadcast({
        type: 'error',
        data: error
      });
    });

    // Listen for feedback
    this.bot.on('feedbackReceived', (feedback) => {
      this.feedbackData.push(feedback);
      this.saveFeedback();
      this.broadcast({
        type: 'feedbackReceived',
        data: feedback
      });
    });

    // Listen for spam detection
    this.bot.on('spamDetected', (spam) => {
      this.broadcast({
        type: 'spamDetected',
        data: spam
      });
    });

    // Listen for conversation ended
    this.bot.on('conversationEnded', (data) => {
      this.broadcast({
        type: 'conversationEnded',
        data
      });
    });
  }

  getConversationsData() {
    // Create snapshot to avoid iterating over Map being modified concurrently
    const snapshot = Array.from(this.bot.conversationManager.conversations.entries());

    const conversations = [];
    for (const [threadId, conversation] of snapshot) {
      // Ensure threadId is a string (defensive coding)
      const threadIdString = String(threadId);

      conversations.push({
        threadId: threadIdString,
        messageCount: conversation.messages.length,
        createdAt: conversation.createdAt,
        lastActivity: conversation.lastActivity,
        originalPoster: conversation.originalPosterUsername || 'Unknown',
        originalPosterId: conversation.originalPosterId,
        ended: conversation.ended || false,
        messages: conversation.messages.slice(-10) // Last 10 messages
      });
    }
    return conversations.sort((a, b) => b.lastActivity - a.lastActivity);
  }

  addError(error) {
    this.errors.push({
      message: error.message || String(error),
      stack: error.stack || '',
      timestamp: Date.now()
    });
    if (this.errors.length > this.maxErrors) {
      this.errors.shift();
    }
  }

  loadFeedback() {
    try {
      const dataDir = dirname(this.feedbackFile);
      if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
      }

      if (fs.existsSync(this.feedbackFile)) {
        const data = fs.readFileSync(this.feedbackFile, 'utf8');
        this.feedbackData = JSON.parse(data);
        console.log(`Loaded ${this.feedbackData.length} feedback entries from file`);
      }
    } catch (error) {
      console.error('Error loading feedback:', error);
    }
  }

  saveFeedback() {
    try {
      fs.writeFileSync(this.feedbackFile, JSON.stringify(this.feedbackData, null, 2));
    } catch (error) {
      console.error('Error saving feedback:', error);
    }
  }

  getDailyFeedback() {
    // Aggregate feedback by day for the last 10 days
    const now = Date.now();
    const oneDayMs = 24 * 60 * 60 * 1000;
    const dailyData = [];

    for (let i = 9; i >= 0; i--) {
      const dayStart = now - (i + 1) * oneDayMs;
      const dayEnd = now - i * oneDayMs;

      const dayFeedback = this.feedbackData.filter(fb =>
        fb.timestamp >= dayStart && fb.timestamp < dayEnd
      );

      const positive = dayFeedback.filter(fb => fb.type === 'positive').length;
      const negative = dayFeedback.filter(fb => fb.type === 'negative').length;
      const overall = positive - negative;

      const date = new Date(dayStart);
      dailyData.push({
        date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        positive,
        negative,
        overall
      });
    }

    return dailyData;
  }

  getDocsStructure(dir, basePath = '') {
    const items = [];

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;

        if (entry.isDirectory()) {
          // Recursively get subdirectory structure
          const children = this.getDocsStructure(fullPath, relativePath);
          items.push({
            name: entry.name,
            path: relativePath,
            type: 'directory',
            children
          });
        } else if (entry.name.endsWith('.md') || entry.name.endsWith('.txt')) {
          // File entry
          const stats = fs.statSync(fullPath);
          items.push({
            name: entry.name,
            path: relativePath,
            type: 'file',
            size: stats.size,
            modified: stats.mtime
          });
        }
      }
    } catch (error) {
      console.error(`Error reading directory ${dir}:`, error);
    }

    return items;
  }

  broadcast(message) {
    const data = JSON.stringify(message);
    this.clients.forEach((client) => {
      if (client.readyState === 1) { // WebSocket.OPEN
        client.send(data);
      }
    });
  }

  start() {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console.log(`📊 Dashboard server running at http://localhost:${this.port}`);

        if (this.dashboardPassword) {
          console.log('🔐 Dashboard authentication enabled');
          console.log(`   Access at: http://localhost:${this.port}/login`);

          // Cleanup expired sessions every hour
          this.sessionCleanupInterval = setInterval(() => {
            this.cleanupExpiredSessions();
          }, 60 * 60 * 1000);
        } else {
          console.log('⚠️  Dashboard authentication DISABLED - publicly accessible!');
          console.log(`   Access at: http://localhost:${this.port}/dashboard`);
        }

        resolve();
      });
    });
  }

  // Authorization helper methods
  async hasServerAccess(userId, guildId) {
    const MASTER_USER_ID = '979837953339719721';

    // Master user has access to all servers
    if (userId === MASTER_USER_ID) {
      return true;
    }

    const user = this.database.getUser(userId);
    if (!user) {
      return false;
    }

    // Check if server is whitelisted
    if (!this.database.isServerWhitelisted(guildId)) {
      return false;
    }

    // Get bot's guilds
    const botGuild = this.bot.client.guilds.cache.get(guildId);
    if (!botGuild) {
      return false;
    }

    // Get user's guilds and check admin permission
    try {
      const userGuilds = await this.oauth.getUserGuilds(user.access_token);
      const guild = userGuilds.find(g => g.id === guildId);

      if (!guild) {
        return false;
      }

      return this.oauth.userHasAdminPermission(guild);
    } catch (error) {
      console.error('Error checking server access:', error);
      return false;
    }
  }

  stop() {
    return new Promise((resolve) => {
      // Clear cleanup interval
      if (this.sessionCleanupInterval) {
        clearInterval(this.sessionCleanupInterval);
      }

      this.clients.forEach(client => client.close());
      this.wss.close();
      this.server.close(() => {
        console.log('Dashboard server stopped');
        resolve();
      });
    });
  }
}
