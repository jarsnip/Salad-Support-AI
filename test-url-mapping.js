import urlMapper from './src/utils/urlMapper.js';

console.log('\n🔍 Testing URL Mapping - Specific Articles Only\n');
console.log('='.repeat(60));

const testCases = [
  { doc: 'faq/jobs/how-does-my-machine-earn-salad-balance', expected: 'article link' },
  { doc: 'troubleshooting/antivirus/how-to-whitelist-salad-in-windows-defender', expected: 'article link' },
  { doc: 'guides/using-salad/star-chef-qualifications-and-benefits', expected: 'article link' },
  { doc: 'some/unmapped/document', expected: 'main support page' },
  { doc: 'faq', expected: 'should NOT return category' }
];

testCases.forEach((test, idx) => {
  const url = urlMapper.getPublicURL(test.doc);
  const isCategory = url.includes('/collection/');
  const isArticle = url.includes('/article/');
  const isMainPage = url === 'https://support.salad.com';

  console.log(`\n${idx + 1}. Doc: ${test.doc}`);
  console.log(`   URL: ${url}`);
  console.log(`   Type: ${isArticle ? '✅ Article' : isCategory ? '❌ Category' : isMainPage ? '⚠️  Main Page' : '?'}`);
  console.log(`   Expected: ${test.expected}`);

  if (isCategory) {
    console.log('   ⚠️  WARNING: Should not return category page!');
  }
});

console.log('\n' + '='.repeat(60));
console.log('\n✅ Test complete! Category pages should NOT appear.\n');
