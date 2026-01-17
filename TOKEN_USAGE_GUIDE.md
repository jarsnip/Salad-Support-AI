# Token Usage Guide - Salad Support AI

## 🎯 **Current Setup (Claude Haiku 4.5)**

### What are Tokens?
- 1 token ≈ 4 characters or ¾ of a word
- Example: "Hello, how are you?" = ~5 tokens

### Your Bot's Token Usage
```
System Prompt:         ~200 tokens
User Query:            ~20 tokens
Conversation History:  ~200 tokens
Documentation (avg):   ~4,000 tokens (10 relevant docs)
Max AI Response:       2,048 tokens
─────────────────────────────────────
Total Input:          ~4,420 tokens
Total Output:         ~2,048 tokens
```

---

## 💰 **Current Costs (Claude Haiku 4.5)**

### Pricing
- **Input:** $0.25 per 1M tokens
- **Output:** $1.25 per 1M tokens

### Cost Per Query
```
Input:  4,420 tokens × $0.25 / 1M = $0.0011
Output: 2,048 tokens × $1.25 / 1M = $0.0026
────────────────────────────────────────────
Total: $0.0037 per query (~$0.004)
```

### With $5 Free Credits
- **Queries Available:** ~1,350 queries
- **At 10 queries/day:** ~135 days (4.5 months)
- **At 50 queries/day:** ~27 days
- **At 200 queries/day:** ~7 days

---

## 📊 **Model Comparison**

| Model | Cost/Query | Quality | Speed | Free Credits Gets You |
|-------|-----------|---------|-------|----------------------|
| **Haiku 4.5** ⭐ (Current) | $0.004 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ | ~1,350 queries |
| Sonnet 4 | $0.050 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐⭐ | ~100 queries |
| Opus 4.5 | $0.250 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | ~20 queries |
| Gemini 2.0 Flash | FREE* | ⭐⭐⭐ | ⭐⭐⭐⭐⭐ | 1,500/day free |

*Gemini: Free tier with rate limits (15 req/min), requires code changes

---

## 📈 **Monthly Cost Estimates**

### Low Activity (10 queries/day = 300/month)
- **Haiku:** $1.20/month
- **Sonnet:** $15/month
- **Gemini:** FREE

### Medium Activity (50 queries/day = 1,500/month)
- **Haiku:** $6/month
- **Sonnet:** $75/month
- **Gemini:** FREE

### High Activity (200 queries/day = 6,000/month)
- **Haiku:** $24/month
- **Sonnet:** $300/month
- **Gemini:** FREE or $6/month

---

## ⚡ **Optimization Impact**

### Before Optimizations
- Loading all 199 docs: ~84,000 tokens
- Cost per query: $0.285 (with Sonnet)
- Free tier: ~18 queries

### After Optimizations
- Loading top 10 docs: ~4,000 tokens
- Cost per query: $0.004 (with Haiku)
- Free tier: ~1,350 queries

**Result: 95% token reduction, 98.6% cost reduction!**

---

## 🎯 **When Will You Run Out?**

### Free Tier ($5)
| Usage | Days Until Depleted |
|-------|-------------------|
| 5 queries/day | ~270 days |
| 10 queries/day | ~135 days |
| 25 queries/day | ~54 days |
| 50 queries/day | ~27 days |
| 100 queries/day | ~14 days |
| 200 queries/day | ~7 days |

---

## 💡 **Cost-Saving Tips**

### 1. Reduce Max Response Tokens
```javascript
// In aiService.js
max_tokens: 1024  // Currently: 2048
```
**Saves:** 50% on output tokens (~$0.001/query)

### 2. Reduce Max Results
```javascript
// In docsManager.js
this.maxResults = 5;  // Currently: 10
```
**Saves:** ~40% on input tokens (~$0.0004/query)

### 3. Implement Rate Limiting
Limit users to 5-10 queries per hour to prevent abuse.

### 4. Use Gemini for Simple Queries
Switch to Gemini 2.0 Flash for FREE tier (requires code changes).

---

## 🔧 **Monitoring Usage**

### Check Your Usage
1. Go to https://console.anthropic.com/
2. Click "Usage" tab
3. View daily/monthly token consumption
4. Set up billing alerts

### Add Token Logging (Optional)
```javascript
// In aiService.js after API call
console.log(`📊 Tokens - Input: ${response.usage.input_tokens}, Output: ${response.usage.output_tokens}`);
```

---

## 📋 **Quick Reference**

### Current Model
```bash
AI_MODEL=claude-haiku-4-5-20251001
```

### Switch to Sonnet (Better Quality, 12.5x More Expensive)
```bash
AI_MODEL=claude-sonnet-4-20250514
```

### Switch to Opus (Best Quality, 62.5x More Expensive)
```bash
AI_MODEL=claude-opus-4-5-20251101
```

---

## ✅ **Recommendations**

### For Most Users
1. ✅ **Keep Haiku 4.5** - Excellent quality for support, very cheap
2. ✅ **Monitor usage weekly** - Check console.anthropic.com
3. ✅ **Add billing proactively** - Don't wait for free credits to run out
4. ✅ **Budget $5-10/month** for moderate usage

### If You Need Better Quality
- Switch to Sonnet 4 for complex troubleshooting
- Cost will increase to ~$75/month (50 queries/day)

### If You Need Free/Cheaper
- Switch to Gemini 2.0 Flash (100% free up to 1,500 queries/day)
- Requires code changes (~1-2 hours)
- See `AI_MODELS_COMPARISON.md` for instructions

---

## 🎉 **Summary**

**Your Current Setup (Haiku 4.5):**
- ✅ $0.004 per query
- ✅ ~1,350 queries on $5 free tier
- ✅ Excellent quality for support bot
- ✅ Very fast responses
- ✅ $6/month for 1,500 queries

**Next Steps:**
1. Test your bot with real queries
2. Monitor usage for 1 week
3. Add billing if needed
4. Adjust settings based on usage

---

**Last Updated:** 2026-01-17
**Current Model:** Claude Haiku 4.5
**Status:** Production Ready ✅
