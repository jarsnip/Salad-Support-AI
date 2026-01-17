# Salad Support AI Bot

An intelligent Discord support bot powered by Claude AI that automatically handles support queries using a knowledge base of documentation. Perfect for busy servers that need to handle multiple support requests simultaneously.

## Features

- **Automatic Thread Creation**: Creates a dedicated thread for each support message in the designated channel
- **AI-Powered Responses**: Uses Claude AI to provide intelligent, context-aware responses
- **Support Documentation Bank**: Loads and uses markdown documentation files to answer questions accurately
- **Conversation Memory**: Maintains conversation history within each thread for contextual responses
- **Message Queueing**: Handles multiple concurrent requests efficiently (configurable concurrency limit)
- **Multiple Messages Support**: Processes multiple messages in the same thread seamlessly
- **Auto-cleanup**: Removes old conversation data to manage memory

## Prerequisites

- Node.js 18+ installed
- A Discord bot token ([Create a bot](https://discord.com/developers/applications))
- An Anthropic API key ([Get one here](https://console.anthropic.com/))
- A Discord server with a designated support channel

## Installation

1. **Clone or download this repository**

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**

   Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

   Edit `.env` and fill in your credentials:
   ```env
   DISCORD_TOKEN=your_discord_bot_token_here
   SUPPORT_CHANNEL_ID=your_support_channel_id_here
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   AI_MODEL=claude-3-5-sonnet-20241022
   MAX_CONVERSATION_HISTORY=10
   BOT_NAME=Support Bot
   ```

## Setting Up Your Discord Bot

1. **Create a Discord Application**
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Click "New Application"
   - Give it a name and create it

2. **Create a Bot**
   - Go to the "Bot" section
   - Click "Add Bot"
   - Copy the token (this is your `DISCORD_TOKEN`)

3. **Configure Bot Permissions**

   Required permissions:
   - Read Messages/View Channels
   - Send Messages
   - Send Messages in Threads
   - Create Public Threads
   - Read Message History

4. **Enable Required Intents**

   In the Bot section, enable:
   - Server Members Intent
   - Message Content Intent

5. **Invite Bot to Your Server**

   Go to OAuth2 > URL Generator and select:
   - Scopes: `bot`
   - Bot Permissions: (same as step 3)

   Use the generated URL to invite the bot to your server

6. **Get Your Support Channel ID**
   - Enable Developer Mode in Discord (Settings > Advanced > Developer Mode)
   - Right-click your support channel and select "Copy ID"
   - This is your `SUPPORT_CHANNEL_ID`

## Adding Support Documentation

The bot loads documentation from the `docs/` folder. All `.md` and `.txt` files are automatically loaded.

1. **Create documentation files** in the `docs/` folder
2. **Use markdown formatting** for better readability
3. **Organize by topic** (e.g., `getting-started.md`, `faq.md`, `troubleshooting.md`)
4. **Restart the bot** to reload documentation (or implement hot-reloading if needed)

Example structure:
```
docs/
├── getting-started.md
├── common-issues.md
├── faq.md
├── api-usage.md
└── troubleshooting.md
```

## Running the Bot

**Development mode** (with auto-reload):
```bash
npm run dev
```

**Production mode**:
```bash
npm start
```

## How It Works

1. **User posts in support channel**: When a user posts a message in the designated support channel, the bot automatically creates a thread
2. **Thread creation**: A new thread is created with the title "Support: [username]"
3. **AI processes the request**: The bot uses Claude AI with the loaded documentation to generate a helpful response
4. **Conversation continues**: Users can continue asking questions in the thread, and the bot maintains context
5. **Multiple messages**: The bot can handle multiple messages from different users simultaneously using a queue system

## Configuration Options

| Variable | Description | Default |
|----------|-------------|---------|
| `DISCORD_TOKEN` | Your Discord bot token | Required |
| `SUPPORT_CHANNEL_ID` | Channel ID to monitor for support requests | Required |
| `ANTHROPIC_API_KEY` | Your Anthropic API key | Required |
| `AI_MODEL` | Claude model to use | `claude-3-5-sonnet-20241022` |
| `MAX_CONVERSATION_HISTORY` | Number of messages to keep in memory | `10` |
| `BOT_NAME` | Name of the bot | `Support Bot` |

## Customizing the AI Behavior

You can customize how the AI responds by editing the system prompt in `src/services/aiService.js`:

```javascript
buildSystemPrompt() {
  return `Your custom instructions here...`;
}
```

## Architecture

- **`src/index.js`**: Entry point, loads configuration
- **`src/bot.js`**: Main bot logic, event handlers
- **`src/services/aiService.js`**: Claude AI integration
- **`src/utils/conversationManager.js`**: Manages conversation history and context
- **`src/utils/docsManager.js`**: Loads and manages support documentation
- **`src/utils/messageQueue.js`**: Handles concurrent message processing
- **`docs/`**: Support documentation files (markdown)

## Queue System

The bot uses a queue system to handle multiple requests efficiently:

- **Concurrent Limit**: 3 threads processed simultaneously (configurable in `bot.js`)
- **Duplicate Prevention**: Prevents processing the same thread multiple times
- **FIFO Processing**: Messages are processed in the order they're received

## Memory Management

- **Conversation History**: Keeps last N messages per thread (default: 10)
- **Auto-cleanup**: Removes conversations older than 24 hours
- **Thread Isolation**: Each thread has its own conversation context

## Troubleshooting

**Bot doesn't respond:**
- Check that the bot has proper permissions in the channel
- Verify the `SUPPORT_CHANNEL_ID` is correct
- Check the console for error messages
- Ensure Message Content Intent is enabled

**API errors:**
- Verify your Anthropic API key is valid
- Check your API quota and rate limits
- Review error messages in the console

**Documentation not loading:**
- Ensure files are in the `docs/` folder
- Check file extensions (`.md` or `.txt`)
- Restart the bot to reload documentation

## Advanced Usage

### Hot-Reloading Documentation

To reload documentation without restarting:

```javascript
import docsManager from './utils/docsManager.js';
docsManager.reloadDocs();
```

### Streaming Responses

The AI service supports streaming for longer responses. See `aiService.js` for the `generateStreamingResponse` method.

### Custom Message Handling

You can extend the bot by adding custom handlers in `src/bot.js`:

```javascript
this.client.on('messageReactionAdd', async (reaction, user) => {
  // Custom reaction handling
});
```

## Contributing

Feel free to submit issues, fork the repository, and create pull requests for any improvements.

## License

MIT License - feel free to use this for your own projects!

## Support

If you encounter any issues with this bot, please check the troubleshooting section or open an issue on GitHub.

---

Built with [Discord.js](https://discord.js.org/) and [Claude AI](https://www.anthropic.com/)