const fs = require('fs');
const content = fs.readFileSync('extracted_api.json', 'utf8');
const regex = /"(\/panel\/api\/[^"]+)"/g;
let match;
const paths = new Set();
while ((match = regex.exec(content)) !== null) {
  paths.add(match[1]);
}
for (const p of paths) {
  if (p.toLowerCase().includes('group') || p.toLowerCase().includes('node') || p.toLowerCase().includes('reseller') || p.toLowerCase().includes('client')) {
    console.log(p);
  }
}
