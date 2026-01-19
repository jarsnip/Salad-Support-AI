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

    // Cleanup old conversations every hour
    setInterval(() => {
      this.conversationManager.cleanupOldConversations();
    }, 60 * 60 * 1000);

    // Check for inactive conversations every minute (if auto-end is enabled)
    if (config.autoEnd?.enabled) {
      setInterval(() => {
        this.checkInactiveConversations();
      }, 60 * 1000);
    }
  }

  setupEventHandlers() {
    this.client.once('clientReady', () => {
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
        } else if (interaction.commandName === 'block') {
          await this.handleBlockCommand(interaction);
        } else if (interaction.commandName === 'unblock') {
          await this.handleUnblockCommand(interaction);
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
      try {
        if (thread.permissionOverwrites) {
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
        } else {
          console.log(`⚠️ Thread permissions not available (thread type: ${thread.type})`);
        }
      } catch (permError) {
        console.error(`⚠️ Could not set thread permissions: ${permError.message}`);
      }

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

      // Get the original poster to ping them
      const originalPosterId = this.conversationManager.getOriginalPosterId(channel.id);
      const userMention = originalPosterId ? `<@${originalPosterId}>` : '';

      await interaction.reply({
        content: `${userMention} 👋 Thank you for using our support! Please provide feedback by reacting to this message:\n👍 if your issue was resolved\n👎 if you need more help`,
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

        // Mark conversation as ended
        this.conversationManager.endConversation(channel.id);

        // Emit conversation ended event for dashboard
        this.emit('conversationEnded', {
          threadId: channel.id,
          reason: 'feedback',
          timestamp: Date.now()
        });

        // Send transcript if enabled
        if (this.config.autoEnd?.sendTranscripts) {
          const originalPosterId = this.conversationManager.getConversation(channel.id).originalPosterId;
          await this.sendTranscriptDM(channel.id, originalPosterId);
        }

        // If negative feedback and follow-up channel configured, notify support team
        if (feedbackType === 'negative' && this.config.negativeFeedbackChannelId) {
          await this.sendNegativeFeedbackAlert(channel.id, user);
        }

        await channel.setLocked(true);
        await channel.setArchived(true);

        console.log(`🔒 Thread ${channel.id} has been locked and archived`);

        // Schedule thread deletion after feedback
        const deleteTimeout = this.config.autoEnd?.threadDeleteAfterFeedback || 120000; // Default 2 minutes
        setTimeout(async () => {
          try {
            await channel.delete();
            console.log(`🗑️  Thread ${channel.id} deleted after feedback`);
          } catch (err) {
            console.error(`Error deleting thread ${channel.id}:`, err);
          }
        }, deleteTimeout);
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

  async handleBlockCommand(interaction) {
    try {
      // Check if user has moderator permissions
      const member = interaction.member;
      const hasModPermission = member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
                               member.permissions.has(PermissionFlagsBits.Administrator);

      if (!hasModPermission) {
        await interaction.reply({
          content: '❌ You do not have permission to use this command. Moderator or Administrator role required.',
          ephemeral: true
        });
        return;
      }

      const targetUser = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason') || 'No reason provided';

      if (!targetUser) {
        await interaction.reply({
          content: '❌ Invalid user specified.',
          ephemeral: true
        });
        return;
      }

      // Prevent blocking bots or self
      if (targetUser.bot) {
        await interaction.reply({
          content: '❌ Cannot block bot users.',
          ephemeral: true
        });
        return;
      }

      if (targetUser.id === interaction.user.id) {
        await interaction.reply({
          content: '❌ You cannot block yourself.',
          ephemeral: true
        });
        return;
      }

      // Add to blacklist
      this.spamFilter.addToBlacklist(
        targetUser.id,
        targetUser.tag,
        reason,
        interaction.user.tag
      );

      await interaction.reply({
        content: `✅ User ${targetUser.tag} has been blacklisted from creating support threads.\n**Reason:** ${reason}`,
        ephemeral: true
      });

      console.log(`🔨 ${interaction.user.tag} blocked ${targetUser.tag} - Reason: ${reason}`);

    } catch (error) {
      console.error('Error handling /block command:', error);
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

  async handleUnblockCommand(interaction) {
    try {
      // Check if user has moderator permissions
      const member = interaction.member;
      const hasModPermission = member.permissions.has(PermissionFlagsBits.ModerateMembers) ||
                               member.permissions.has(PermissionFlagsBits.Administrator);

      if (!hasModPermission) {
        await interaction.reply({
          content: '❌ You do not have permission to use this command. Moderator or Administrator role required.',
          ephemeral: true
        });
        return;
      }

      const targetUser = interaction.options.getUser('user');

      if (!targetUser) {
        await interaction.reply({
          content: '❌ Invalid user specified.',
          ephemeral: true
        });
        return;
      }

      // Check if user is blacklisted
      if (!this.spamFilter.isBlacklisted(targetUser.id)) {
        await interaction.reply({
          content: `ℹ️ User ${targetUser.tag} is not blacklisted.`,
          ephemeral: true
        });
        return;
      }

      // Remove from blacklist
      this.spamFilter.removeFromBlacklist(targetUser.id);

      await interaction.reply({
        content: `✅ User ${targetUser.tag} has been unblocked and can now create support threads.`,
        ephemeral: true
      });

      console.log(`✅ ${interaction.user.tag} unblocked ${targetUser.tag}`);

    } catch (error) {
      console.error('Error handling /unblock command:', error);
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

  async checkInactiveConversations() {
    if (!this.config.autoEnd?.enabled) return;

    const timeout = this.config.autoEnd.timeout || 300000; // Default 5 minutes
    const inactive = this.conversationManager.getInactiveConversations(timeout);

    for (const { threadId, conversation } of inactive) {
      try {
        const thread = await this.client.channels.fetch(threadId);
        if (!thread) continue;

        console.log(`⏰ Auto-ending inactive conversation in thread ${threadId}`);

        // Get the original poster to ping them
        const userMention = conversation.originalPosterId ? `<@${conversation.originalPosterId}>` : '';

        // Send feedback request message
        const feedbackMessage = await thread.send(
          `${userMention} ⏰ This conversation has been inactive. Please provide feedback by reacting to this message:\n👍 if your issue was resolved\n👎 if you need more help`
        );

        await feedbackMessage.react('👍');
        await feedbackMessage.react('👎');

        const filter = (reaction, user) => {
          return ['👍', '👎'].includes(reaction.emoji.name) && !user.bot;
        };

        const collector = feedbackMessage.createReactionCollector({
          filter,
          time: 60000,
          max: 1
        });

        collector.on('collect', async (reaction, user) => {
          const feedbackType = reaction.emoji.name === '👍' ? 'positive' : 'negative';

          console.log(`📊 Feedback received: ${feedbackType} from ${user.tag} in thread ${threadId}`);

          this.emit('feedbackReceived', {
            threadId: threadId,
            userId: user.id,
            username: user.tag,
            type: feedbackType,
            timestamp: Date.now()
          });

          await thread.send(`Thank you for your feedback! ${feedbackType === 'positive' ? 'Glad we could help!' : 'A human agent will follow up with you shortly.'}`);

          // Mark conversation as ended
          this.conversationManager.endConversation(threadId);

          // Emit conversation ended event for dashboard
          this.emit('conversationEnded', {
            threadId: threadId,
            reason: 'auto-end',
            timestamp: Date.now()
          });

          // Send transcript if enabled
          if (this.config.autoEnd.sendTranscripts && conversation.originalPosterId) {
            await this.sendTranscriptDM(threadId, conversation.originalPosterId);
          }

          // If negative feedback and follow-up channel configured, notify support team
          if (feedbackType === 'negative' && this.config.negativeFeedbackChannelId) {
            await this.sendNegativeFeedbackAlert(threadId, user);
          }

          await thread.setLocked(true);
          await thread.setArchived(true);

          console.log(`🔒 Thread ${threadId} has been locked and archived after auto-end`);

          // Schedule thread deletion after feedback
          const deleteTimeout = this.config.autoEnd.threadDeleteAfterFeedback || 120000; // Default 2 minutes
          setTimeout(async () => {
            try {
              await thread.delete();
              console.log(`🗑️  Thread ${threadId} deleted after auto-end feedback`);
            } catch (err) {
              console.error(`Error deleting thread ${threadId}:`, err);
            }
          }, deleteTimeout);
        });

        collector.on('end', async (collected) => {
          if (collected.size === 0) {
            // No feedback received, still end the conversation
            await thread.send('No feedback received. This conversation has been closed due to inactivity.');

            // Mark conversation as ended
            this.conversationManager.endConversation(threadId);

            // Emit conversation ended event for dashboard
            this.emit('conversationEnded', {
              threadId: threadId,
              reason: 'auto-end-timeout',
              timestamp: Date.now()
            });

            // Send transcript if enabled
            if (this.config.autoEnd.sendTranscripts && conversation.originalPosterId) {
              await this.sendTranscriptDM(threadId, conversation.originalPosterId);
            }

            await thread.setLocked(true);
            await thread.setArchived(true);

            // Schedule thread deletion
            const deleteTimeout = this.config.autoEnd.threadDeleteAfterEnd || 300000;
            setTimeout(async () => {
              try {
                await thread.delete();
                console.log(`🗑️  Thread ${threadId} deleted after auto-end timeout`);
              } catch (err) {
                console.error(`Error deleting thread ${threadId}:`, err);
              }
            }, deleteTimeout);
          }
        });

      } catch (error) {
        console.error(`Error auto-ending conversation ${threadId}:`, error);
        this.emit('error', error);
      }
    }
  }

  async sendTranscriptDM(threadId, userId) {
    try {
      const html = this.conversationManager.generateHTMLTranscript(threadId);
      if (!html) {
        console.log(`No transcript to send for thread ${threadId}`);
        return;
      }

      const user = await this.client.users.fetch(userId);
      if (!user) {
        console.log(`Could not fetch user ${userId} for transcript`);
        return;
      }

      // Create a buffer from the HTML
      const buffer = Buffer.from(html, 'utf8');

      await user.send({
        content: '📄 Here is the transcript of your support conversation:',
        files: [{
          attachment: buffer,
          name: `transcript-${threadId}.html`,
          description: 'Support conversation transcript'
        }]
      });

      console.log(`📧 Sent transcript to user ${user.tag} for thread ${threadId}`);
    } catch (error) {
      console.error(`Error sending transcript for thread ${threadId}:`, error);
      // Don't emit error for DM failures (user might have DMs disabled)
    }
  }

  async sendNegativeFeedbackAlert(threadId, user) {
    try {
      const followUpChannel = await this.client.channels.fetch(this.config.negativeFeedbackChannelId);
      if (!followUpChannel) {
        console.error(`Negative feedback channel ${this.config.negativeFeedbackChannelId} not found`);
        return;
      }

      const conversation = this.conversationManager.getConversation(threadId);
      const html = this.conversationManager.generateHTMLTranscript(threadId);

      // Create Discord thread URL
      const guildId = this.config.guildId;
      const threadUrl = `https://discord.com/channels/${guildId}/${threadId}`;

      // Create message embed-style content
      let messageContent = `🚨 **Negative Feedback Alert**\n\n`;
      messageContent += `**User:** ${user.tag} (${user.id})\n`;
      messageContent += `**Thread:** ${threadUrl}\n`;
      messageContent += `**Original Poster:** ${conversation.originalPosterUsername || 'Unknown'}\n`;
      messageContent += `**Messages:** ${conversation.messages.length}\n`;
      messageContent += `**Started:** <t:${Math.floor(conversation.createdAt / 1000)}:R>\n\n`;
      messageContent += `⚠️ This user indicated they need more help. Please review and follow up.`;

      // Send alert message with transcript attachment
      if (html) {
        const buffer = Buffer.from(html, 'utf8');
        await followUpChannel.send({
          content: messageContent,
          files: [{
            attachment: buffer,
            name: `transcript-${threadId}.html`,
            description: 'Conversation transcript'
          }]
        });
      } else {
        await followUpChannel.send(messageContent);
      }

      console.log(`📢 Sent negative feedback alert to follow-up channel for thread ${threadId}`);
    } catch (error) {
      console.error(`Error sending negative feedback alert for thread ${threadId}:`, error);
      this.emit('error', error);
    }
  }

  async endConversationFromDashboard(threadId) {
    try {
      const thread = await this.client.channels.fetch(threadId);

      if (!thread) {
        throw new Error(`Thread ${threadId} not found`);
      }

      if (!thread.isThread()) {
        throw new Error(`Channel ${threadId} is not a thread`);
      }

      const conversation = this.conversationManager.getConversation(threadId);

      if (conversation.ended) {
        throw new Error('Conversation already ended');
      }

      console.log(`🛑 Ending conversation from dashboard: ${threadId}`);

      // Get the original poster to ping them
      const userMention = conversation.originalPosterId ? `<@${conversation.originalPosterId}>` : '';

      // Send feedback request message
      const feedbackMessage = await thread.send(
        `${userMention} 👋 Thank you for using our support! Please provide feedback by reacting to this message:\n👍 if your issue was resolved\n👎 if you need more help`
      );

      await feedbackMessage.react('👍');
      await feedbackMessage.react('👎');

      const filter = (reaction, user) => {
        return ['👍', '👎'].includes(reaction.emoji.name) && !user.bot;
      };

      const collector = feedbackMessage.createReactionCollector({
        filter,
        time: 60000,
        max: 1
      });

      collector.on('collect', async (reaction, user) => {
        const feedbackType = reaction.emoji.name === '👍' ? 'positive' : 'negative';

        console.log(`📊 Feedback received: ${feedbackType} from ${user.tag} in thread ${threadId}`);

        this.emit('feedbackReceived', {
          threadId: threadId,
          userId: user.id,
          username: user.tag,
          type: feedbackType,
          timestamp: Date.now()
        });

        await thread.send(`Thank you for your feedback! ${feedbackType === 'positive' ? 'Glad we could help!' : 'A human agent will follow up with you shortly.'}`);

        // Mark conversation as ended
        this.conversationManager.endConversation(threadId);

        // Emit conversation ended event for dashboard
        this.emit('conversationEnded', {
          threadId: threadId,
          reason: 'dashboard',
          timestamp: Date.now()
        });

        // Send transcript if enabled
        if (this.config.autoEnd?.sendTranscripts && conversation.originalPosterId) {
          await this.sendTranscriptDM(threadId, conversation.originalPosterId);
        }

        // If negative feedback and follow-up channel configured, notify support team
        if (feedbackType === 'negative' && this.config.negativeFeedbackChannelId) {
          await this.sendNegativeFeedbackAlert(threadId, user);
        }

        await thread.setLocked(true);
        await thread.setArchived(true);

        console.log(`🔒 Thread ${threadId} has been locked and archived from dashboard`);

        // Schedule thread deletion after feedback
        const deleteTimeout = this.config.autoEnd?.threadDeleteAfterFeedback || 120000; // Default 2 minutes
        setTimeout(async () => {
          try {
            await thread.delete();
            console.log(`🗑️  Thread ${threadId} deleted after dashboard end`);
          } catch (err) {
            console.error(`Error deleting thread ${threadId}:`, err);
          }
        }, deleteTimeout);
      });

      collector.on('end', async (collected) => {
        if (collected.size === 0) {
          await thread.send('No feedback received. Thread will remain open.');
        }
      });

    } catch (error) {
      console.error(`Error ending conversation from dashboard ${threadId}:`, error);
      throw error; // Re-throw to be handled by the API endpoint
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
