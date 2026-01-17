// URL Mapper - Maps local documentation to support.salad.com URLs

const urlMappings = {
  // FAQ - Jobs
  'faq/jobs/how-does-my-machine-earn-salad-balance': 'https://support.salad.com/article/77-what-is-my-machine-actually-mining',
  'faq/jobs/how-can-i-earn-more-with-salad': 'https://support.salad.com/article/62-how-can-i-earn-more-with-salad',
  'faq/jobs/how-much-can-i-earn-with-salad': 'https://support.salad.com/article/60-how-much-can-i-earn-with-salad',
  'faq/jobs/what-is-bandwidth-sharing': 'https://support.salad.com/article/253-what-is-bandwidth-sharing',
  'faq/jobs/what-is-wsl': 'https://support.salad.com/article/265-what-is-wsl',
  'faq/jobs/how-do-i-get-container-jobs': 'https://support.salad.com/article/263-container-workloads',

  // FAQ - Compatibility
  'faq/compatibility/is-my-machine-compatible-with-salad': 'https://support.salad.com/article/78-is-my-machine-compatible-with-salad',

  // FAQ - Salad App
  'faq/salad-app/is-salad-healthy-for-my-pc-yes': 'https://support.salad.com/article/176-is-salad-healthy-for-my-pc-yes',
  'faq/salad-app/what-are-elevated-permissions-and-should-i-enable-them': 'https://support.salad.com/article/241-what-are-elevated-permissions-and-should-i-enable-them',
  'faq/salad-app/temporary-workload-block': 'https://support.salad.com/article/380-temporary-workload-block',

  // FAQ - Company
  'faq/company/is-salad-legit-or-is-it-a-scam': 'https://support.salad.com/article/203-is-salad-legit-or-is-it-a-scam',

  // Guides - Getting Started
  'guides/getting-started/getting-started-with-salad-the-basics': 'https://support.salad.com/article/135-getting-started-with-salad-the-basics',

  // Guides - Using Salad
  'guides/using-salad/how-predicted-earnings-works': 'https://support.salad.com/article/225-how-predicted-earnings-works',
  'guides/using-salad/star-chef-qualifications-and-benefits': 'https://support.salad.com/article/337-star-chef-qualifications-and-benefits',
  'guides/using-salad/workload-preferences': 'https://support.salad.com/article/326-workload-preferences',

  // Guides - Your PC
  'guides/your-pc/how-to-enable-virtualization-support-on-your-machine': 'https://support.salad.com/article/270-how-to-enable-virtualization-support-on-your-machine',
  'guides/your-pc/enable-virtualization-on-asus-pcs': 'https://support.salad.com/article/277-enable-virtualization-on-asus-pcs',
  'guides/your-pc/enable-virtualization-on-hp-pcs': 'https://support.salad.com/article/273-enable-virtualization-on-hp-pcs',
  'guides/your-pc/enable-virtualization-on-lenovo-pcs': 'https://support.salad.com/article/275-enable-virtualization-on-lenovo-pcs',
  'guides/your-pc/enable-virtualization-by-motherboard-gigabyte': 'https://support.salad.com/article/281-enable-virtualization-by-motherboard-gigabyte',
  'guides/your-pc/how-to-update-the-wsl-kernel-on-your-machine': 'https://support.salad.com/article/352-how-to-update-the-wsl-kernel-on-your-machine',

  // Rewards - Redeeming
  'rewards/redeeming-your-rewards/how-to-redeem-paypal': 'https://support.salad.com/article/612-how-to-redeem-paypal',
  'rewards/redeeming-your-rewards/how-do-i-redeem-my-riot-games-rewards': 'https://support.salad.com/article/260-how-do-i-redeem-my-riot-games-rewards',
  'rewards/redeeming-your-rewards/how-do-i-redeem-my-eneba-gift-cards': 'https://support.salad.com/article/286-how-do-i-redeem-my-eneba-gift-cards',
  'rewards/redeeming-your-rewards/how-do-i-redeem-my-lunar-client-reward': 'https://support.salad.com/article/322-how-do-i-redeem-my-lunar-client-reward',

  // Rewards - FAQ
  'rewards/rewards-faq/i-live-outside-the-us-can-i-still-redeem-rewards-with-salad': 'https://support.salad.com/article/52-i-live-outside-the-us-can-i-still-redeem-rewards-with-salad',
  'rewards/rewards-faq/i-redeemed-an-item-and-havent-gotten-it-yet-whats-going-on': 'https://support.salad.com/article/189-i-redeemed-an-item-and-havene28099t-gotten-it-yet-whate28099s-going-on',
  'rewards/rewards-faq/can-you-add-a-reward-i-want-to-salad': 'https://support.salad.com/article/54-can-you-add-a-reward-i-want-to-salad',
  'rewards/rewards-faq/supported-paypal-countries': 'https://support.salad.com/article/616-supported-paypal-countries',

  // Rewards - Support
  'rewards/rewards-support/i-want-a-refund': 'https://support.salad.com/article/191-i-want-a-refund',
  'rewards/rewards-support/my-reward-code-is-invalid': 'https://support.salad.com/article/190-my-reward-code-is-invalid',

  // Troubleshooting - Antivirus
  'troubleshooting/antivirus/how-to-whitelist-salad-in-windows-defender': 'https://support.salad.com/article/143-how-to-whitelist-salad-in-windows-defender',
  'troubleshooting/antivirus/how-to-whitelist-salad-in-avast-antivirus': 'https://support.salad.com/article/144-how-to-whitelist-salad-in-avast-antivirus',
  'troubleshooting/antivirus/how-to-whitelist-salad-in-mcafee': 'https://support.salad.com/article/146-how-to-whitelist-salad-in-mcafee',
  'troubleshooting/antivirus/how-to-whitelist-salad-in-norton-antivirus': 'https://support.salad.com/article/142-how-to-whitelist-salad-in-norton-antivirus',
  'troubleshooting/antivirus/how-to-whitelist-salad-in-malwarebytes': 'https://support.salad.com/article/141-how-to-whitelist-salad-in-malwarebytes',
  'troubleshooting/antivirus/how-to-whitelist-salad-in-kaspersky': 'https://support.salad.com/article/160-how-to-whitelist-salad-in-kaspersky',
  'troubleshooting/antivirus/how-to-whitelist-salad-in-bitdefender-antivirus-plus': 'https://support.salad.com/article/145-how-to-whitelist-salad-in-bitdefender-antivirus-plus',

  // Troubleshooting - Salad App
  'troubleshooting/salad-app/i-am-having-trouble-connecting-to-the-salad-app': 'https://support.salad.com/article/222-i-am-having-trouble-connecting-to-the-salad-app',
  'troubleshooting/salad-app/general-troubleshooting-tips': 'https://support.salad.com/article/221-general-troubleshooting-tips',
  'troubleshooting/salad-app/unable-to-detect-hardware': 'https://support.salad.com/article/240-unable-to-detect-hardware',

  // Category Links
  'guides': 'https://support.salad.com/collection/27-guides',
  'rewards': 'https://support.salad.com/collection/23-rewards',
  'faq': 'https://support.salad.com/collection/13-faq',
  'troubleshooting': 'https://support.salad.com/collection/32-troubleshooting',
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

    // If no specific article found, return main support page
    // We prefer not linking at all over linking to category pages
    return 'https://support.salad.com';
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
