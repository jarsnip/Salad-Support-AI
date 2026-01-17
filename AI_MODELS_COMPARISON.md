# AI Models Comparison for Salad Support Bot

## 📊 Claude Models Comparison

### Claude Sonnet 4 (Current Model) - `claude-sonnet-4-20250514`
**Pricing:**
- Input: $3.00 per 1M tokens
- Output: $15.00 per 1M tokens

**Capabilities:**
- ⭐⭐⭐⭐⭐ Best reasoning and accuracy
- ⭐⭐⭐⭐⭐ Excellent instruction following
- ⭐⭐⭐⭐ Good speed (moderate)
- Context window: 200K tokens
- Best for: Complex support queries, detailed troubleshooting

**Cost per Query (with optimizations):**
- ~$0.05 per query
- $5 free credits = ~100 queries

---

### Claude Haiku 4.5 - `claude-haiku-4-5-20251001`
**Pricing:**
- Input: $0.25 per 1M tokens (12x cheaper!)
- Output: $1.25 per 1M tokens (12x cheaper!)

**Capabilities:**
- ⭐⭐⭐⭐ Very good reasoning (slightly less than Sonnet)
- ⭐⭐⭐⭐ Good instruction following
- ⭐⭐⭐⭐⭐ Extremely fast
- Context window: 200K tokens
- Best for: Standard support queries, FAQ responses

**Cost per Query (with optimizations):**
- Input: 6,286 tokens × $0.25 / 1M = $0.0016
- Output: 2,048 tokens × $1.25 / 1M = $0.0026
- **Total: ~$0.0042 per query (12x cheaper than Sonnet!)**
- $5 free credits = ~1,190 queries

**Model Aliases:**
- Latest version: `claude-haiku-4-5-20251001`
- Alias: `claude-haiku-4-5` (auto-updates to latest)

**Recommendation:** ✅ **Haiku is EXCELLENT for support bots!**
- 90% of support queries don't need Sonnet's power
- 12x cost reduction with minimal quality loss
- Much faster responses (better user experience)

---

### Claude Opus 4 - `claude-opus-4-5-20251101`
**Pricing:**
- Input: $15.00 per 1M tokens (5x more expensive!)
- Output: $75.00 per 1M tokens (5x more expensive!)

**Capabilities:**
- ⭐⭐⭐⭐⭐ Best reasoning (overkill for support)
- ⭐⭐⭐⭐⭐ Excellent complex problem solving
- ⭐⭐⭐ Slower than Sonnet
- Context window: 200K tokens

**Cost per Query:**
- ~$0.25 per query (5x more expensive than Sonnet)

**Recommendation:** ❌ **Not recommended for support bots** - Too expensive for the use case

---

## 🔄 Alternative AI APIs

### 1. **OpenAI GPT-4o-mini** (Recommended Alternative)
**Pricing:**
- Input: $0.15 per 1M tokens
- Output: $0.60 per 1M tokens

**Capabilities:**
- ⭐⭐⭐⭐ Good reasoning
- ⭐⭐⭐⭐ Fast
- ⭐⭐⭐⭐ Good at following instructions
- Context window: 128K tokens

**Cost per Query:**
- Input: 6,286 × $0.15 / 1M = $0.0009
- Output: 2,048 × $0.60 / 1M = $0.0012
- **Total: ~$0.0021 per query (24x cheaper than Sonnet!)**
- $5 free credits = ~2,380 queries

**Pros:**
- ✅ Very cheap
- ✅ Good quality for support
- ✅ Fast
- ✅ Well-documented API
- ✅ Free tier: $5 credit on new accounts

**Cons:**
- ❌ Requires code changes (different SDK)
- ❌ Slightly lower quality than Claude models
- ⚠️ OpenAI has different rate limits

---

### 2. **OpenAI GPT-4o**
**Pricing:**
- Input: $2.50 per 1M tokens
- Output: $10.00 per 1M tokens

**Capabilities:**
- ⭐⭐⭐⭐⭐ Excellent reasoning (comparable to Sonnet)
- ⭐⭐⭐⭐ Fast
- ⭐⭐⭐⭐⭐ Great instruction following
- Context window: 128K tokens

**Cost per Query:**
- ~$0.036 per query (slightly cheaper than Sonnet)

**Pros:**
- ✅ Similar quality to Claude Sonnet
- ✅ Slightly cheaper
- ✅ Faster

**Cons:**
- ❌ Requires code changes
- ⚠️ Only marginally cheaper (not worth switching)

---

### 3. **Google Gemini 2.0 Flash**
**Pricing:**
- Input: FREE up to 1M requests/day
- Output: FREE up to 1M requests/day
- Paid tier: $0.075 input / $0.30 output per 1M tokens

**Capabilities:**
- ⭐⭐⭐⭐ Good reasoning
- ⭐⭐⭐⭐⭐ Very fast
- ⭐⭐⭐ Decent instruction following
- Context window: 1M tokens (!)

**Cost per Query:**
- **FREE for up to 1,500 queries/day!**
- After free tier: ~$0.0011 per query

**Pros:**
- ✅ FREE tier is extremely generous
- ✅ 1M token context (can load ALL docs if needed)
- ✅ Very fast
- ✅ Good enough for most support queries

**Cons:**
- ❌ Requires code changes (Google AI SDK)
- ❌ Quality can be inconsistent
- ⚠️ Free tier has rate limits (15 requests/minute)

---

### 4. **Groq (Fast Inference for Llama/Mixtral)**
**Pricing:**
- FREE tier: Limited requests
- Paid: ~$0.10-0.20 per 1M tokens

**Capabilities:**
- ⭐⭐⭐ Moderate quality (depends on model)
- ⭐⭐⭐⭐⭐ EXTREMELY fast (fastest inference)
- ⭐⭐⭐ Decent for support

**Cost per Query:**
- ~$0.001-0.002 per query

**Pros:**
- ✅ Cheapest option
- ✅ Blazing fast responses
- ✅ Free tier available

**Cons:**
- ❌ Lower quality than Claude/GPT-4
- ❌ Less reliable for complex queries
- ⚠️ May give incorrect information more often

---

### 5. **Cohere Command-R**
**Pricing:**
- Input: $0.50 per 1M tokens
- Output: $1.50 per 1M tokens

**Capabilities:**
- ⭐⭐⭐⭐ Good reasoning
- ⭐⭐⭐⭐ Fast
- ⭐⭐⭐⭐ RAG-optimized (great for docs!)
- Context window: 128K tokens

**Cost per Query:**
- ~$0.006 per query

**Pros:**
- ✅ Optimized for retrieval-augmented generation (RAG)
- ✅ Good at working with documentation
- ✅ Cheap

**Cons:**
- ❌ Requires code changes
- ⚠️ Less popular, smaller community

---

## 💰 Cost Comparison Summary

| Model | Cost/Query | Quality | Speed | Free Tier Queries |
|-------|-----------|---------|-------|-------------------|
| **Claude Sonnet 4** (current) | $0.050 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ~100 |
| **Claude Haiku 4** ⭐ | $0.0042 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ~1,190 |
| **GPT-4o-mini** ⭐⭐ | $0.0021 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ~2,380 |
| **Gemini 2.0 Flash** ⭐⭐⭐ | FREE/day | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 1,500/day |
| GPT-4o | $0.036 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ~140 |
| Cohere Command-R | $0.006 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | N/A |
| Groq Llama | $0.002 | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | Limited |
| Claude Opus 4 | $0.250 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ~20 |

---

## 🎯 Recommendations by Use Case

### **Best Overall Value: Claude Haiku 4** ⭐
- 12x cheaper than current Sonnet
- Minimal quality loss (still excellent)
- Faster responses
- **EASIEST SWITCH - Just change one line in .env:**
  ```
  AI_MODEL=claude-haiku-4-20250514
  ```

### **Maximum Cost Savings: Google Gemini 2.0 Flash** ⭐⭐⭐
- FREE for up to 1,500 queries/day
- Good enough for most support
- Requires code changes (moderate effort)
- **Best for high-volume, budget-constrained projects**

### **Best Budget Alternative: OpenAI GPT-4o-mini** ⭐⭐
- 24x cheaper than Sonnet
- Good quality
- Well-supported
- Requires code changes
- **Best if you want to leave Anthropic ecosystem**

### **Best Quality (Current): Claude Sonnet 4**
- Highest quality responses
- Best for complex troubleshooting
- Most expensive
- **Keep if budget is not a concern**

---

## 🔄 How to Switch to Claude Haiku (1 Minute)

1. Open your `.env` file
2. Change this line:
   ```
   AI_MODEL=claude-sonnet-4-20250514
   ```
   To:
   ```
   AI_MODEL=claude-haiku-4-5-20251001
   ```
   Or use the alias (auto-updates):
   ```
   AI_MODEL=claude-haiku-4-5
   ```
3. Restart your bot
4. ✅ Done! You're now saving 12x on costs

---

## 🔄 How to Switch to Gemini 2.0 Flash (FREE)

This requires code changes but gives you FREE unlimited queries (with rate limits).

### 1. Install Google AI SDK
```bash
npm install @google/generative-ai
```

### 2. Get Gemini API Key
- Go to https://ai.google.dev/
- Create a new API key (FREE)
- Add to .env:
  ```
  GEMINI_API_KEY=your_key_here
  ```

### 3. Create new service file: `src/services/geminiService.js`
```javascript
import { GoogleGenerativeAI } from '@google/generative-ai';
import docsManager from '../utils/docsManager.js';

class GeminiService {
  constructor(apiKey, model = 'gemini-2.0-flash-exp') {
    this.client = new GoogleGenerativeAI(apiKey);
    this.model = this.client.getGenerativeModel({ model });
    this.systemPrompt = this.buildSystemPrompt();
  }

  buildSystemPrompt() {
    return `You are a helpful support assistant for Salad Technologies' Discord server...`;
  }

  async generateResponse(messages, conversationContext = '') {
    const lastUserMessage = messages[messages.length - 1]?.content || '';
    const docsContext = docsManager.getRelevantDocsAsContext(lastUserMessage);

    const prompt = `${this.systemPrompt}\n\n${docsContext}\n\nUser: ${lastUserMessage}`;

    const result = await this.model.generateContent(prompt);
    return result.response.text();
  }
}

export default GeminiService;
```

### 4. Update bot.js to use Gemini
Change the import and initialization.

---

## 📊 Monthly Cost Estimates

Assuming 50 queries/day (1,500/month):

| Model | Monthly Cost | Yearly Cost |
|-------|-------------|-------------|
| Claude Sonnet 4 | $75 | $900 |
| **Claude Haiku 4** | **$6.30** | **$75.60** |
| GPT-4o-mini | $3.15 | $37.80 |
| **Gemini 2.0 Flash** | **$0** (FREE tier) | **$0-$20** |
| GPT-4o | $54 | $648 |
| Groq | $3 | $36 |

---

## ✅ Final Recommendation

**For your use case (Salad support bot), I recommend:**

### **Option 1: Switch to Claude Haiku 4** (Easiest, 1-minute change)
- Change 1 line in .env
- Save $68.70/month (91% cost reduction)
- Keep excellent quality
- **Do this immediately if budget is a concern**

### **Option 2: Use Gemini 2.0 Flash** (FREE, requires code changes)
- FREE for most support volumes
- Save $75/month (100% cost reduction)
- Requires 1-2 hours of coding
- **Best for high-volume or zero-budget projects**

### **Option 3: Keep Sonnet 4** (Best quality, higher cost)
- No changes needed
- Best possible quality
- $75/month for 1,500 queries
- **Only if quality is paramount and budget allows**

---

**Last Updated:** 2026-01-17
