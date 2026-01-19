import 'dotenv/config';
import SupportBot from './bot.js';
import { DashboardServer } from './dashboard/server.js';

const config = {
  discordToken: process.env.DISCORD_TOKEN,
  guildId: process.env.GUILD_ID,
  supportChannelId: process.env.SUPPORT_CHANNEL_ID,
  negativeFeedbackChannelId: process.env.NEGATIVE_FEEDBACK_CHANNEL_ID,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  aiModel: process.env.AI_MODEL || 'claude-haiku-4-5-20251001',
  maxConversationHistory: parseInt(process.env.MAX_CONVERSATION_HISTORY) || 10,
  botName: process.env.BOT_NAME || 'Support Bot',
  dashboardPort: parseInt(process.env.DASHBOARD_PORT) || 3000,
  spamFilter: {
    enabled: process.env.SPAM_FILTER_ENABLED !== 'false',
    maxThreadsPerWindow: parseInt(process.env.SPAM_MAX_THREADS_PER_WINDOW) || 3,
    timeWindow: parseInt(process.env.SPAM_TIME_WINDOW) || 600000, // 10 minutes
    cooldownPeriod: parseInt(process.env.SPAM_COOLDOWN) || 120000, // 2 minutes
    autoBanThreshold: parseInt(process.env.SPAM_AUTO_BAN_THRESHOLD) || 5,
    banDuration: parseInt(process.env.SPAM_BAN_DURATION) || 3600000 // 1 hour
  },
  autoEnd: {
    enabled: process.env.AUTO_END_ENABLED !== 'false',
    timeout: parseInt(process.env.AUTO_END_TIMEOUT) || 300000, // 5 minutes
    threadDeleteAfterEnd: parseInt(process.env.THREAD_DELETE_AFTER_END) || 300000, // 5 minutes
    threadDeleteAfterFeedback: parseInt(process.env.THREAD_DELETE_AFTER_FEEDBACK) || 120000, // 2 minutes
    sendTranscripts: process.env.SEND_TRANSCRIPTS !== 'false'
  }
};

if (!config.discordToken) {
  console.error('❌ Error: DISCORD_TOKEN is required in .env file');
  process.exit(1);
}

if (!config.supportChannelId) {
  console.error('❌ Error: SUPPORT_CHANNEL_ID is required in .env file');
  process.exit(1);
}

if (!config.anthropicApiKey) {
  console.error('❌ Error: ANTHROPIC_API_KEY is required in .env file');
  process.exit(1);
}

const bot = new SupportBot(config);
const dashboard = new DashboardServer(bot, config.dashboardPort);

process.on('SIGINT', async () => {
  console.log('\n\nReceived SIGINT, shutting down gracefully...');
  await dashboard.stop();
  await bot.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\nReceived SIGTERM, shutting down gracefully...');
  await dashboard.stop();
  await bot.stop();
  process.exit(0);
});

async function start() {
  await bot.start();
  await dashboard.start();
}

start();
