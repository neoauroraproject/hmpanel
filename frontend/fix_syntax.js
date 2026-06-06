const fs = require('fs');
const path = 'src/app/s/[id]/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// Replace the invalid expressions
content = content.replace(/\$\{ts\.card\.split\(' '\)\[0\]\}/g, '${ts.cardBg}');
content = content.replace(/card: 'bg-\[\#121319\] border-zinc-800\/80'/g, "cardBg: 'bg-[#121319]', card: 'bg-[#121319] border-zinc-800/80'");
content = content.replace(/card: 'bg-white border-zinc-200 shadow-lg'/g, "cardBg: 'bg-white', card: 'bg-white border-zinc-200 shadow-lg'");
content = content.replace(/card: 'bg-slate-900 border-slate-800\/80'/g, "cardBg: 'bg-slate-900', card: 'bg-slate-900 border-slate-800/80'");
content = content.replace(/card: 'bg-emerald-900 border-emerald-800\/80'/g, "cardBg: 'bg-emerald-900', card: 'bg-emerald-900 border-emerald-800/80'");
content = content.replace(/card: 'bg-indigo-900 border-indigo-800\/80'/g, "cardBg: 'bg-indigo-900', card: 'bg-indigo-900 border-indigo-800/80'");

// The fallback object at the end
content = content.replace(/bg: '\$\{ts.bg\}', card: '\$\{ts.cardBg\} border-zinc-800\/80'/g, "bg: '${ts.bg}', cardBg: '${ts.cardBg}', card: '${ts.cardBg} border-zinc-800/80'");

// Also need to add cardBg: 'bg-[#121319]' to the fallback object directly because it's literal
content = content.replace(/bg: 'bg-\[\#0a0a0c\]', card: 'bg-\[\#121319\] border-zinc-800\/80'/g, "bg: 'bg-[#0a0a0c]', cardBg: 'bg-[#121319]', card: 'bg-[#121319] border-zinc-800/80'");

fs.writeFileSync(path, content);
console.log('Fixed');
