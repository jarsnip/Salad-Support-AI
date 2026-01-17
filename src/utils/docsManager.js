import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Anthropic from '@anthropic-ai/sdk';
import urlMapper from './urlMapper.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class DocsManager {
  constructor() {
    this.docs = new Map();
    this.docsPath = path.join(__dirname, '../../docs');
    this.embeddings = new Map(); // Store embeddings for semantic search
    this.anthropicClient = null; // Will be initialized if API key is available
    this.maxResults = 10; // Option 4: Limit search results to top 10
    this.loadDocs();
    this.initializeEmbeddings();
  }

  // OPTION 3: Extract category from file path for metadata
  extractCategory(filePath) {
    const relativePath = path.relative(this.docsPath, filePath);
    const parts = relativePath.split(path.sep);

    // First folder is the main category
    if (parts.length > 1) {
      return parts[0];
    }
    return 'general';
  }

  // Extract subcategory from file path
  extractSubcategory(filePath) {
    const relativePath = path.relative(this.docsPath, filePath);
    const parts = relativePath.split(path.sep);

    // Second folder is the subcategory
    if (parts.length > 2) {
      return parts[1];
    }
    return null;
  }

  // OPTION 3: Detect tags/topics from content and path
  extractTags(content, filePath) {
    const tags = new Set();
    const relativePath = path.relative(this.docsPath, filePath).toLowerCase();

    // Category-based tags
    if (relativePath.includes('troubleshooting')) tags.add('troubleshooting');
    if (relativePath.includes('faq')) tags.add('faq');
    if (relativePath.includes('guide')) tags.add('guide');
    if (relativePath.includes('reward')) tags.add('rewards');

    // Topic-based tags from path and content
    const contentLower = content.toLowerCase();

    // Hardware
    if (contentLower.includes('gpu') || relativePath.includes('gpu')) tags.add('gpu');
    if (contentLower.includes('cpu') || relativePath.includes('cpu')) tags.add('cpu');

    // Job types
    if (contentLower.includes('container') || contentLower.includes('workload')) tags.add('container');
    if (contentLower.includes('mining') || contentLower.includes('miner')) tags.add('mining');
    if (contentLower.includes('bandwidth')) tags.add('bandwidth');

    // Common issues
    if (contentLower.includes('error') || contentLower.includes('fail')) tags.add('error');
    if (contentLower.includes('download') || contentLower.includes('install')) tags.add('installation');
    if (contentLower.includes('antivirus') || contentLower.includes('firewall')) tags.add('antivirus');
    if (contentLower.includes('virtualization') || contentLower.includes('wsl')) tags.add('virtualization');

    // Account & earnings
    if (contentLower.includes('earning') || contentLower.includes('balance')) tags.add('earnings');
    if (contentLower.includes('account') || contentLower.includes('login')) tags.add('account');
    if (contentLower.includes('redeem') || contentLower.includes('reward')) tags.add('rewards');

    // Settings
    if (contentLower.includes('settings') || contentLower.includes('config')) tags.add('settings');
    if (contentLower.includes('sleep mode')) tags.add('sleep-mode');

    return Array.from(tags);
  }

  loadDocs() {
    try {
      if (!fs.existsSync(this.docsPath)) {
        console.log('Creating docs directory...');
        fs.mkdirSync(this.docsPath, { recursive: true });
        return;
      }

      const docFiles = this.getAllDocFiles(this.docsPath);

      console.log(`Loading ${docFiles.length} documentation files...`);

      for (const filePath of docFiles) {
        const content = fs.readFileSync(filePath, 'utf-8');
        const relativePath = path.relative(this.docsPath, filePath);
        const docName = relativePath.replace(/\\/g, '/').replace(/\.(md|txt)$/, '');

        // OPTION 3: Add metadata to each document
        this.docs.set(docName, {
          name: docName,
          content: content.trim(),
          file: relativePath,
          lastModified: fs.statSync(filePath).mtime,
          category: this.extractCategory(filePath),
          subcategory: this.extractSubcategory(filePath),
          tags: this.extractTags(content, filePath)
        });
      }

      console.log(`Loaded ${this.docs.size} docs with metadata`);
    } catch (error) {
      console.error('Error loading documentation:', error);
    }
  }

  getAllDocFiles(dir) {
    let results = [];
    const items = fs.readdirSync(dir);

    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        results = results.concat(this.getAllDocFiles(fullPath));
      } else if (item.endsWith('.md') || item.endsWith('.txt')) {
        results.push(fullPath);
      }
    }

    return results;
  }

  // OPTION 1: Initialize embeddings for semantic search
  async initializeEmbeddings() {
    try {
      // Only initialize if API key is available
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) {
        console.log('⚠️  No API key found - semantic search disabled');
        return;
      }

      this.anthropicClient = new Anthropic({ apiKey });

      // Generate embeddings for all docs
      console.log('🔄 Generating embeddings for semantic search...');
      let count = 0;

      for (const [name, doc] of this.docs) {
        try {
          // Create a summary of the document for embedding
          const embeddingText = `${doc.name}: ${doc.content.substring(0, 500)}`;

          // Note: Claude API doesn't have a dedicated embeddings endpoint
          // We'll use a simpler approach: store key phrases for semantic matching
          const keyPhrases = this.extractKeyPhrases(doc.content);
          this.embeddings.set(name, keyPhrases);
          count++;
        } catch (error) {
          console.error(`Error creating embedding for ${name}:`, error.message);
        }
      }

      console.log(`✅ Generated ${count} embeddings`);
    } catch (error) {
      console.error('Error initializing embeddings:', error.message);
    }
  }

  // Extract key phrases for semantic matching
  extractKeyPhrases(content) {
    const phrases = new Set();
    const contentLower = content.toLowerCase();

    // Common phrases and their variations
    const phrasePatterns = [
      // Problems
      { pattern: /can'?t|cannot|unable to|won'?t|not working|fails?|error/g, key: 'problem' },
      { pattern: /how (to|do|can)/g, key: 'how-to' },
      { pattern: /why (is|does|do|am)/g, key: 'why' },
      { pattern: /what (is|are|does)/g, key: 'what' },

      // Actions
      { pattern: /install|download|setup|configure/g, key: 'installation' },
      { pattern: /earn|earning|balance|payout/g, key: 'earnings' },
      { pattern: /redeem|reward|purchase|buy/g, key: 'rewards' },
      { pattern: /login|account|password|email/g, key: 'account' },

      // Hardware
      { pattern: /gpu|graphics card|nvidia|amd|radeon/g, key: 'gpu' },
      { pattern: /cpu|processor|intel/g, key: 'cpu' },

      // Job types
      { pattern: /container|docker|workload/g, key: 'container' },
      { pattern: /mining|miner|crypto/g, key: 'mining' },
      { pattern: /bandwidth|network|internet/g, key: 'bandwidth' }
    ];

    phrasePatterns.forEach(({ pattern, key }) => {
      if (pattern.test(contentLower)) {
        phrases.add(key);
      }
    });

    return Array.from(phrases);
  }

  // OPTION 1: Semantic search using key phrases
  semanticSearch(query) {
    const queryLower = query.toLowerCase();
    const queryPhrases = this.extractKeyPhrases(query);
    const scoredResults = [];

    // Extract individual keywords from query (split by spaces, remove common words)
    const commonWords = ['what', 'how', 'why', 'when', 'where', 'is', 'are', 'do', 'does', 'can', 'the', 'a', 'an', 'to', 'for', 'of', 'in', 'on', 'with'];
    const queryWords = queryLower
      .split(/\s+/)
      .filter(word => word.length > 2 && !commonWords.includes(word));

    for (const [name, doc] of this.docs) {
      let score = 0;
      const docPhrases = this.embeddings.get(name) || [];
      const contentLower = doc.content.toLowerCase();
      const nameLower = doc.name.toLowerCase();

      // Match query phrases with document phrases
      queryPhrases.forEach(phrase => {
        if (docPhrases.includes(phrase)) {
          score += 10; // High weight for semantic matches
        }
      });

      // Check for tag matches (OPTION 3)
      if (doc.tags) {
        doc.tags.forEach(tag => {
          if (queryLower.includes(tag) || queryWords.includes(tag)) {
            score += 8; // High weight for tag matches
          }
        });
      }

      // Individual keyword matching (more flexible than full string match)
      queryWords.forEach(word => {
        if (contentLower.includes(word)) {
          score += 4; // Medium-high weight for keyword in content
        }
        if (nameLower.includes(word)) {
          score += 6; // Higher weight for keyword in filename
        }
      });

      // Bonus for title/name exact matches
      if (nameLower.includes(queryLower)) {
        score += 15;
      }

      if (score > 0) {
        scoredResults.push({ doc, score });
      }
    }

    // Sort by score (highest first) and return top results
    scoredResults.sort((a, b) => b.score - a.score);
    return scoredResults.map(r => r.doc);
  }

  // OPTION 3: Filter docs by category
  filterByCategory(category) {
    const results = [];
    for (const doc of this.docs.values()) {
      if (doc.category === category) {
        results.push(doc);
      }
    }
    return results;
  }

  // OPTION 3: Filter docs by tags
  filterByTags(tags) {
    const results = [];
    const tagsArray = Array.isArray(tags) ? tags : [tags];

    for (const doc of this.docs.values()) {
      if (doc.tags && doc.tags.some(tag => tagsArray.includes(tag))) {
        results.push(doc);
      }
    }
    return results;
  }

  reloadDocs() {
    this.docs.clear();
    this.embeddings.clear();
    this.loadDocs();
    this.initializeEmbeddings();
  }

  getAllDocs() {
    return Array.from(this.docs.values());
  }

  getDoc(name) {
    return this.docs.get(name);
  }

  // IMPROVED: Enhanced search with semantic + category filtering
  searchDocs(query, options = {}) {
    const { category = null, tags = null, limit = this.maxResults } = options;

    let results = [];

    // First, filter by category or tags if specified (OPTION 3)
    if (category) {
      results = this.filterByCategory(category);
    } else if (tags) {
      results = this.filterByTags(tags);
    } else {
      // ALWAYS use semantic search (works with or without embeddings)
      // Semantic search has better fallback logic with tag matching and scoring
      results = this.semanticSearch(query);
    }

    // OPTION 4: Limit results to maxResults (default 10)
    return results.slice(0, limit);
  }

  getDocsAsContext() {
    const allDocs = this.getAllDocs();
    if (allDocs.length === 0) {
      return 'No support documentation available.';
    }

    let context = 'SUPPORT DOCUMENTATION:\n\n';

    for (const doc of allDocs) {
      context += `## ${doc.name}\n${doc.content}\n\n---\n\n`;
    }

    return context;
  }

  // IMPROVED: Smart context retrieval using all optimizations
  getRelevantDocsAsContext(messageContent) {
    // Auto-detect category from message (OPTION 3)
    let category = null;
    const messageLower = messageContent.toLowerCase();

    if (messageLower.includes('error') || messageLower.includes('not working') || messageLower.includes('fail')) {
      category = 'troubleshooting';
    } else if (messageLower.includes('how to') || messageLower.includes('guide')) {
      category = 'guides';
    } else if (messageLower.includes('reward') || messageLower.includes('redeem')) {
      category = 'rewards';
    } else if (messageLower.includes('question') || messageLower.includes('what is') || messageLower.includes('why')) {
      category = 'faq';
    }

    // Search with category hint if detected
    const searchResults = this.searchDocs(messageContent, { category });

    if (searchResults.length === 0) {
      // Fallback to broader search without category filter
      const broadResults = this.searchDocs(messageContent);

      if (broadResults.length === 0) {
        return 'No relevant documentation found for this query.';
      }

      return this.buildContext('RELEVANT SUPPORT DOCUMENTATION', broadResults);
    }

    return this.buildContext('RELEVANT SUPPORT DOCUMENTATION', searchResults);
  }

  // Helper to build context string with support.salad.com URLs
  buildContext(title, docs) {
    let context = `${title}:\n\n`;

    for (const doc of docs) {
      const publicURL = urlMapper.getPublicURL(doc.name);
      context += `## ${doc.name}\n`;
      context += `${doc.content}\n\n`;
      context += `🔗 Read more: ${publicURL}\n\n`;
      context += `---\n\n`;
    }

    if (docs.length < this.docs.size) {
      context += '\nNOTE: Additional documentation is available if needed.';
    }

    return context;
  }

  // Utility to get stats
  getStats() {
    const stats = {
      totalDocs: this.docs.size,
      categories: {},
      tags: {}
    };

    for (const doc of this.docs.values()) {
      // Count by category
      if (doc.category) {
        stats.categories[doc.category] = (stats.categories[doc.category] || 0) + 1;
      }

      // Count by tags
      if (doc.tags) {
        doc.tags.forEach(tag => {
          stats.tags[tag] = (stats.tags[tag] || 0) + 1;
        });
      }
    }

    return stats;
  }
}

export default new DocsManager();
