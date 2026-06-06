const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'frontend/src');

const replacements = [
  { search: /(?<!dark:)bg-zinc-950/g, replace: 'bg-zinc-50 dark:bg-zinc-950' },
  { search: /(?<!dark:)bg-zinc-900/g, replace: 'bg-white dark:bg-zinc-900' },
  { search: /(?<!dark:)bg-zinc-800/g, replace: 'bg-zinc-100 dark:bg-zinc-800' },
  { search: /(?<!dark:)border-zinc-800/g, replace: 'border-zinc-200 dark:border-zinc-800' },
  { search: /(?<!dark:)border-zinc-700/g, replace: 'border-zinc-300 dark:border-zinc-700' },
  { search: /(?<!dark:)text-zinc-50\b/g, replace: 'text-zinc-900 dark:text-zinc-50' },
  { search: /(?<!dark:)text-zinc-100/g, replace: 'text-zinc-800 dark:text-zinc-100' },
  { search: /(?<!dark:)text-zinc-200/g, replace: 'text-zinc-700 dark:text-zinc-200' },
  { search: /(?<!dark:)text-zinc-300/g, replace: 'text-zinc-600 dark:text-zinc-300' },
  { search: /(?<!dark:)text-zinc-400/g, replace: 'text-zinc-500 dark:text-zinc-400' },
];

function processDirectory(dirPath) {
  const files = fs.readdirSync(dirPath);

  for (const file of files) {
    const fullPath = path.join(dirPath, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      processDirectory(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      let original = content;

      for (const { search, replace } of replacements) {
        content = content.replace(search, replace);
      }

      if (content !== original) {
        fs.writeFileSync(fullPath, content, 'utf8');
        console.log(`Updated: ${fullPath}`);
      }
    }
  }
}

processDirectory(DIR);
console.log('Done.');
