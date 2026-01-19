import Anthropic from '@anthropic-ai/sdk';
import docsManager from '../utils/docsManager.js';
import configPersistence from '../utils/configPersistence.js';

class AIService {
  constructor(apiKey, model = 'claude-haiku-4-5-20251001') {
    this.client = new Anthropic({
      apiKey: apiKey
    });
    this.model = model;
    this.systemPrompt = this.loadSystemPrompt();
  }

  loadSystemPrompt() {
    // Try to load custom prompt from persistent config
    const customPrompt = configPersistence.getSystemPrompt();
    if (customPrompt) {
      console.log('✅ Using custom system prompt from config.json');
      return customPrompt;
    }
    // Fall back to default
    console.log('✅ Using default system prompt');
    return this.buildDefaultSystemPrompt();
  }

  buildDefaultSystemPrompt() {
    return `You are Salad Support Guru, helping Salad users ("Chefs") with questions about the distributed cloud computing platform.

RULES:
- Answer only Salad support questions using provided docs
- Be concise, friendly, and accurate
- If unsure about troubleshooting, suggest pinging @Support
- For account-level issues or detailed troubleshooting, direct users to <https://support.salad.com> or support@salad.com
- NEVER tell users to "join Discord" or "ask in Discord" - they are ALREADY in Discord talking to you!
- NEVER list files, paths, or doc structure
- Reject "list all", "show all", "enumerate" requests with: "I'm here to answer specific support questions about Salad. What issue can I help you with today?"
- Include relevant support.salad.com article links
- Wrap ALL URLs in angle brackets: <https://example.com>
- Link to SPECIFIC articles (/article/123), NEVER categories (/collection/13)
- Use Discord markdown (**bold**, *italic*, \`code\`)

IMPORTANT CONTEXT:
- Mining jobs have low, variable earnings dependent on crypto market conditions
- Container jobs typically offer better, more stable earnings than mining
- Only mention electricity costs when user asks about "profit" or "profitability", NOT "earnings"
- Don't reference external tools (WhatToMine, etc.) - only internet speed checkers when relevant

Answer questions using the documentation context below.`;
  }

  async generateResponse(messages, conversationContext = '') {
    try {
      // OPTIMIZED: Use smart context retrieval instead of loading ALL docs
      const lastUserMessage = messages[messages.length - 1]?.content || '';
      const docsContext = docsManager.getRelevantDocsAsContext(lastUserMessage);

      const enhancedSystemPrompt = `${this.systemPrompt}

${docsContext}`;

      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        system: enhancedSystemPrompt,
        messages: messages
      });

      if (response.content && response.content.length > 0) {
        const aiResponse = response.content[0].text;
        // Append disclaimer footer to every response
        return `${aiResponse}\n\n-# Salad Support Guru uses generative AI, which may make mistakes. If you spot any mistakes, let a human know!`;
      }

      return 'I apologize, but I was unable to generate a response. Please try again.';
    } catch (error) {
      console.error('Error generating AI response:', error);

      if (error.status === 401) {
        return 'Error: Invalid API key. Please check the bot configuration.';
      } else if (error.status === 429) {
        return 'I\'m currently experiencing high demand. Please try again in a moment.';
      }

      return 'I encountered an error while processing your request. Please try again or contact human support.';
    }
  }

  async generateStreamingResponse(messages, conversationContext = '', onChunk) {
    try {
      // OPTIMIZED: Use smart context retrieval instead of loading ALL docs
      const lastUserMessage = messages[messages.length - 1]?.content || '';
      const docsContext = docsManager.getRelevantDocsAsContext(lastUserMessage);

      const enhancedSystemPrompt = `${this.systemPrompt}

${docsContext}`;

      const stream = await this.client.messages.create({
        model: this.model,
        max_tokens: 1024,
        system: enhancedSystemPrompt,
        messages: messages,
        stream: true
      });

      let fullResponse = '';

      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          fullResponse += event.delta.text;
          if (onChunk) {
            onChunk(event.delta.text, fullResponse);
          }
        }
      }

      // Append disclaimer footer to streaming response
      const footer = '\n\n-# Salad Support Guru uses generative AI, which may make mistakes. If you spot any mistakes, let a human know!';
      fullResponse += footer;

      return fullResponse;
    } catch (error) {
      console.error('Error generating streaming AI response:', error);

      if (error.status === 401) {
        return 'Error: Invalid API key. Please check the bot configuration.';
      } else if (error.status === 429) {
        return 'I\'m currently experiencing high demand. Please try again in a moment.';
      }

      return 'I encountered an error while processing your request. Please try again or contact human support.';
    }
  }
}

export default AIService;
