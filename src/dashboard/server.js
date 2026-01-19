import express from 'express';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';
import fs from 'fs';

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
