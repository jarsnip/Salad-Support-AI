import TranscriptManager from './transcriptManager.js';

class ConversationManager {
  constructor(maxHistory = 10) {
    this.conversations = new Map();
    this.maxHistory = maxHistory;
    this.transcriptManager = new TranscriptManager();
  }

  getConversation(threadId) {
    if (!this.conversations.has(threadId)) {
      this.conversations.set(threadId, {
        threadId,
        messages: [],
        createdAt: Date.now(),
        lastActivity: Date.now(),
        lastBotMessageTime: null,
        originalPosterId: null,
        originalPosterUsername: null,
        ended: false,
        deleteScheduled: null,
        feedback: null // Store conversation feedback
      });
    }
    return this.conversations.get(threadId);
  }

  endConversation(threadId) {
    const conversation = this.getConversation(threadId);

    // Save transcript before marking as ended
    if (!conversation.ended && conversation.messages.length > 0) {
      this.transcriptManager.saveTranscript(conversation);
    }

    conversation.ended = true;
    conversation.lastActivity = Date.now();
  }

  setOriginalPoster(threadId, userId, username) {
    const conversation = this.getConversation(threadId);
    if (!conversation.originalPosterId) {
      conversation.originalPosterId = userId;
      conversation.originalPosterUsername = username;
    }
  }

  getOriginalPosterId(threadId) {
    const conversation = this.getConversation(threadId);
    return conversation.originalPosterId;
  }

  isOriginalPoster(threadId, userId) {
    const conversation = this.getConversation(threadId);
    return conversation.originalPosterId === userId;
  }

  setFeedback(threadId, feedbackData) {
    const conversation = this.getConversation(threadId);
    conversation.feedback = {
      type: feedbackData.type,
      userId: feedbackData.userId,
      username: feedbackData.username,
      timestamp: feedbackData.timestamp
    };
  }

  addMessage(threadId, role, content, userId = null) {
    const conversation = this.getConversation(threadId);

    conversation.messages.push({
      role,
      content,
      userId,
      timestamp: Date.now()
    });

    conversation.lastActivity = Date.now();

    // Track when bot sends a message (for auto-end feature)
    if (role === 'assistant') {
      conversation.lastBotMessageTime = Date.now();
    }

    if (conversation.messages.length > this.maxHistory * 2) {
      const systemMessages = conversation.messages.filter(m => m.role === 'system');
      const nonSystemMessages = conversation.messages.filter(m => m.role !== 'system');

      const keepMessages = nonSystemMessages.slice(-this.maxHistory * 2);
      conversation.messages = [...systemMessages, ...keepMessages];
    }
  }

  getMessagesForAPI(threadId) {
    const conversation = this.getConversation(threadId);

    return conversation.messages.map(msg => ({
      role: msg.role === 'system' ? 'user' : msg.role,
      content: msg.content
    }));
  }

  getFormattedHistory(threadId) {
    const conversation = this.getConversation(threadId);
    if (conversation.messages.length === 0) {
      return 'No previous messages in this conversation.';
    }

    let history = 'CONVERSATION HISTORY:\n\n';

    const recentMessages = conversation.messages.slice(-this.maxHistory);

    for (const msg of recentMessages) {
      const timestamp = new Date(msg.timestamp).toLocaleTimeString();
      const roleLabel = msg.role === 'user' ? 'User' : 'Assistant';
      history += `[${timestamp}] ${roleLabel}: ${msg.content}\n\n`;
    }

    return history;
  }

  clearConversation(threadId) {
    this.conversations.delete(threadId);
  }

  cleanupOldConversations(maxAge = 24 * 60 * 60 * 1000) {
    const now = Date.now();
    const toDelete = [];

    for (const [threadId, conversation] of this.conversations) {
      if (now - conversation.lastActivity > maxAge) {
        toDelete.push(threadId);
      }
    }

    for (const threadId of toDelete) {
      this.conversations.delete(threadId);
    }

    if (toDelete.length > 0) {
      console.log(`Cleaned up ${toDelete.length} old conversations`);
    }
  }

  getStats() {
    return {
      activeConversations: this.conversations.size,
      totalMessages: Array.from(this.conversations.values())
        .reduce((sum, conv) => sum + conv.messages.length, 0)
    };
  }

  generateHTMLTranscript(threadId) {
    const conversation = this.getConversation(threadId);
    if (!conversation || conversation.messages.length === 0) {
      return null;
    }

    const startTime = new Date(conversation.createdAt).toLocaleString();
    const endTime = new Date(conversation.lastActivity).toLocaleString();
    const hasFeedback = conversation.feedback && conversation.feedback.type;
    const feedbackEmoji = hasFeedback ? (conversation.feedback.type === 'positive' ? '👍' : '👎') : '';
    const feedbackText = hasFeedback ? (conversation.feedback.type === 'positive' ? 'Positive' : 'Negative') : 'No feedback';

    let html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Support Conversation Transcript</title>
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700&display=swap" rel="stylesheet">
    <style>
        :root {
            --bg-color: #f5f5f5;
            --text-color: #333;
            --message-bg: white;
            --message-bg-assistant: #f8f9ff;
            --border-color: #ddd;
            --header-gradient-start: #667eea;
            --header-gradient-end: #764ba2;
            --accent-color: #102c80;
            --accent-hover: #1a3ba0;
            --footer-text: #999;
            --positive-color: #102c80;
            --negative-color: #ff6b6b;
        }

        [data-theme="dark"] {
            --bg-color: #1a1a2e;
            --text-color: #e0e0e0;
            --message-bg: #2d2d44;
            --message-bg-assistant: #252538;
            --border-color: #3a3a52;
            --header-gradient-start: #1a1a2e;
            --header-gradient-end: #16213e;
            --accent-color: #102c80;
            --accent-hover: #1a3ba0;
            --footer-text: #888;
            --positive-color: #102c80;
            --negative-color: #ff6b6b;
        }

        * {
            transition: background-color 0.3s ease, color 0.3s ease, border-color 0.3s ease;
        }

        body {
            font-family: 'Manrope', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background: var(--bg-color);
            color: var(--text-color);
        }

        .theme-toggle {
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--accent-color);
            color: white;
            border: none;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            font-size: 1.5em;
            cursor: pointer;
            box-shadow: 0 4px 12px rgba(144, 255, 117, 0.3);
            z-index: 1000;
        }

        .theme-toggle:hover {
            background: var(--accent-hover);
            transform: scale(1.1);
        }

        .header {
            background: linear-gradient(135deg, var(--header-gradient-start) 0%, var(--header-gradient-end) 100%);
            color: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
            position: relative;
        }

        .header h1 {
            margin: 0 0 10px 0;
            font-size: 1.5em;
        }

        .header .info {
            font-size: 0.9em;
            opacity: 0.9;
        }

        .feedback-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 12px;
            font-size: 0.85em;
            font-weight: 600;
            margin-top: 8px;
        }

        .feedback-badge.positive {
            background: var(--positive-color);
            color: #1a1a2e;
        }

        .feedback-badge.negative {
            background: var(--negative-color);
            color: white;
        }

        .feedback-badge.none {
            background: var(--border-color);
            color: var(--text-color);
        }

        .message {
            background: var(--message-bg);
            padding: 15px;
            margin-bottom: 10px;
            border-radius: 8px;
            border-left: 4px solid var(--border-color);
        }

        .message.user {
            border-left-color: var(--accent-color);
        }

        .message.assistant {
            border-left-color: #667eea;
            background: var(--message-bg-assistant);
        }

        .message-header {
            display: flex;
            justify-content: space-between;
            margin-bottom: 8px;
            font-size: 0.85em;
        }

        .role {
            font-weight: bold;
            text-transform: uppercase;
        }

        .role.user {
            color: var(--accent-color);
        }

        .role.assistant {
            color: #667eea;
        }

        .timestamp {
            color: var(--footer-text);
        }

        .content {
            line-height: 1.6;
            white-space: pre-wrap;
        }

        .footer {
            text-align: center;
            color: var(--footer-text);
            font-size: 0.85em;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid var(--border-color);
        }
    </style>
</head>
<body>
    <button class="theme-toggle" onclick="toggleTheme()" title="Toggle dark mode">🌓</button>

    <div class="header">
        <h1>🥗 Salad Support AI - Conversation Transcript</h1>
        <div class="info">
            Started: ${startTime}<br>
            Ended: ${endTime}<br>
            Thread ID: ${threadId}<br>
            <span class="feedback-badge ${hasFeedback ? conversation.feedback.type : 'none'}">${feedbackEmoji} ${feedbackText}</span>
        </div>
    </div>
    <div class="messages">
`;

    for (const msg of conversation.messages) {
      if (msg.role === 'system') continue; // Skip system messages

      const timestamp = new Date(msg.timestamp).toLocaleString();
      const roleClass = msg.role;
      const roleLabel = msg.role === 'user' ? 'You' : 'Support AI';

      html += `
        <div class="message ${roleClass}">
            <div class="message-header">
                <span class="role ${roleClass}">${roleLabel}</span>
                <span class="timestamp">${timestamp}</span>
            </div>
            <div class="content">${this.escapeHtml(msg.content)}</div>
        </div>
`;
    }

    html += `
    </div>
    <div class="footer">
        This conversation has been archived. If you need further assistance, please create a new support thread.
    </div>

    <script>
        // Load theme preference
        function loadTheme() {
            const savedTheme = localStorage.getItem('transcript-theme') || 'light';
            document.documentElement.setAttribute('data-theme', savedTheme);
        }

        // Toggle theme
        function toggleTheme() {
            const currentTheme = document.documentElement.getAttribute('data-theme');
            const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
            document.documentElement.setAttribute('data-theme', newTheme);
            localStorage.setItem('transcript-theme', newTheme);
        }

        // Initialize theme on load
        loadTheme();
    </script>
</body>
</html>
`;

    return html;
  }

  escapeHtml(text) {
    const map = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#039;'
    };
    return text.replace(/[&<>"']/g, m => map[m]);
  }

  scheduleThreadDeletion(threadId, timeout) {
    const conversation = this.getConversation(threadId);
    if (conversation.deleteScheduled) {
      clearTimeout(conversation.deleteScheduled);
    }
    conversation.deleteScheduled = setTimeout(() => {
      this.clearConversation(threadId);
      console.log(`🗑️  Thread ${threadId} deleted after timeout`);
    }, timeout);
  }

  cancelThreadDeletion(threadId) {
    const conversation = this.conversations.get(threadId);
    if (conversation && conversation.deleteScheduled) {
      clearTimeout(conversation.deleteScheduled);
      conversation.deleteScheduled = null;
    }
  }

  getInactiveConversations(timeout) {
    const now = Date.now();
    const inactive = [];

    for (const [threadId, conversation] of this.conversations.entries()) {
      if (conversation.ended) continue;
      if (!conversation.lastBotMessageTime) continue;

      const timeSinceLastBot = now - conversation.lastBotMessageTime;
      if (timeSinceLastBot >= timeout) {
        inactive.push({ threadId, conversation });
      }
    }

    return inactive;
  }

  // Transcript Manager Accessors
  getTranscriptManager() {
    return this.transcriptManager;
  }

  getTranscript(threadId) {
    return this.transcriptManager.getTranscript(threadId);
  }

  listTranscripts(limit, offset) {
    return this.transcriptManager.listTranscripts(limit, offset);
  }

  searchTranscripts(query, limit) {
    return this.transcriptManager.searchTranscripts(query, limit);
  }

  deleteTranscript(threadId) {
    return this.transcriptManager.deleteTranscript(threadId);
  }

  getTranscriptStats() {
    return this.transcriptManager.getStats();
  }
}

export default ConversationManager;
