import docsManager from './src/utils/docsManager.js';

// Simple token estimation (roughly 4 characters = 1 token for English text)
function estimateTokens(text) {
  return Math.ceil(text.length / 4);
}

console.log('\n📊 DOCUMENTATION TOKEN USAGE ANALYSIS\n');
console.log('='.repeat(60));

// Get stats
const stats = docsManager.getStats();
console.log(`\n📚 Total Documentation Files: ${stats.totalDocs}`);

console.log(`\n📁 Categories:`);
Object.entries(stats.categories).forEach(([category, count]) => {
  console.log(`   - ${category}: ${count} files`);
});

console.log(`\n🏷️  Tags:`);
const sortedTags = Object.entries(stats.tags).sort((a, b) => b[1] - a[1]);
sortedTags.forEach(([tag, count]) => {
  console.log(`   - ${tag}: ${count} files`);
});

// Measure full docs context
console.log(`\n💾 Full Documentation Context:`);
const fullContext = docsManager.getDocsAsContext();
const fullTokens = estimateTokens(fullContext);
console.log(`   Characters: ${fullContext.length.toLocaleString()}`);
console.log(`   Estimated Tokens: ${fullTokens.toLocaleString()}`);

// Test sample queries
console.log(`\n🔍 Sample Query Analysis:\n`);

const testQueries = [
  { query: "My GPU is not working", category: "troubleshooting" },
  { query: "How do I redeem my reward?", category: "rewards" },
  { query: "Cannot download Salad", category: "troubleshooting" },
  { query: "How much can I earn with mining?", category: "earnings" },
  { query: "What are container jobs?", category: "general" }
];

testQueries.forEach((test, idx) => {
  console.log(`${idx + 1}. Query: "${test.query}"`);

  const relevantContext = docsManager.getRelevantDocsAsContext(test.query);
  const relevantTokens = estimateTokens(relevantContext);

  const docsMatched = relevantContext.split('## ').length - 1;

  console.log(`   → Matched ${docsMatched} relevant docs`);
  console.log(`   → Characters: ${relevantContext.length.toLocaleString()}`);
  console.log(`   → Estimated Tokens: ${relevantTokens.toLocaleString()}`);
  console.log(`   → Reduction: ${((1 - relevantTokens/fullTokens) * 100).toFixed(1)}%\n`);
});

// Calculate average API request size
console.log(`\n📊 API Request Analysis:\n`);

const systemPromptTokens = 150; // Approximate base system prompt
const averageQueryTokens = 20;
const conversationHistoryTokens = 200; // Average conversation history
const maxResponseTokens = 2048; // As configured

console.log(`System Prompt: ~${systemPromptTokens} tokens`);
console.log(`User Query: ~${averageQueryTokens} tokens`);
console.log(`Conversation History: ~${conversationHistoryTokens} tokens`);

const testRelevantTokens = estimateTokens(docsManager.getRelevantDocsAsContext("GPU error"));
console.log(`Documentation Context (optimized): ~${testRelevantTokens.toLocaleString()} tokens`);
console.log(`Max Response: ${maxResponseTokens.toLocaleString()} tokens`);

const totalInputTokens = systemPromptTokens + averageQueryTokens + conversationHistoryTokens + testRelevantTokens;
const totalTokensPerRequest = totalInputTokens + maxResponseTokens;

console.log(`\n💰 Cost Per Request Estimate:`);
console.log(`   Input Tokens: ~${totalInputTokens.toLocaleString()}`);
console.log(`   Output Tokens: ~${maxResponseTokens.toLocaleString()}`);
console.log(`   Total per request: ~${totalTokensPerRequest.toLocaleString()} tokens`);

console.log(`\n📈 Optimization Impact:`);
const oldInputTokens = systemPromptTokens + averageQueryTokens + conversationHistoryTokens + fullTokens;
const savings = oldInputTokens - totalInputTokens;
const savingsPercent = (savings / oldInputTokens * 100).toFixed(1);

console.log(`   Before optimization: ${oldInputTokens.toLocaleString()} input tokens`);
console.log(`   After optimization: ${totalInputTokens.toLocaleString()} input tokens`);
console.log(`   Savings: ${savings.toLocaleString()} tokens (${savingsPercent}%)`);

console.log('\n' + '='.repeat(60));
console.log('✅ Analysis Complete\n');
