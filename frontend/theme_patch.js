const fs = require('fs');
const path = 'src/app/s/[id]/page.tsx';
let content = fs.readFileSync(path, 'utf8');

const themeLogic = `
  const currentTheme = portalSettings?.theme || 'Dark';
  const ts = {
    Dark: {
      bg: 'bg-[#0a0a0c]',
      card: 'bg-[#121319] border-zinc-800/80',
      cardHover: 'hover:bg-[#16171e]',
      text: 'text-zinc-200',
      heading: 'text-white',
      muted: 'text-zinc-500',
      accent: 'text-emerald-400',
      accentBg: 'bg-emerald-500/20',
      accentGlow: 'bg-emerald-500/5',
      selection: 'selection:bg-emerald-500/30'
    },
    Light: {
      bg: 'bg-zinc-50',
      card: 'bg-white border-zinc-200 shadow-lg',
      cardHover: 'hover:bg-zinc-50',
      text: 'text-zinc-800',
      heading: 'text-zinc-900',
      muted: 'text-zinc-500',
      accent: 'text-blue-600',
      accentBg: 'bg-blue-500/10',
      accentGlow: 'bg-blue-500/5',
      selection: 'selection:bg-blue-500/30'
    },
    Blue: {
      bg: 'bg-slate-950',
      card: 'bg-slate-900 border-slate-800/80',
      cardHover: 'hover:bg-slate-800',
      text: 'text-slate-200',
      heading: 'text-white',
      muted: 'text-slate-400',
      accent: 'text-blue-400',
      accentBg: 'bg-blue-500/20',
      accentGlow: 'bg-blue-500/5',
      selection: 'selection:bg-blue-500/30'
    },
    Green: {
      bg: 'bg-emerald-950',
      card: 'bg-emerald-900 border-emerald-800/80',
      cardHover: 'hover:bg-emerald-800',
      text: 'text-emerald-100',
      heading: 'text-white',
      muted: 'text-emerald-400/80',
      accent: 'text-emerald-300',
      accentBg: 'bg-emerald-500/20',
      accentGlow: 'bg-emerald-500/5',
      selection: 'selection:bg-emerald-500/30'
    },
    Purple: {
      bg: 'bg-indigo-950',
      card: 'bg-indigo-900 border-indigo-800/80',
      cardHover: 'hover:bg-indigo-800',
      text: 'text-indigo-100',
      heading: 'text-white',
      muted: 'text-indigo-400/80',
      accent: 'text-purple-400',
      accentBg: 'bg-purple-500/20',
      accentGlow: 'bg-purple-500/5',
      selection: 'selection:bg-purple-500/30'
    }
  }[currentTheme as 'Dark'|'Light'|'Blue'|'Green'|'Purple'] || {
    bg: 'bg-[#0a0a0c]', card: 'bg-[#121319] border-zinc-800/80', cardHover: 'hover:bg-[#16171e]', text: 'text-zinc-200', heading: 'text-white', muted: 'text-zinc-500', accent: 'text-emerald-400', accentBg: 'bg-emerald-500/20', accentGlow: 'bg-emerald-500/5', selection: 'selection:bg-emerald-500/30'
  };`;

content = content.replace(/const used = up \+ down;/g, `const used = up + down;\n${themeLogic}`);
content = content.replace(/bg-\[#0a0a0c\]/g, '${ts.bg}');
content = content.replace(/bg-\[#121319\] border border-zinc-800\/80/g, '${ts.card} border');
content = content.replace(/bg-\[#121319\]/g, '${ts.card.split(\' \')[0]}');
content = content.replace(/hover:bg-\[#16171e\]/g, '${ts.cardHover}');
content = content.replace(/text-zinc-200/g, '${ts.text}');
content = content.replace(/text-white/g, '${ts.heading}');
content = content.replace(/text-zinc-500/g, '${ts.muted}');
content = content.replace(/text-emerald-400/g, '${ts.accent}');
content = content.replace(/bg-emerald-500\/20/g, '${ts.accentBg}');
content = content.replace(/bg-emerald-500\/5/g, '${ts.accentGlow}');
content = content.replace(/selection:bg-emerald-500\/30/g, '${ts.selection}');

// We must also handle JSX templates
content = content.replace(/className="([^"]*?\$\{[^\}]+\}[^"]*?)"/g, (match, p1) => `className={\`${p1}\`}`);
content = content.replace(/className="(.*?)"/g, (match, p1) => {
  if (p1.includes('${ts.')) {
    return `className={\`${p1}\`}`;
  }
  return match;
});

fs.writeFileSync(path, content);
console.log('Patched');
