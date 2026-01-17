import { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } from 'discord.js';
import AIService from './services/aiService.js';
import ConversationManager from './utils/conversationManager.js';
import MessageQueue from './utils/messageQueue.js';
import docsManager from './utils/docsManager.js';

class SupportBot {
  constructor(config) {
    this.config = config;
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
      ]
    });

    this.aiService = new AIService(config.anthropicApiKey, config.aiModel);
    this.conversationManager = new ConversationManager(config.maxConversationHistory);

    this.messageQueue = new MessageQueue(
      this.processMessage.bind(this),
      3
    );

    this.setupEventHandlers();

    setInterval(() => {
      this.conversationManager.cleanupOldConversations();
    }, 60 * 60 * 1000);
  }

  setupEventHandlers() {
    this.client.once('ready', () => {
      console.log(`✓ Bot logged in as ${this.client.user.tag}`);
      console.log(`✓ Monitoring channel: ${this.config.supportChannelId}`);
      console.log(`✓ AI Model: ${this.config.aiModel}`);

      const stats = docsManager.getStats?.() || { docs: docsManager.getAllDocs().length };
      console.log(`✓ Loaded ${docsManager.getAllDocs().length} documentation files`);
      console.log('\n🤖 Support bot is ready!\n');
    });

    this.client.on('messageCreate', async (message) => {
      try {
        if (message.author.bot) return;

        if (message.content.trim().startsWith('>')) return;

        if (message.channelId === this.config.supportChannelId && !message.hasThread) {
          await this.handleSupportMessage(message);
        }
        else if (message.channel.isThread()) {
          await this.handleThreadMessage(message);
        }
      } catch (error) {
        console.error('Error handling message:', error);
      }
    });

    this.client.on('error', (error) => {
      console.error('Discord client error:', error);
    });
  }

  async handleSupportMessage(message) {
    try {
      console.log(`\n📩 New support message from ${message.author.tag}: "${message.content.substring(0, 50)}..."`);

      const thread = await message.startThread({
        name: `Support: ${message.author.username}`,
        autoArchiveDuration: 60,
        reason: 'Support request'
      });

      console.log(`📌 Created thread: ${thread.name} (ID: ${thread.id})`);

      await thread.send(`👋 Hi ${message.author}! I'm here to help with your support question. Let me look into that for you...`);

      this.messageQueue.add({
        threadId: thread.id,
        messageContent: message.content,
        userId: message.author.id,
        username: message.author.username
      });

    } catch (error) {
      console.error('Error handling support message:', error);
      try {
        await message.reply('Sorry, I encountered an error creating a support thread. Please try again.');
      } catch (replyError) {
        console.error('Error sending error reply:', replyError);
      }
    }
  }

  async handleThreadMessage(message) {
    try {
      const parentChannel = message.channel.parent;

      if (!parentChannel || parentChannel.id !== this.config.supportChannelId) {
        return;
      }

      console.log(`\n💬 Thread message from ${message.author.tag} in thread ${message.channel.id}`);

      const typingInterval = setInterval(() => {
        message.channel.sendTyping().catch(() => {});
      }, 5000);

      message.channel.sendTyping().catch(() => {});

      this.messageQueue.add({
        threadId: message.channel.id,
        messageContent: message.content,
        userId: message.author.id,
        username: message.author.username
      });

      setTimeout(() => clearInterval(typingInterval), 30000);

    } catch (error) {
      console.error('Error handling thread message:', error);
    }
  }

  async processMessage(item) {
    const { threadId, messageContent, userId, username } = item;

    try {
      const thread = await this.client.channels.fetch(threadId);

      if (!thread) {
        console.error(`Thread ${threadId} not found`);
        return;
      }

      this.conversationManager.addMessage(threadId, 'user', messageContent, userId);

      const conversationHistory = this.conversationManager.getFormattedHistory(threadId);

      const messages = this.conversationManager.getMessagesForAPI(threadId);

      console.log(`🤖 Generating AI response for thread ${threadId}...`);

      const response = await this.aiService.generateResponse(messages, conversationHistory);

      this.conversationManager.addMessage(threadId, 'assistant', response);

      const chunks = this.splitMessage(response);

      for (const chunk of chunks) {
        await thread.send(chunk);
      }

      console.log(`✓ Sent AI response to thread ${threadId}`);

    } catch (error) {
      console.error('Error processing message:', error);

      try {
        const thread = await this.client.channels.fetch(threadId);
        if (thread) {
          await thread.send('I apologize, but I encountered an error processing your message. Please try again or contact human support.');
        }
      } catch (sendError) {
        console.error('Error sending error message:', sendError);
      }
    }
  }

  splitMessage(text, maxLength = 2000) {
    if (text.length <= maxLength) {
      return [text];
    }

    const chunks = [];
    let currentChunk = '';

    const lines = text.split('\n');

    for (const line of lines) {
      if ((currentChunk + line + '\n').length > maxLength) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
          currentChunk = '';
        }

        if (line.length > maxLength) {
          const words = line.split(' ');
          for (const word of words) {
            if ((currentChunk + word + ' ').length > maxLength) {
              chunks.push(currentChunk.trim());
              currentChunk = word + ' ';
            } else {
              currentChunk += word + ' ';
            }
          }
        } else {
          currentChunk = line + '\n';
        }
      } else {
        currentChunk += line + '\n';
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  async start() {
    try {
      console.log('🚀 Starting support bot...\n');
      await this.client.login(this.config.discordToken);
    } catch (error) {
      console.error('Failed to start bot:', error);
      process.exit(1);
    }
  }

  async stop() {
    console.log('Stopping bot...');
    this.client.destroy();
  }
}

export default SupportBot;
