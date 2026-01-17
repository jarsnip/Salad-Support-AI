import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Function to recursively get all markdown files
function getAllMdFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);

  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);

    if (stat.isDirectory()) {
      getAllMdFiles(filePath, fileList);
    } else if (file.endsWith('.md')) {
      fileList.push(filePath);
    }
  });

  return fileList;
}

// Function to fix links in a file
function fixLinksInFile(filePath) {
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;

  // Pattern to match markdown links with http/https that are NOT already wrapped in <>
  // Matches: [text](http://url) or [text](https://url) but NOT [text](<http://url>)
  const linkPattern = /\[([^\]]+)\]\((https?:\/\/[^\)>]+)\)/g;

  const newContent = content.replace(linkPattern, (match, text, url) => {
    // Check if URL is already wrapped in angle brackets
    if (match.includes(`(<${url}>`)) {
      return match; // Already wrapped, skip
    }
    modified = true;
    return `[${text}](<${url}>)`;
  });

  if (modified) {
    fs.writeFileSync(filePath, newContent, 'utf-8');
    console.log(`✅ Fixed: ${path.relative(docsDir, filePath)}`);
    return 1;
  }

  return 0;
}

// Main execution
const docsDir = path.join(__dirname, 'docs');
const mdFiles = getAllMdFiles(docsDir);

console.log(`\n📝 Found ${mdFiles.length} markdown files\n`);
console.log('🔧 Fixing external links to prevent Discord embeds...\n');

let fixedCount = 0;
mdFiles.forEach(file => {
  fixedCount += fixLinksInFile(file);
});

console.log(`\n✅ Done! Fixed ${fixedCount} files\n`);
