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

    // Synonym mapping with broken English variations
    this.synonyms = {
      // Performance issues
      'crash': ['fail', 'stop', 'freeze', 'hang', 'error', 'broke', 'broken', 'not work', 'no work', 'doesnt work', 'wont work'],
      'slow': ['lag', 'laggy', 'performance', 'sluggish', 'slowing', 'takes long time', 'very slow', 'too slow'],
      'freeze': ['hang', 'stuck', 'stop respond', 'not responding', 'froze', 'frozen'],

      // Money/earnings
      'money': ['earnings', 'balance', 'rewards', 'payment', 'cash', 'dollar', 'pay', 'paid', 'payout'],
      'withdraw': ['cash out', 'payout', 'transfer', 'get money', 'take money', 'redeem'],
      'earnings': ['balance', 'money', 'income', 'profit', 'made', 'earned', 'how much'],

      // Installation
      'install': ['setup', 'download', 'get started', 'start use', 'begin', 'instal', 'intall'],
      'download': ['get', 'install', 'fetch', 'grab', 'downlod', 'donwload'],

      // Connection issues
      'disconnect': ['offline', 'connection lost', 'no connection', 'cant connect', 'not connect', 'disconnected'],
      'offline': ['not online', 'no internet', 'connection', 'disconnect', 'cant connect'],

      // Account issues
      'banned': ['suspended', 'blocked', 'locked', 'ban', 'suspend', 'cant login', 'cant access'],
      'login': ['sign in', 'log in', 'access', 'enter', 'cant login', 'cant sign in'],
      'verification': ['verify', 'confirm', 'proof', 'check', 'validated', 'verification'],

      // Hardware
      'gpu': ['graphics card', 'video card', 'nvidia', 'amd', 'radeon', 'gtx', 'rtx'],
      'cpu': ['processor', 'intel', 'amd ryzen', 'ryzen'],

      // Software conflicts
      'antivirus': ['anti virus', 'av', 'defender', 'windows defender', 'firewall', 'security'],
      'firewall': ['blocked', 'blocking', 'security', 'antivirus'],

      // Common broken English patterns
      'not working': ['no work', 'doesnt work', 'dont work', 'not work', 'no working', 'not works'],
      'how to': ['how i', 'how do i', 'how can i', 'how i can', 'what i do'],
      'why': ['y', 'how come', 'reason', 'what reason'],
      'help': ['pls help', 'please help', 'need help', 'help me', 'halp', 'plz'],
      'fix': ['repair', 'solve', 'resolve', 'fixed', 'fixing']
    };

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

  // OPTION 3: Detect tags/topics from content and path (EXPANDED)
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

    // Hardware - expanded
    if (contentLower.match(/gpu|graphics card|video card|nvidia|amd radeon|rtx|gtx/)) tags.add('gpu');
    if (contentLower.match(/cpu|processor|intel|ryzen/)) tags.add('cpu');
    if (contentLower.match(/ram|memory/)) tags.add('ram');
    if (contentLower.match(/driver|drivers/)) tags.add('drivers');

    // Job types - expanded
    if (contentLower.match(/container|docker|workload/)) tags.add('container');
    if (contentLower.match(/mining|miner|crypto/)) tags.add('mining');
    if (contentLower.match(/bandwidth|network speed/)) tags.add('bandwidth');
    if (contentLower.match(/transcoding|rendering/)) tags.add('transcoding');

    // Performance issues - NEW
    if (contentLower.match(/crash|crashing|crashed/)) tags.add('crash');
    if (contentLower.match(/\bslow\b|lag|laggy|performance|sluggish/)) tags.add('performance');
    if (contentLower.match(/freeze|freezing|frozen|hang|stuck/)) tags.add('freeze');
    if (contentLower.match(/overheat|temperature|thermal/)) tags.add('overheating');

    // Connection issues - NEW
    if (contentLower.match(/disconnect|disconnected|disconnecting/)) tags.add('connection');
    if (contentLower.match(/offline|not online|no connection/)) tags.add('offline');
    if (contentLower.match(/internet|network|wifi|ethernet/)) tags.add('network');

    // Common issues - expanded
    if (contentLower.match(/error|fail|failed|failure/)) tags.add('error');
    if (contentLower.match(/download|install|setup|installation/)) tags.add('installation');
    if (contentLower.match(/antivirus|firewall|defender|security software/)) tags.add('antivirus');
    if (contentLower.match(/virtualization|wsl|hyper-v|virtual machine/)) tags.add('virtualization');
    if (contentLower.match(/permission|access denied|administrator/)) tags.add('permissions');

    // Account & earnings - expanded
    if (contentLower.match(/earning|earnings|balance|income/)) tags.add('earnings');
    if (contentLower.match(/account|profile|user/)) tags.add('account');
    if (contentLower.match(/redeem|reward|cash out|withdraw|payout/)) tags.add('rewards');
    if (contentLower.match(/payment|pay|paid|transfer/)) tags.add('payment');
    if (contentLower.match(/\bban\b|banned|suspend|suspended|blocked/)) tags.add('banned');
    if (contentLower.match(/login|log in|sign in|authentication/)) tags.add('login');
    if (contentLower.match(/verif|2fa|two factor/)) tags.add('verification');

    // Settings - expanded
    if (contentLower.match(/settings|configuration|config|preferences/)) tags.add('settings');
    if (contentLower.match(/sleep mode|power sav/)) tags.add('sleep-mode');
    if (contentLower.match(/notification|alert/)) tags.add('notifications');

    // Operating systems - NEW
    if (contentLower.match(/windows|win10|win11/)) tags.add('windows');
    if (contentLower.match(/linux|ubuntu/)) tags.add('linux');
    if (contentLower.match(/mac|macos|osx/)) tags.add('mac');

    // Application issues - NEW
    if (contentLower.match(/not working|doesnt work|won't work|broken/)) tags.add('not-working');
    if (contentLower.match(/update|updating|upgrade/)) tags.add('update');
    if (contentLower.match(/uninstall|remove|delete/)) tags.add('uninstall');

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

  // OPTION 1: Semantic search using key phrases with synonym expansion
  semanticSearch(query) {
    const queryLower = query.toLowerCase();
    const queryPhrases = this.extractKeyPhrases(query);
    const scoredResults = [];

    // Extract individual keywords from query (split by spaces, remove common words)
    const commonWords = ['what', 'how', 'why', 'when', 'where', 'is', 'are', 'do', 'does', 'can', 'the', 'a', 'an', 'to', 'for', 'of', 'in', 'on', 'with'];
    const queryWords = queryLower
      .split(/\s+/)
      .filter(word => word.length > 2 && !commonWords.includes(word));

    // Expand query with synonyms to handle broken English and variations
    const expandedTerms = new Set([...queryWords, queryLower]);

    // Check for multi-word phrases in synonyms first (e.g., "not working", "cant connect")
    for (const [key, synonyms] of Object.entries(this.synonyms)) {
      // Check if the full query or multi-word synonyms match
      if (queryLower.includes(key)) {
        expandedTerms.add(key);
        synonyms.forEach(syn => expandedTerms.add(syn));
      }

      // Check if any synonym phrase is in the query
      for (const syn of synonyms) {
        if (queryLower.includes(syn)) {
          expandedTerms.add(key);
          synonyms.forEach(s => expandedTerms.add(s));
          break;
        }
      }
    }

    // Then check individual words
    for (const word of queryWords) {
      for (const [key, synonyms] of Object.entries(this.synonyms)) {
        // If the word matches a key or any synonym, add all related terms
        if (key === word || synonyms.includes(word)) {
          expandedTerms.add(key);
          synonyms.forEach(syn => expandedTerms.add(syn));
        }
      }
    }

    // Convert expanded terms to array for easier processing
    const expandedWordsArray = Array.from(expandedTerms);

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

      // Check for tag matches with expanded terms (OPTION 3)
      if (doc.tags) {
        doc.tags.forEach(tag => {
          // Check against both original query and expanded terms
          if (queryLower.includes(tag) || expandedWordsArray.includes(tag)) {
            score += 8; // High weight for tag matches
          }
        });
      }

      // Individual keyword matching using EXPANDED terms (handles synonyms)
      expandedWordsArray.forEach(word => {
        if (contentLower.includes(word)) {
          score += 4; // Medium-high weight for keyword in content
        }
        if (nameLower.includes(word)) {
          score += 6; // Higher weight for keyword in filename
        }
      });

      // Bonus for title/name exact matches (original query and expanded)
      if (nameLower.includes(queryLower)) {
        score += 15;
      }

      // Additional bonus if any expanded term is in the name
      expandedWordsArray.forEach(term => {
        if (nameLower.includes(term) && term !== queryLower) {
          score += 3; // Bonus for synonym matches in name
        }
      });

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
