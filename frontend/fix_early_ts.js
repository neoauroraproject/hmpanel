const fs = require('fs');
const path = 'src/app/s/[id]/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// Replace the first two instances of ts.bg in loading and error screens back to bg-[#0a0a0c]
let matchCount = 0;
content = content.replace(/\$\{ts\.bg\}/g, (match) => {
  matchCount++;
  if (matchCount <= 2) {
    return 'bg-[#0a0a0c]';
  }
  return match;
});

content = content.replace(/\$\{ts\.heading\}/g, (match, offset, fullContent) => {
  // If it's before the definition of `ts`
  if (offset < fullContent.indexOf('const ts = {')) {
    return 'text-white';
  }
  return match;
});

// For line 449 error: error TS2304: Cannot find name 'ts'
// I will just replace all ${ts.*} after the closing brace of the component if any. Wait, the component ends at line 395? No, total lines were 430.
// Let's check where the error at line 449 comes from.
// Oh, the `const themeLogic` was injected at `const used = up + down;` which is line 60.

fs.writeFileSync(path, content);
console.log('Fixed early ts usage');
