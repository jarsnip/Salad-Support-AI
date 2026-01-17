import { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } from 'discord.js';
import { EventEmitter } from 'events';
import AIService from './services/aiService.js';
import ConversationManager from './utils/conversationManager.js';
import MessageQueue from './utils/messageQueue.js';
import docsManager from './utils/docsManager.js';
import SpamFilter from './utils/spamFilter.js';

class SupportBot extends EventEmitter {
  constructor(config) {
    super();
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
    this.spamFilter = new SpamFilter(config.spamFilter);

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
      this.emit('error', error);
    });

    this.client.on('interactionCreate', async (interaction) => {
      try {
        if (!interaction.isChatInputCommand()) return;

        if (interaction.commandName === 'end') {
          await this.handleEndCommand(interaction);
        }
      } catch (error) {
        console.error('Error handling interaction:', error);
        this.emit('error', error);
      }
    });
  }

  async handleSupportMessage(message) {
    try {
      console.log(`\n📩 New support message from ${message.author.tag}: "${message.content.substring(0, 50)}..."`);

      // Check spam filter
      const spamCheck = await this.spamFilter.checkUser(
        message.author.id,
        message.author.username,
        message.content,
        message.member
      );

      if (!spamCheck.allowed) {
        console.log(`🚫 Spam detected from ${message.author.tag}: ${spamCheck.reason}`);

        // Emit spam event for dashboard
        this.emit('spamDetected', {
          userId: message.author.id,
          username: message.author.tag,
          reason: spamCheck.reason,
          message: message.content.substring(0, 100),
          timestamp: Date.now()
        });

        // Send user-friendly message
        await message.reply(spamCheck.message);
        return;
      }

      const thread = await message.startThread({
        name: `Support: ${message.author.username}`,
        autoArchiveDuration: 60,
        reason: 'Support request'
      });

      console.log(`📌 Created thread: ${thread.name} (ID: ${thread.id})`);

      // Set thread permissions: Only OP can send messages, others can only read
      await thread.permissionOverwrites.edit(message.author.id, {
        SendMessages: true,
        ViewChannel: true
      });

      // Everyone else can view but not send (deny @everyone from sending)
      await thread.permissionOverwrites.edit(thread.guild.roles.everyone, {
        SendMessages: false,
        ViewChannel: true
      });

      console.log(`🔒 Thread locked to original poster: ${message.author.tag}`);

      // Track the original poster
      this.conversationManager.setOriginalPoster(thread.id, message.author.id, message.author.username);

      // Record thread creation in spam filter
      this.spamFilter.recordThread(message.author.id);
      this.spamFilter.recordMessage(message.author.id, message.content);

      await thread.send(`👋 Hi ${message.author}! I'm here to help with your support question. Let me look into that for you...`);

      this.messageQueue.add({
        threadId: thread.id,
        messageContent: message.content,
        userId: message.author.id,
        username: message.author.username
      });

      this.emit('conversationCreated', {
        threadId: thread.id,
        username: message.author.username,
        userId: message.author.id,
        initialMessage: message.content,
        timestamp: Date.now()
      });

    } catch (error) {
      console.error('Error handling support message:', error);
      this.emit('error', error);
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

      // Check if the user is the original poster
      const originalPosterId = this.conversationManager.getOriginalPosterId(message.channel.id);

      if (originalPosterId && message.author.id !== originalPosterId) {
        console.log(`⚠️ Ignoring message from non-OP user ${message.author.tag} in thread ${message.channel.id}`);
        // Optionally send an ephemeral message (but Discord doesn't support this in threads easily)
        // Just silently ignore non-OP messages as failsafe
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

      this.emit('messageProcessed', {
        threadId,
        username,
        messageContent,
        response: response.substring(0, 100),
        timestamp: Date.now()
      });

    } catch (error) {
      console.error('Error processing message:', error);
      this.emit('error', error);

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

  async handleEndCommand(interaction) {
    try {
      const channel = interaction.channel;

      if (!channel.isThread()) {
        await interaction.reply({
          content: 'This command can only be used in support threads.',
          ephemeral: true
        });
        return;
      }

      const parentChannel = channel.parent;
      if (!parentChannel || parentChannel.id !== this.config.supportChannelId) {
        await interaction.reply({
          content: 'This command can only be used in support threads.',
          ephemeral: true
        });
        return;
      }

      await interaction.reply({
        content: '👋 Thank you for using our support! Please provide feedback by reacting to this message:\n👍 if your issue was resolved\n👎 if you need more help',
        fetchReply: true
      });

      const replyMessage = await interaction.fetchReply();

      await replyMessage.react('👍');
      await replyMessage.react('👎');

      const filter = (reaction, user) => {
        return ['👍', '👎'].includes(reaction.emoji.name) && !user.bot;
      };

      const collector = replyMessage.createReactionCollector({
        filter,
        time: 60000,
        max: 1
      });

      collector.on('collect', async (reaction, user) => {
        const feedbackType = reaction.emoji.name === '👍' ? 'positive' : 'negative';

        console.log(`📊 Feedback received: ${feedbackType} from ${user.tag} in thread ${channel.id}`);

        this.emit('feedbackReceived', {
          threadId: channel.id,
          userId: user.id,
          username: user.tag,
          type: feedbackType,
          timestamp: Date.now()
        });

        await channel.send(`Thank you for your feedback! ${feedbackType === 'positive' ? 'Glad we could help!' : 'A human agent will follow up with you shortly.'}`);

        await channel.setLocked(true);
        await channel.setArchived(true);

        console.log(`🔒 Thread ${channel.id} has been locked and archived`);
      });

      collector.on('end', async (collected) => {
        if (collected.size === 0) {
          await channel.send('No feedback received. Thread will remain open.');
        }
      });

    } catch (error) {
      console.error('Error handling /end command:', error);
      this.emit('error', error);

      try {
        await interaction.reply({
          content: 'An error occurred while processing the command.',
          ephemeral: true
        });
      } catch (replyError) {
        console.error('Error sending error reply:', replyError);
      }
    }
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
