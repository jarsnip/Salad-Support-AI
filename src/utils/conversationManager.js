class ConversationManager {
  constructor(maxHistory = 10) {
    this.conversations = new Map();
    this.maxHistory = maxHistory;
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
        deleteScheduled: null
      });
    }
    return this.conversations.get(threadId);
  }

  endConversation(threadId) {
    const conversation = this.getConversation(threadId);
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

    let html = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Support Conversation Transcript</title>
    <style>
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            background: #f5f5f5;
            color: #333;
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 20px;
            border-radius: 8px;
            margin-bottom: 20px;
        }
        .header h1 {
            margin: 0 0 10px 0;
            font-size: 1.5em;
        }
        .header .info {
            font-size: 0.9em;
            opacity: 0.9;
        }
        .message {
            background: white;
            padding: 15px;
            margin-bottom: 10px;
            border-radius: 8px;
            border-left: 4px solid #ddd;
        }
        .message.user {
            border-left-color: #764ba2;
        }
        .message.assistant {
            border-left-color: #667eea;
            background: #f8f9ff;
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
            color: #764ba2;
        }
        .role.assistant {
            color: #667eea;
        }
        .timestamp {
            color: #999;
        }
        .content {
            line-height: 1.6;
            white-space: pre-wrap;
        }
        .footer {
            text-align: center;
            color: #999;
            font-size: 0.85em;
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #ddd;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🥗 Salad Support AI - Conversation Transcript</h1>
        <div class="info">
            Started: ${startTime}<br>
            Ended: ${endTime}<br>
            Thread ID: ${threadId}
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
}

export default ConversationManager;
