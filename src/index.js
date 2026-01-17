import 'dotenv/config';
import SupportBot from './bot.js';

const config = {
  discordToken: process.env.DISCORD_TOKEN,
  supportChannelId: process.env.SUPPORT_CHANNEL_ID,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  aiModel: process.env.AI_MODEL || 'claude-sonnet-4-20250514',
  maxConversationHistory: parseInt(process.env.MAX_CONVERSATION_HISTORY) || 10,
  botName: process.env.BOT_NAME || 'Support Bot'
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

process.on('SIGINT', async () => {
  console.log('\n\nReceived SIGINT, shutting down gracefully...');
  await bot.stop();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n\nReceived SIGTERM, shutting down gracefully...');
  await bot.stop();
  process.exit(0);
});

bot.start();
