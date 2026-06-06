const fs = require('fs');
const path = 'src/app/s/[id]/page.tsx';
let content = fs.readFileSync(path, 'utf8');

const themeLogic = `  const currentTheme = portalSettings?.theme || 'Dark';
  const ts = {
    Dark: {
      bg: 'bg-[#0a0a0c]', cardBg: 'bg-[#121319]', card: 'bg-[#121319] border-zinc-800/80', cardHover: 'hover:bg-[#16171e]',
      text: 'text-zinc-200', heading: 'text-white', muted: 'text-zinc-500', accent: 'text-emerald-400', accentBg: 'bg-emerald-500/20', accentGlow: 'bg-emerald-500/5', selection: 'selection:bg-emerald-500/30',
      roundedLg: 'rounded-2xl', roundedXl: 'rounded-[2rem]', border: 'border', shadow: 'shadow-2xl shadow-black/50', font: 'font-sans'
    },
    Light: {
      bg: 'bg-zinc-50', cardBg: 'bg-white', card: 'bg-white border-zinc-200 shadow-lg', cardHover: 'hover:bg-zinc-50',
      text: 'text-zinc-800', heading: 'text-zinc-900', muted: 'text-zinc-500', accent: 'text-blue-600', accentBg: 'bg-blue-500/10', accentGlow: 'bg-blue-500/5', selection: 'selection:bg-blue-500/30',
      roundedLg: 'rounded-2xl', roundedXl: 'rounded-[2rem]', border: 'border', shadow: 'shadow-xl shadow-zinc-200', font: 'font-sans'
    },
    Blue: {
      bg: 'bg-slate-950', cardBg: 'bg-slate-900', card: 'bg-slate-900 border-slate-800/80', cardHover: 'hover:bg-slate-800',
      text: 'text-slate-200', heading: 'text-white', muted: 'text-slate-400', accent: 'text-blue-400', accentBg: 'bg-blue-500/20', accentGlow: 'bg-blue-500/5', selection: 'selection:bg-blue-500/30',
      roundedLg: 'rounded-2xl', roundedXl: 'rounded-[2rem]', border: 'border', shadow: 'shadow-2xl shadow-blue-900/20', font: 'font-sans'
    },
    Green: {
      bg: 'bg-emerald-950', cardBg: 'bg-emerald-900', card: 'bg-emerald-900 border-emerald-800/80', cardHover: 'hover:bg-emerald-800',
      text: 'text-emerald-100', heading: 'text-white', muted: 'text-emerald-400/80', accent: 'text-emerald-300', accentBg: 'bg-emerald-500/20', accentGlow: 'bg-emerald-500/5', selection: 'selection:bg-emerald-500/30',
      roundedLg: 'rounded-2xl', roundedXl: 'rounded-[2rem]', border: 'border', shadow: 'shadow-2xl shadow-emerald-900/20', font: 'font-sans'
    },
    Purple: {
      bg: 'bg-indigo-950', cardBg: 'bg-indigo-900', card: 'bg-indigo-900 border-indigo-800/80', cardHover: 'hover:bg-indigo-800',
      text: 'text-indigo-100', heading: 'text-white', muted: 'text-indigo-400/80', accent: 'text-purple-400', accentBg: 'bg-purple-500/20', accentGlow: 'bg-purple-500/5', selection: 'selection:bg-purple-500/30',
      roundedLg: 'rounded-2xl', roundedXl: 'rounded-[2rem]', border: 'border', shadow: 'shadow-2xl shadow-indigo-900/20', font: 'font-sans'
    },
    Cyberpunk: {
      bg: 'bg-zinc-900', cardBg: 'bg-black', card: 'bg-black border-2 border-pink-500 shadow-[8px_8px_0px_0px_rgba(236,72,153,1)]', cardHover: 'hover:translate-x-1 hover:-translate-y-1 hover:shadow-[12px_12px_0px_0px_rgba(236,72,153,1)] transition-all',
      text: 'text-yellow-400', heading: 'text-pink-500 uppercase tracking-tighter', muted: 'text-zinc-400', accent: 'text-cyan-400', accentBg: 'bg-cyan-500/20', accentGlow: 'bg-pink-500/20 blur-[50px]', selection: 'selection:bg-pink-500/30',
      roundedLg: 'rounded-none', roundedXl: 'rounded-none', border: 'border-2', shadow: 'shadow-[12px_12px_0px_0px_rgba(236,72,153,1)]', font: 'font-mono'
    },
    Sunset: {
      bg: 'bg-gradient-to-br from-orange-100 to-rose-100', cardBg: 'bg-white/60 backdrop-blur-xl', card: 'bg-white/60 backdrop-blur-xl border border-white/50', cardHover: 'hover:bg-white/80 transition-all hover:shadow-orange-500/10',
      text: 'text-stone-700', heading: 'text-rose-600', muted: 'text-stone-500', accent: 'text-orange-500', accentBg: 'bg-orange-500/10', accentGlow: 'bg-orange-500/20', selection: 'selection:bg-rose-500/30',
      roundedLg: 'rounded-3xl', roundedXl: 'rounded-[3rem]', border: 'border', shadow: 'shadow-2xl shadow-rose-500/20', font: 'font-sans'
    },
    Minimalist: {
      bg: 'bg-white', cardBg: 'bg-white', card: 'bg-white border border-black/10', cardHover: 'hover:border-black/30 transition-colors',
      text: 'text-black', heading: 'text-black tracking-tight', muted: 'text-zinc-500', accent: 'text-black', accentBg: 'bg-black/5', accentGlow: 'bg-transparent', selection: 'selection:bg-black/10',
      roundedLg: 'rounded-sm', roundedXl: 'rounded-lg', border: 'border', shadow: 'shadow-none', font: 'font-sans'
    },
    Hacker: {
      bg: 'bg-black', cardBg: 'bg-black', card: 'bg-black border border-green-500/50', cardHover: 'hover:bg-green-950/30 transition-colors',
      text: 'text-green-500', heading: 'text-green-400', muted: 'text-green-700', accent: 'text-green-400', accentBg: 'bg-green-500/20', accentGlow: 'bg-green-500/10', selection: 'selection:bg-green-500/30',
      roundedLg: 'rounded-none', roundedXl: 'rounded-none', border: 'border-dashed border-green-500/50', shadow: 'shadow-[0_0_15px_rgba(34,197,94,0.1)]', font: 'font-mono'
    }
  }[currentTheme as any] || {
    bg: 'bg-[#0a0a0c]', cardBg: 'bg-[#121319]', card: 'bg-[#121319] border-zinc-800/80', cardHover: 'hover:bg-[#16171e]', text: 'text-zinc-200', heading: 'text-white', muted: 'text-zinc-500', accent: 'text-emerald-400', accentBg: 'bg-emerald-500/20', accentGlow: 'bg-emerald-500/5', selection: 'selection:bg-emerald-500/30', roundedLg: 'rounded-2xl', roundedXl: 'rounded-[2rem]', border: 'border', shadow: 'shadow-2xl shadow-black/50', font: 'font-sans'
  };`;

content = content.replace(/const currentTheme = portalSettings\?.theme \|\| 'Dark';[\s\S]*?bg: '\$\{ts.bg\}'[\s\S]*?\};/, themeLogic);

fs.writeFileSync(path, content);
console.log('Fixed ts structure!');
