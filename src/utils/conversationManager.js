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
        originalPosterId: null,
        originalPosterUsername: null
      });
    }
    return this.conversations.get(threadId);
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
}

export default ConversationManager;
