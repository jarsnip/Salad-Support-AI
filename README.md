# Salad Support AI Bot

An intelligent Discord support bot powered by Claude AI that automatically handles support queries using a knowledge base of documentation. Perfect for busy servers that need to handle multiple support requests simultaneously.

## Features

- **Automatic Thread Creation**: Creates a dedicated thread for each support message in the designated channel
- **Private Thread Permissions**: Each thread is locked to the original poster - only they can send messages, others can read
- **AI-Powered Responses**: Uses Claude AI to provide intelligent, context-aware responses
- **Support Documentation Bank**: Loads and uses markdown documentation files to answer questions accurately
- **Conversation Memory**: Maintains conversation history within each thread for contextual responses
- **Message Queueing**: Handles multiple concurrent requests efficiently (configurable concurrency limit)
- **Single-User Focus**: Bot only responds to the original poster as a failsafe, preventing confusion
- **Auto-cleanup**: Removes old conversation data to manage memory
- **Live Dashboard**: Real-time web dashboard to monitor conversations, errors, and feedback
- **User Tracking**: Dashboard shows which user started each conversation
- **Feedback System**: `/end` command that locks threads and collects user feedback with reactions
- **Real-time Updates**: WebSocket-powered dashboard with live statistics and conversation tracking

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
   DISCORD_CLIENT_ID=your_discord_client_id_here
   SUPPORT_CHANNEL_ID=your_support_channel_id_here
   ANTHROPIC_API_KEY=your_anthropic_api_key_here
   AI_MODEL=claude-3-5-sonnet-20241022
   MAX_CONVERSATION_HISTORY=10
   BOT_NAME=Support Bot
   DASHBOARD_PORT=3000
   ```

4. **Register Discord slash commands**
   ```bash
   npm run register-commands
   ```
   This registers the `/end` command with Discord. You only need to do this once, or when you add new commands.

## Setting Up Your Discord Bot

1. **Create a Discord Application**
   - Go to [Discord Developer Portal](https://discord.com/developers/applications)
   - Click "New Application"
   - Give it a name and create it

2. **Get your Application Client ID**
   - In the "General Information" section
   - Copy the "Application ID" (this is your `DISCORD_CLIENT_ID`)

3. **Create a Bot**
   - Go to the "Bot" section
   - Click "Add Bot"
   - Copy the token (this is your `DISCORD_TOKEN`)

3. **Configure Bot Permissions**

   Required permissions:
   - Read Messages/View Channels
   - Send Messages
   - Send Messages in Threads
   - Create Public Threads
   - Manage Threads (required to set thread permissions)
   - Read Message History
   - Add Reactions (for feedback system)

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

The bot will start along with the live dashboard. Access the dashboard at:
```
http://localhost:3000
```

## Live Dashboard

The bot includes a real-time web dashboard that provides:

- **Live Conversation Monitoring**: See all active support threads with message counts and timestamps
- **Error Tracking**: View recent errors with stack traces
- **Feedback Analytics**: Track user satisfaction with thumbs up/down reactions
- **Real-time Statistics**: Active conversations, total messages, error count, and feedback count
- **Auto-refresh**: WebSocket-powered live updates without page reloads

### Dashboard Features

- Click on any conversation to expand and view recent messages
- Auto-scroll toggle for error logs
- Real-time connection status indicator
- Responsive design for desktop and mobile

## Using the /end Command

Users or moderators can end a support conversation using the `/end` slash command:

1. Type `/end` in any support thread
2. The bot will prompt for feedback with reaction buttons (👍 or 👎)
3. User clicks a reaction to provide feedback
4. The thread is automatically locked and archived
5. Feedback is recorded in the dashboard

This helps track resolution rates and gather user satisfaction data.

## How It Works

1. **User posts in support channel**: When a user posts a message in the designated support channel, the bot automatically creates a thread
2. **Thread creation**: A new thread is created with the title "Support: [username]"
3. **Thread permissions**: The thread is locked so only the original poster can send messages (others can read). This ensures 1-on-1 support conversations
4. **AI processes the request**: The bot uses Claude AI with the loaded documentation to generate a helpful response
5. **Conversation continues**: The user can continue asking questions in the thread, and the bot maintains context
6. **Multiple threads**: The bot can handle multiple support threads simultaneously using a queue system
7. **Failsafe validation**: As an additional safeguard, the bot only responds to messages from the original poster

## Configuration Options

| Variable | Description | Default |
|----------|-------------|---------|
| `DISCORD_TOKEN` | Your Discord bot token | Required |
| `DISCORD_CLIENT_ID` | Your Discord application client ID | Required |
| `SUPPORT_CHANNEL_ID` | Channel ID to monitor for support requests | Required |
| `ANTHROPIC_API_KEY` | Your Anthropic API key | Required |
| `AI_MODEL` | Claude model to use | `claude-3-5-sonnet-20241022` |
| `MAX_CONVERSATION_HISTORY` | Number of messages to keep in memory | `10` |
| `BOT_NAME` | Name of the bot | `Support Bot` |
| `DASHBOARD_PORT` | Port for the live dashboard web server | `3000` |

## Customizing the AI Behavior

You can customize how the AI responds by editing the system prompt in `src/services/aiService.js`:

```javascript
buildSystemPrompt() {
  return `Your custom instructions here...`;
}
```

## Architecture

- **`src/index.js`**: Entry point, loads configuration, starts bot and dashboard
- **`src/bot.js`**: Main bot logic, event handlers, slash commands
- **`src/services/aiService.js`**: Claude AI integration
- **`src/utils/conversationManager.js`**: Manages conversation history and context
- **`src/utils/docsManager.js`**: Loads and manages support documentation
- **`src/utils/messageQueue.js`**: Handles concurrent message processing
- **`src/dashboard/server.js`**: Express server with WebSocket for live dashboard
- **`src/dashboard/public/index.html`**: Dashboard web interface
- **`src/registerCommands.js`**: Script to register Discord slash commands
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