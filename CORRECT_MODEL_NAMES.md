# Correct AI Model Names Reference

## ✅ Claude Models (Anthropic API)

### **Claude Sonnet 4** (Your current model)
```
AI_MODEL=claude-sonnet-4-20250514
```
Or use alias (auto-updates):
```
AI_MODEL=claude-sonnet-4
```

### **Claude Haiku 4.5** (12x cheaper - RECOMMENDED)
```
AI_MODEL=claude-haiku-4-5-20251001
```
Or use alias (auto-updates):
```
AI_MODEL=claude-haiku-4-5
```

### **Claude Opus 4.5** (Most powerful, 5x more expensive)
```
AI_MODEL=claude-opus-4-5-20251101
```
Or use alias (auto-updates):
```
AI_MODEL=claude-opus-4-5
```

---

## 📋 Quick Comparison

| Model | API Identifier | Cost/Query | Best For |
|-------|---------------|-----------|----------|
| **Haiku 4.5** ⭐ | `claude-haiku-4-5-20251001` | $0.0042 | Support bots (RECOMMENDED) |
| Sonnet 4 | `claude-sonnet-4-20250514` | $0.050 | Complex reasoning |
| Opus 4.5 | `claude-opus-4-5-20251101` | $0.250 | Maximum quality |

---

## 🔄 How to Switch

### Option 1: Edit .env file
```bash
# Open .env file and change:
AI_MODEL=claude-haiku-4-5-20251001
```

### Option 2: Use aliases (auto-updates)
```bash
# Use this if you want automatic updates to latest version:
AI_MODEL=claude-haiku-4-5
```

### Restart your bot
```bash
npm start
```

---

## 🌐 Alternative Models (Require code changes)

### OpenAI GPT-4o-mini (24x cheaper)
```javascript
// Requires OpenAI SDK
model: "gpt-4o-mini"
```

### Google Gemini 2.0 Flash (FREE tier)
```javascript
// Requires Google AI SDK
model: "gemini-2.0-flash-exp"
```

---

## 📊 Model Version History

| Date | Model | Identifier |
|------|-------|-----------|
| Oct 2025 | Haiku 4.5 | `claude-haiku-4-5-20251001` |
| Nov 2025 | Opus 4.5 | `claude-opus-4-5-20251101` |
| May 2025 | Sonnet 4 | `claude-sonnet-4-20250514` |

---

## 🔗 Sources

- [Claude Models Overview](https://docs.anthropic.com/en/docs/about-claude/models)
- [Model Pricing](https://www.anthropic.com/pricing)

---

**Last Updated:** 2026-01-17
