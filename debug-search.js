import docsManager from './src/utils/docsManager.js';

console.log('\n🔍 DEBUG: Testing Search Functionality\n');
console.log('='.repeat(60));

const testQuery = "What are container jobs?";

console.log(`\nQuery: "${testQuery}"\n`);

// Check if embeddings were generated
console.log(`Embeddings initialized: ${docsManager.embeddings.size > 0}`);
console.log(`Total embeddings: ${docsManager.embeddings.size}`);

// Extract key phrases from query
const queryPhrases = docsManager.extractKeyPhrases(testQuery);
console.log(`\nQuery key phrases:`, queryPhrases);

// Find docs with "container" tag
const containerDocs = [];
for (const [name, doc] of docsManager.docs) {
  if (doc.tags && doc.tags.includes('container')) {
    containerDocs.push(name);
  }
}
console.log(`\nDocs with 'container' tag: ${containerDocs.length}`);
console.log(`First 5:`, containerDocs.slice(0, 5));

// Test semantic search directly
console.log(`\n--- Testing semanticSearch() ---`);
const semanticResults = docsManager.semanticSearch(testQuery);
console.log(`Semantic results: ${semanticResults.length}`);
if (semanticResults.length > 0) {
  console.log(`Top 3 results:`);
  semanticResults.slice(0, 3).forEach((doc, i) => {
    console.log(`  ${i + 1}. ${doc.name}`);
    console.log(`     Tags: ${doc.tags?.join(', ') || 'none'}`);
  });
}

// Test the main search function
console.log(`\n--- Testing searchDocs() ---`);
const searchResults = docsManager.searchDocs(testQuery);
console.log(`Search results: ${searchResults.length}`);
if (searchResults.length > 0) {
  console.log(`Top 3 results:`);
  searchResults.slice(0, 3).forEach((doc, i) => {
    console.log(`  ${i + 1}. ${doc.name}`);
  });
}

// Test getRelevantDocsAsContext
console.log(`\n--- Testing getRelevantDocsAsContext() ---`);
const context = docsManager.getRelevantDocsAsContext(testQuery);
const docCount = context.split('## ').length - 1;
console.log(`Docs in context: ${docCount}`);
console.log(`Context length: ${context.length} characters`);
console.log(`First 200 chars:`, context.substring(0, 200));

console.log('\n' + '='.repeat(60));
