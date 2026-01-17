# Project Structure

```
Salad Support AI/
├── docs/                          # Support documentation files (auto-loaded by bot)
│   ├── getting-started.md         # Getting started guide
│   ├── common-issues.md           # Common issues and solutions
│   ├── faq.md                     # Frequently asked questions
│   └── api-usage.md               # API documentation
│
├── src/                           # Source code
│   ├── index.js                   # Entry point - loads config and starts bot
│   ├── bot.js                     # Main bot logic and Discord event handlers
│   │
│   ├── services/
│   │   └── aiService.js           # Claude AI integration and response generation
│   │
│   └── utils/
│       ├── conversationManager.js # Manages conversation history per thread
│       ├── docsManager.js         # Loads and searches support documentation
│       ├── messageQueue.js        # Handles concurrent message processing
│       └── logger.js              # Logging utility
│
├── .env                           # Environment variables (create from .env.example)
├── .env.example                   # Environment variables template
├── .gitignore                     # Git ignore file
├── package.json                   # Node.js dependencies and scripts
├── README.md                      # Main documentation
├── SETUP.md                       # Quick setup guide
└── PROJECT_STRUCTURE.md           # This file
```

## Core Components

### Entry Point (`src/index.js`)
- Loads environment variables
- Validates configuration
- Initializes and starts the bot
- Handles graceful shutdown

### Bot (`src/bot.js`)
- Discord client setup with required intents
- Event handlers for messages and threads
- Automatic thread creation for support messages
- Message routing and processing
- Integration with AI service and conversation manager

### AI Service (`src/services/aiService.js`)
- Claude AI integration using Anthropic SDK
- System prompt configuration
- Context injection (docs + conversation history)
- Response generation
- Streaming support (for future enhancements)
- Error handling and rate limiting

### Conversation Manager (`src/utils/conversationManager.js`)
- Maintains conversation history per thread
- Message storage with timestamps
- History truncation to manage memory
- Conversation cleanup for old threads
- Formats conversation context for AI

### Docs Manager (`src/utils/docsManager.js`)
- Loads all markdown files from `docs/` folder
- Provides search functionality
- Returns relevant documentation based on query
- Hot-reload capability
- Formats docs for AI context

### Message Queue (`src/utils/messageQueue.js`)
- Manages concurrent message processing
- Prevents duplicate processing
- FIFO queue with configurable concurrency
- Queue statistics and monitoring

## Data Flow

1. **User posts in support channel** → Creates thread
2. **Thread created** → Bot sends initial message
3. **Message added to queue** → Waits for processing slot
4. **Queue processes message** → Fetches conversation history
5. **AI service called** → Injects docs + conversation context
6. **Claude generates response** → Based on documentation
7. **Response sent to thread** → User receives answer
8. **Conversation continues** → All messages maintain context

## Environment Variables

| Variable | Purpose | Required |
|----------|---------|----------|
| `DISCORD_TOKEN` | Discord bot authentication | ✓ |
| `SUPPORT_CHANNEL_ID` | Channel to monitor | ✓ |
| `ANTHROPIC_API_KEY` | Claude AI authentication | ✓ |
| `AI_MODEL` | Claude model version | ✗ |
| `MAX_CONVERSATION_HISTORY` | Messages to remember | ✗ |
| `BOT_NAME` | Bot display name | ✗ |

## Key Features

### Thread-Based Support
- Each support message gets its own thread
- Keeps main channel clean
- Maintains conversation context
- Easy to track and manage

### AI-Powered Responses
- Uses Claude AI for intelligent responses
- Trained on your documentation
- Context-aware conversations
- Natural language understanding

### Documentation Bank
- Markdown-based knowledge base
- Automatic loading on startup
- Easy to update and maintain
- Searchable and indexed

### Queue System
- Handles multiple requests simultaneously
- Prevents overwhelming the API
- Configurable concurrency (default: 3)
- Duplicate request prevention

### Memory Management
- Per-thread conversation history
- Automatic cleanup of old data
- Configurable history depth
- Efficient memory usage

## Customization Points

### Modify AI Behavior
Edit `src/services/aiService.js` → `buildSystemPrompt()`

### Change Queue Concurrency
Edit `src/bot.js` → `new MessageQueue(..., 3)` (change the 3)

### Adjust History Length
Edit `.env` → `MAX_CONVERSATION_HISTORY=10`

### Add Custom Event Handlers
Edit `src/bot.js` → `setupEventHandlers()`

### Modify Documentation Format
Edit `src/utils/docsManager.js` → `getDocsAsContext()`

## Adding New Features

### Example: Add reaction-based feedback

```javascript
// In src/bot.js setupEventHandlers()
this.client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;

  if (reaction.emoji.name === '👍') {
    // Log positive feedback
    console.log('User liked response');
  }
});
```

### Example: Add admin commands

```javascript
// In src/bot.js handleThreadMessage()
if (message.content.startsWith('!admin')) {
  // Check permissions and handle admin commands
}
```

## Performance Considerations

- **Queue limits**: Prevents API overload
- **History truncation**: Manages memory usage
- **Old conversation cleanup**: Runs hourly
- **Concurrent processing**: Default 3, increase for higher volume
- **Documentation caching**: Loaded once at startup

## Security Notes

- Never commit `.env` file (in `.gitignore`)
- Keep API keys secure
- Validate user input before processing
- Rate limiting handled by queue system
- No sensitive data stored in conversation history
