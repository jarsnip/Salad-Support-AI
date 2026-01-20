// URL Mapper - Maps local documentation to public support URLs
// Configure this object to map your local docs to their public URLs

const urlMappings = {
  // Add your URL mappings here in the format:
  // 'local/doc/path': 'https://your-support-site.com/article/123',

  // Example:
  // 'getting-started': 'https://example.com/help/getting-started',
  // 'faq/account': 'https://example.com/help/faq/account',
};

class URLMapper {
  constructor() {
    this.mappings = urlMappings;
  }

  // Get support.salad.com URL for a local doc path
  getPublicURL(docName) {
    // Try exact match first, but skip if it's a category page
    if (this.mappings[docName]) {
      const url = this.mappings[docName];
      // Skip category pages - we only want specific articles
      if (!url.includes('/collection/')) {
        return url;
      }
    }

    // Try partial matches (skip category-only matches)
    for (const [key, url] of Object.entries(this.mappings)) {
      // Skip category pages (they contain '/collection/')
      if (url.includes('/collection/')) {
        continue;
      }
      if (docName.includes(key) || key.includes(docName)) {
        return url;
      }
    }

    // If no specific article found, return null (no URL to link)
    // This prevents broken or irrelevant links
    return null;
  }

  // Add reference links to documentation context
  appendURLsToContext(docs) {
    const docWithURLs = docs.map(doc => {
      const url = this.getPublicURL(doc.name);
      return {
        ...doc,
        publicURL: url
      };
    });
    return docWithURLs;
  }

  // Build context string with URLs appended
  buildContextWithURLs(title, docs) {
    let context = `${title}:\n\n`;

    for (const doc of docs) {
      const url = this.getPublicURL(doc.name);
      context += `## ${doc.name}\n`;
      context += `${doc.content}\n\n`;
      context += `🔗 Read more: ${url}\n\n`;
      context += `---\n\n`;
    }

    return context;
  }
}

export default new URLMapper();
