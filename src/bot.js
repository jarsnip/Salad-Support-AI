import { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } from 'discord.js';
import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import AIService from './services/aiService.js';
import ConversationManager from './utils/conversationManager.js';
import MessageQueue from './utils/messageQueue.js';
import docsManager from './utils/docsManager.js';
import SpamFilter from './utils/spamFilter.js';
import ServerConfigManager from './utils/serverConfigManager.js';

class SupportBot extends EventEmitter {
  constructor(config, database) {
    super();
    this.config = config;
    this.database = database;
    this.client = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
      ]
    });

    this.serverConfig = new ServerConfigManager(database);
    this.aiService = new AIService(null, config.aiModel); // API key will be per-server
    this.conversationManager = new ConversationManager(config.maxConversationHistory);
    this.spamFilter = new SpamFilter(config.spamFilter);

    this.messageQueue = new MessageQueue(
      this.processMessage.bind(this),
      3
    );

    // Store interval references for cleanup
    this.intervals = [];

    this.setupEventHandlers();

    // Cleanup old conversations every hour
    this.intervals.push(setInterval(() => {
      this.conversationManager.cleanupOldConversations();
    }, 60 * 60 * 1000));

    // Check for inactive conversations every minute (if auto-end is enabled)
    if (config.autoEnd?.enabled) {
      this.intervals.push(setInterval(() => {
        this.checkInactiveConversations();
      }, 60 * 1000));
    }
  }

  setupEventHandlers() {
    this.client.once('clientReady', () => {
      console.log(`✓ Bot logged in as ${this.client.user.tag}`);
      console.log(`✓ AI Model: ${this.config.aiModel}`);
      console.log(`✓ Connected to ${this.client.guilds.cache.size} servers`);

      const stats = docsManager.getStats?.() || { docs: docsManager.getAllDocs().length };
      console.log(`✓ Loaded ${docsManager.getAllDocs().length} documentation files`);
      console.log('\n🤖 Multi-server support bot is ready!\n');

      // Update server names in database
      this.updateAllServerNames();
    });

    this.client.on('messageCreate', async (message) => {
      try {
        if (message.author.bot) return;
        if (!message.guild) return; // Ignore DMs

        if (message.content.trim().startsWith('>')) return;

        // Check if message is in a thread
        if (message.channel.isThread()) {
          await this.handleThreadMessage(message);
        }
        // Check if it's a new support message (not in a thread, bot is mentioned or in designated channel)
        else if (!message.hasThread && message.mentions.has(this.client.user)) {
          await this.handleSupportMessage(message);
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

    // Handle bot joining a server
    this.client.on('guildCreate', async (guild) => {
      await this.handleGuildJoin(guild);
    });

    // Handle bot leaving a server
    this.client.on('guildDelete', async (guild) => {
      await this.handleGuildLeave(guild);
    });
  }

  async handleSupportMessage(message) {
    try {
      const guildId = message.guild.id;

      // Check if server is configured with API key
      if (!this.serverConfig.isServerConfigured(guildId)) {
        console.log(`⚠️  Server ${message.guild.name} is not configured with an API key`);
        await message.reply('This server needs to be configured before I can help. Please ask a server administrator to set up the bot via the dashboard.');
        return;
      }

      console.log(`\n📩 New support message from ${message.author.tag} in ${message.guild.name}: "${message.content.substring(0, 50)}..."`);

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

      // Initialize conversation with guildId
      this.conversationManager.getConversation(thread.id, guildId);

      // Track the original poster
      this.conversationManager.setOriginalPoster(thread.id, message.author.id, message.author.username);

      // Record thread creation in spam filter
      this.spamFilter.recordThread(message.author.id);
      this.spamFilter.recordMessage(message.author.id, message.content);

      // Log initial message for doc refinement
      this.logInitialMessage(message.content);

      await thread.send(`👋 Hi ${message.author}! I'm here to help with your support question. Let me look into that for you...`);

      this.messageQueue.add({
        threadId: thread.id,
        guildId: guildId,
        messageContent: message.content,
        userId: message.author.id,
        username: message.author.username
      });

      this.emit('conversationCreated', {
        threadId: thread.id,
        guildId: guildId,
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
      const guildId = message.guild?.id;
      if (!guildId) {
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

      // Start typing indicator
      const typingInterval = setInterval(() => {
        message.channel.sendTyping().catch(() => {});
      }, 5000);

      message.channel.sendTyping().catch(() => {});

      // Pass typing interval to queue item so it can be cleared when done
      this.messageQueue.add({
        threadId: message.channel.id,
        guildId: guildId,
        messageContent: message.content,
        userId: message.author.id,
        username: message.author.username,
        typingInterval: typingInterval // Will be cleared in processQueue finally block
      });

    } catch (error) {
      console.error('Error handling thread message:', error);
    }
  }

  async processMessage(item) {
    const { threadId, messageContent, userId, username, guildId } = item;

    try {
      const thread = await this.client.channels.fetch(threadId);

      if (!thread) {
        console.error(`Thread ${threadId} not found`);
        return;
      }

      // Get guild ID from thread if not provided
      const actualGuildId = guildId || thread.guild?.id;
      if (!actualGuildId) {
        console.error(`Could not determine guild ID for thread ${threadId}`);
        return;
      }

      // Get per-server API key
      const apiKey = this.serverConfig.getApiKey(actualGuildId);
      if (!apiKey) {
        console.error(`No API key configured for server ${actualGuildId}`);
        await thread.send('This server is not configured with an API key. Please contact a server administrator.');
        return;
      }

      // Get custom system prompt if configured
      const customSystemPrompt = this.serverConfig.getSystemPrompt(actualGuildId);

      this.conversationManager.addMessage(threadId, 'user', messageContent, userId);

      const conversationHistory = this.conversationManager.getFormattedHistory(threadId);

      const messages = this.conversationManager.getMessagesForAPI(threadId);

      console.log(`🤖 Generating AI response for thread ${threadId} in server ${actualGuildId}...`);

      const response = await this.aiService.generateResponse(messages, conversationHistory, apiKey, customSystemPrompt);

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
        content: `${userMention} 👋 Thank you for using our support! Please provide feedback by reacting to this message:\n👍 if your issue was resolved\n👎 if you need more help`
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

        const feedbackData = {
          threadId: channel.id,
          userId: user.id,
          username: user.tag,
          type: feedbackType,
          timestamp: Date.now()
        };

        this.emit('feedbackReceived', feedbackData);

        // Store feedback in conversation before ending
        this.conversationManager.setFeedback(channel.id, feedbackData);

        await channel.send(`Thank you for your feedback! ${feedbackType === 'positive' ? 'Glad we could help!' : 'A human agent will follow up with you shortly.'}`);

        // Mark conversation as ended
        await this.conversationManager.endConversation(channel.id);

        // Emit conversation ended event for dashboard
        this.emit('conversationEnded', {
          threadId: channel.id,
          reason: 'feedback',
          timestamp: Date.now()
        });

        // Send transcript if enabled
        if (this.config.autoEnd?.sendTranscripts) {
          const conversation = this.conversationManager.getConversation(channel.id);
          if (conversation && conversation.originalPosterId) {
            await this.sendTranscriptDM(channel.id, conversation.originalPosterId);
          }
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
      await this.spamFilter.addToBlacklist(
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
      await this.spamFilter.removeFromBlacklist(targetUser.id);

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

          const feedbackData = {
            threadId: threadId,
            userId: user.id,
            username: user.tag,
            type: feedbackType,
            timestamp: Date.now()
          };

          this.emit('feedbackReceived', feedbackData);

          // Store feedback in conversation before ending
          this.conversationManager.setFeedback(threadId, feedbackData);

          await thread.send(`Thank you for your feedback! ${feedbackType === 'positive' ? 'Glad we could help!' : 'A human agent will follow up with you shortly.'}`);

          // Mark conversation as ended
          await this.conversationManager.endConversation(threadId);

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
            await this.conversationManager.endConversation(threadId);

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
      if (!userId) {
        console.log(`No user ID provided for transcript ${threadId}`);
        return;
      }

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
      // Ensure threadId is a string
      const threadIdString = String(threadId);
      console.log(`🛑 Dashboard end request for thread: ${threadIdString} (type: ${typeof threadId})`);

      const thread = await this.client.channels.fetch(threadIdString);

      if (!thread) {
        throw new Error(`Thread ${threadIdString} not found`);
      }

      if (!thread.isThread()) {
        throw new Error(`Channel ${threadIdString} is not a thread`);
      }

      const conversation = this.conversationManager.getConversation(threadIdString);

      if (conversation.ended) {
        throw new Error('Conversation already ended');
      }

      console.log(`🛑 Ending conversation from dashboard: ${threadIdString}`);

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

        console.log(`📊 Feedback received: ${feedbackType} from ${user.tag} in thread ${threadIdString}`);

        const feedbackData = {
          threadId: threadIdString,
          userId: user.id,
          username: user.tag,
          type: feedbackType,
          timestamp: Date.now()
        };

        this.emit('feedbackReceived', feedbackData);

        // Store feedback in conversation before ending
        this.conversationManager.setFeedback(threadIdString, feedbackData);

        await thread.send(`Thank you for your feedback! ${feedbackType === 'positive' ? 'Glad we could help!' : 'A human agent will follow up with you shortly.'}`);

        // Mark conversation as ended
        await this.conversationManager.endConversation(threadIdString);

        // Emit conversation ended event for dashboard
        this.emit('conversationEnded', {
          threadId: threadIdString,
          reason: 'dashboard',
          timestamp: Date.now()
        });

        // Send transcript if enabled
        if (this.config.autoEnd?.sendTranscripts && conversation.originalPosterId) {
          await this.sendTranscriptDM(threadIdString, conversation.originalPosterId);
        }

        // If negative feedback and follow-up channel configured, notify support team
        if (feedbackType === 'negative' && this.config.negativeFeedbackChannelId) {
          await this.sendNegativeFeedbackAlert(threadIdString, user);
        }

        await thread.setLocked(true);
        await thread.setArchived(true);

        console.log(`🔒 Thread ${threadIdString} has been locked and archived from dashboard`);

        // Schedule thread deletion after feedback
        const deleteTimeout = this.config.autoEnd?.threadDeleteAfterFeedback || 120000; // Default 2 minutes
        setTimeout(async () => {
          try {
            await thread.delete();
            console.log(`🗑️  Thread ${threadIdString} deleted after dashboard end`);
          } catch (err) {
            console.error(`Error deleting thread ${threadIdString}:`, err);
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

  logInitialMessage(messageContent) {
    try {
      const logFile = path.join(process.cwd(), 'data', 'initial_messages.txt');
      const logDir = path.dirname(logFile);

      // Ensure data directory exists
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      // Format: timestamp | message content
      const timestamp = new Date().toISOString();
      const logEntry = `[${timestamp}] ${messageContent}\n`;

      // Append to file
      fs.appendFileSync(logFile, logEntry, 'utf8');
    } catch (error) {
      console.error('Error logging initial message:', error);
      // Don't throw - logging failure shouldn't break the bot
    }
  }

  async handleGuildJoin(guild) {
    console.log(`\n🔔 Bot added to server: ${guild.name} (${guild.id})`);

    // Check if server is whitelisted
    const isWhitelisted = this.database.isServerWhitelisted(guild.id);

    if (!isWhitelisted) {
      console.log(`⚠️  Server ${guild.name} is NOT whitelisted. Leaving server...`);

      try {
        // Try to send a message to server owner
        const owner = await guild.fetchOwner();
        await owner.send(`Hello! Thank you for adding the support bot to **${guild.name}**.\n\nThis is a private bot that requires authorization. Please contact the bot administrator to get your server whitelisted.\n\nThe bot will now leave your server.`);
      } catch (error) {
        console.log('Could not DM server owner:', error.message);
      }

      // Leave the server
      await guild.leave();
      console.log(`👋 Left server: ${guild.name}`);
      return;
    }

    // Server is whitelisted, add to database
    this.database.addServer(guild.id, guild.name, true);
    console.log(`✅ Server ${guild.name} is whitelisted and added to database`);

    // Emit event for dashboard
    this.emit('guildJoined', {
      guildId: guild.id,
      guildName: guild.name,
      timestamp: Date.now()
    });
  }

  async handleGuildLeave(guild) {
    console.log(`\n👋 Bot removed from server: ${guild.name} (${guild.id})`);

    // Don't delete server data, just mark as inactive (in case they re-add)
    // Server data and transcripts are preserved

    // Emit event for dashboard
    this.emit('guildLeft', {
      guildId: guild.id,
      guildName: guild.name,
      timestamp: Date.now()
    });
  }

  async updateAllServerNames() {
    console.log('\n📝 Updating server names in database...');

    for (const guild of this.client.guilds.cache.values()) {
      const serverInDb = this.database.getServer(guild.id);
      if (serverInDb && serverInDb.guild_name !== guild.name) {
        this.database.updateServerName(guild.id, guild.name);
        console.log(`Updated server name: ${serverInDb.guild_name} → ${guild.name}`);
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

    // Clear all intervals to prevent memory leaks
    if (this.intervals) {
      this.intervals.forEach(interval => clearInterval(interval));
      this.intervals = [];
    }

    // Stop spam filter cleanup interval
    if (this.spamFilter) {
      this.spamFilter.stop();
    }

    this.client.destroy();
  }
}

export default SupportBot;
