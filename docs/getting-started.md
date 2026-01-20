# Getting Started

Welcome to the support documentation! This is an example documentation file.

## Overview

This Discord bot uses AI to automatically answer support questions based on your documentation. Add your own markdown (.md) or text (.txt) files to the `docs/` folder to create your knowledge base.

## How It Works

1. **Users post in support channel** - When a user sends a message in your designated support channel, the bot creates a private thread
2. **AI responds** - The bot uses Claude AI to analyze your documentation and provide helpful answers
3. **Conversation continues** - Users can ask follow-up questions in their thread
4. **Admin tools** - Use `/end` to close threads, `/block` to ban users, and more

## Adding Documentation

1. Create `.md` or `.txt` files in the `docs/` folder
2. Organize by topic (e.g., `faq/`, `guides/`, `troubleshooting/`)
3. Use clear, descriptive file names
4. Restart the bot to load new docs

### Example Structure

```
docs/
├── getting-started.md
├── faq/
│   ├── account-questions.md
│   └── billing.md
├── guides/
│   ├── setup-guide.md
│   └── advanced-features.md
└── troubleshooting/
    ├── common-issues.md
    └── error-codes.md
```

## Best Practices

- **Be specific**: Detailed answers help the AI provide better responses
- **Use formatting**: Headers, lists, and code blocks improve readability
- **Include examples**: Real examples help users understand better
- **Keep updated**: Regularly review and update your documentation
- **Organize logically**: Group related topics together

## Dashboard

Access the dashboard at `http://localhost:3000` to:
- Monitor active conversations in real-time
- View error logs and spam attempts
- Manage blacklisted users
- Track user feedback
- Configure system settings
- Edit the AI system prompt

## Commands

- **`/end`** - Close a support thread and collect feedback
- **`/block <user> [reason]`** - Permanently block a user from creating threads
- **`/unblock <user>`** - Remove a user from the blacklist

## Need Help?

This is a self-hosted Discord bot. For setup instructions, see the README.md file in the project root.
