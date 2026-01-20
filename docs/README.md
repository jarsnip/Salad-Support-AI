# Documentation Folder

This folder contains all the support documentation that the AI bot uses to answer questions.

## How to Add Documentation

1. **Create markdown (.md) or text (.txt) files** in this folder
2. **Organize by topic** using subdirectories (optional but recommended)
3. **Use clear file names** that describe the content
4. **Restart the bot** to load new documentation

## Recommended Structure

```
docs/
├── README.md (this file)
├── getting-started.md
├── faq/
│   ├── account.md
│   ├── billing.md
│   └── technical.md
├── guides/
│   ├── setup.md
│   ├── configuration.md
│   └── advanced-features.md
└── troubleshooting/
    ├── common-issues.md
    ├── error-codes.md
    └── connectivity.md
```

## Writing Tips

### Use Clear Headers

```markdown
# Main Topic

## Subtopic 1

### Specific Question

Answer here...
```

### Include Examples

```markdown
## How to configure the bot

1. Open the `.env` file
2. Set `DISCORD_TOKEN=your_token_here`
3. Save and restart the bot

Example:
\`\`\`
DISCORD_TOKEN=MTA1234567890.ABCDEF.xyz123
\`\`\`
```

### Link Related Topics

```markdown
For more information, see [Setup Guide](guides/setup.md)
```

### Use Lists for Steps

```markdown
To resolve this issue:

1. First, check your connection
2. Then, verify your settings
3. Finally, restart the application
```

## What the Bot Does

The bot:
- Searches all files in this folder
- Uses semantic search to find relevant content
- Provides answers based on your documentation
- Can reference multiple documents in a single answer

## File Formats

- **Markdown (.md)**: Recommended for formatted documentation
- **Plain text (.txt)**: Simple text files without formatting

## Best Practices

✅ **Do:**
- Keep documentation up to date
- Use descriptive file names
- Organize by category
- Include examples and code snippets
- Write clear, concise answers

❌ **Don't:**
- Use special characters in file names
- Create duplicate information across files
- Leave outdated information
- Use overly technical jargon without explanation

## Testing Your Documentation

After adding docs:
1. Restart the bot
2. Ask a test question in Discord
3. Check if the bot finds and uses your documentation
4. Refine your documentation based on results

## Need Help?

See the main README.md in the project root for setup and configuration help.
