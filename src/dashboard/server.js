import express from 'express';
import { WebSocketServer } from 'ws';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import http from 'http';

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

    this.setupRoutes();
    this.setupWebSocket();
    this.setupBotEventListeners();
  }

  setupRoutes() {
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
      res.json({
        activeConversations: stats.activeConversations,
        totalMessages: stats.totalMessages,
        errors: this.errors.length,
        feedback: this.feedbackData.length
      });
    });

    // API endpoint to get feedback data
    this.app.get('/api/feedback', (req, res) => {
      res.json(this.feedbackData);
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
          conversations: this.getConversationsData(),
          errors: this.errors,
          stats: this.bot.conversationManager.getStats(),
          feedback: this.feedbackData
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
      if (this.feedbackData.length > this.maxErrors) {
        this.feedbackData.shift();
      }
      this.broadcast({
        type: 'feedbackReceived',
        data: feedback
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
