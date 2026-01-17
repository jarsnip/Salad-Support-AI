# Quick Setup Guide

Follow these steps to get your support bot running:

## 1. Install Node.js

Download and install Node.js 18 or higher from [nodejs.org](https://nodejs.org/)

## 2. Install Dependencies

Open a terminal in this directory and run:
```bash
npm install
```

## 3. Create Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to "Bot" section and click "Add Bot"
4. Copy the bot token (keep it secret!)
5. Enable these intents:
   - Server Members Intent
   - Message Content Intent
6. Go to OAuth2 > URL Generator:
   - Select scope: `bot`
   - Select permissions:
     - Read Messages/View Channels
     - Send Messages
     - Send Messages in Threads
     - Create Public Threads
     - Read Message History
7. Use the generated URL to invite bot to your server

## 4. Get Anthropic API Key

1. Go to [Anthropic Console](https://console.anthropic.com/)
2. Sign up or log in
3. Go to API Keys section
4. Create a new API key
5. Copy the key (keep it secret!)

## 5. Configure Environment

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your credentials:
   - `DISCORD_TOKEN`: Your bot token from step 3
   - `SUPPORT_CHANNEL_ID`: Right-click your support channel in Discord (with Developer Mode enabled) and "Copy ID"
   - `ANTHROPIC_API_KEY`: Your Anthropic API key from step 4

## 6. Add Your Documentation

1. Add your support docs to the `docs/` folder as `.md` files
2. Example files are already provided - customize them for your needs
3. The bot automatically loads all markdown files from this folder

## 7. Start the Bot

Development mode (auto-restart on changes):
```bash
npm run dev
```

Production mode:
```bash
npm start
```

## 8. Test It!

1. Post a message in your support channel
2. The bot should create a thread automatically
3. The bot will respond with an AI-generated answer based on your documentation
4. Continue the conversation in the thread!

## Troubleshooting

**Bot not responding?**
- Check console for errors
- Verify bot has permissions in the channel
- Confirm Message Content Intent is enabled
- Check that SUPPORT_CHANNEL_ID matches your channel

**API errors?**
- Verify your Anthropic API key is valid
- Check you have API credits available
- Review the error message in console

**Need help?**
- Read the full README.md
- Check the troubleshooting section
- Review the code comments

---

You're all set! Your AI support bot is ready to help your community.