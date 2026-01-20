import 'dotenv/config';
import SupportBot from './bot.js';
import { DashboardServer } from './dashboard/server.js';
import MultiTenantDB from './database/database.js';
import DiscordOAuth from './services/discordOAuth.js';

const config = {
  discordToken: process.env.DISCORD_TOKEN,
  discordClientId: process.env.DISCORD_CLIENT_ID,
  discordClientSecret: process.env.DISCORD_CLIENT_SECRET,
  dashboardUrl: process.env.DASHBOARD_URL || 'http://localhost:3000',
  aiModel: process.env.AI_MODEL || 'claude-sonnet-4-20250514',
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

if (!config.discordClientId) {
  console.error('❌ Error: DISCORD_CLIENT_ID is required in .env file');
  process.exit(1);
}

if (!config.discordClientSecret) {
  console.error('❌ Error: DISCORD_CLIENT_SECRET is required in .env file');
  process.exit(1);
}

// Initialize multi-tenant database
const database = new MultiTenantDB();
console.log('✅ Multi-tenant database initialized');

// Initialize Discord OAuth
const oauthRedirectUri = `${config.dashboardUrl}/auth/callback`;
const oauth = new DiscordOAuth(
  config.discordClientId,
  config.discordClientSecret,
  oauthRedirectUri
);
console.log('✅ Discord OAuth initialized');

// Initialize bot and dashboard with database and OAuth
const bot = new SupportBot(config, database);
const dashboard = new DashboardServer(bot, config, database, oauth);

process.on('SIGINT', async () => {
  console.log('\n\nReceived SIGINT, shutting down gracefully...');
  await dashboard.stop();
  await bot.stop();
  database.close();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\nReceived SIGTERM, shutting down gracefully...');
  await dashboard.stop();
  await bot.stop();
  database.close();
  process.exit(0);
});

async function start() {
  await bot.start();
  await dashboard.start();
}

start();
