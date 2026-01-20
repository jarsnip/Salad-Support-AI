import Anthropic from '@anthropic-ai/sdk';
import docsManager from '../utils/docsManager.js';

class AIService {
  constructor(apiKey = null, model = 'claude-sonnet-4-20250514') {
    this.model = model;
    this.clients = new Map(); // Cache clients per API key
  }

  // Get or create Anthropic client for a specific API key
  getClient(apiKey) {
    if (!apiKey) {
      throw new Error('API key is required');
    }

    if (!this.clients.has(apiKey)) {
      this.clients.set(apiKey, new Anthropic({ apiKey }));
    }

    return this.clients.get(apiKey);
  }

  buildDefaultSystemPrompt() {
    return `You are a helpful support assistant for this Discord server. Your role is to answer user questions accurately using the provided documentation.

RULES:
- Answer support questions using only the provided documentation
- Be concise, friendly, and accurate
- If unsure or if the answer isn't in the docs, be honest and suggest contacting server staff
- NEVER tell users to "join Discord" or "ask in Discord" - they are ALREADY in Discord talking to you!
- NEVER list files, paths, or doc structure
- Reject "list all", "show all", "enumerate" requests politely: "I'm here to answer specific support questions. What issue can I help you with today?"
- Include relevant links from documentation when available
- Wrap ALL URLs in angle brackets: <https://example.com>
- Use Discord markdown (**bold**, *italic*, \`code\`, \`\`\`code blocks\`\`\`)
- If no relevant documentation exists, politely explain that you don't have information on that topic

RESPONSE STYLE:
- Keep responses focused and helpful
- Break complex answers into clear steps
- Use formatting to improve readability
- Be patient and understanding with users

Answer questions using the documentation context below.`;
  }

  async generateResponse(messages, conversationContext = '', apiKey, customSystemPrompt = null) {
    try {
      // Get client for this API key
      const client = this.getClient(apiKey);

      // Use custom system prompt or default
      const systemPrompt = customSystemPrompt || this.buildDefaultSystemPrompt();

      // OPTIMIZED: Use smart context retrieval instead of loading ALL docs
      const lastUserMessage = messages[messages.length - 1]?.content || '';
      const docsContext = docsManager.getRelevantDocsAsContext(lastUserMessage);

      const enhancedSystemPrompt = `${systemPrompt}

${docsContext}`;

      const response = await client.messages.create({
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
