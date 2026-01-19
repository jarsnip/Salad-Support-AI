import express from 'express';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import docsManager from '../utils/docsManager.js';
import ConfigManager from '../utils/configManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export class DashboardServer {
  constructor(bot, port = 3000) {
    this.bot = bot;
    this.port = port;
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
    // Middleware for JSON parsing
    this.app.use(express.json());

    // Serve static files from public directory
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
    this.app.post('/api/blacklist', (req, res) => {
      try {
        const { userId, username, reason, blockedBy } = req.body;

        if (!userId || !reason) {
          return res.status(400).send('userId and reason are required');
        }

        this.bot.spamFilter.addToBlacklist(userId, username || `User ${userId}`, reason, blockedBy || 'Dashboard Admin');

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
    this.app.delete('/api/blacklist/:userId', (req, res) => {
      try {
        const { userId } = req.params;

        if (!userId) {
          return res.status(400).send('userId is required');
        }

        this.bot.spamFilter.removeFromBlacklist(userId);

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

        // Security: Prevent directory traversal
        const docsPath = path.join(process.cwd(), 'docs');
        const fullPath = path.join(docsPath, filePath);

        if (!fullPath.startsWith(docsPath)) {
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

        // Security: Prevent directory traversal
        const docsPath = path.join(process.cwd(), 'docs');
        const fullPath = path.join(docsPath, filePath);

        if (!fullPath.startsWith(docsPath)) {
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

        // Security: Prevent directory traversal
        const docsPath = path.join(process.cwd(), 'docs');
        const fullPath = path.join(docsPath, filePath);

        if (!fullPath.startsWith(docsPath)) {
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

        // Security: Prevent directory traversal
        const docsPath = path.join(process.cwd(), 'docs');
        const fullPath = path.join(docsPath, filePath);

        if (!fullPath.startsWith(docsPath)) {
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

        // Update the system prompt in the AI service
        if (!this.bot.aiService) {
          return res.status(500).send('AI service not initialized');
        }

        this.bot.aiService.systemPrompt = systemPrompt;

        res.json({
          success: true,
          message: 'System prompt updated successfully',
          warning: 'This change is temporary. To persist, modify the buildSystemPrompt() method in aiService.js'
        });
      } catch (error) {
        console.error('Error updating system prompt:', error);
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
    const conversations = [];
    for (const [threadId, conversation] of this.bot.conversationManager.conversations.entries()) {
      conversations.push({
        threadId,
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
        resolve();
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      this.clients.forEach(client => client.close());
      this.wss.close();
      this.server.close(() => {
        console.log('Dashboard server stopped');
        resolve();
      });
    });
  }
}
