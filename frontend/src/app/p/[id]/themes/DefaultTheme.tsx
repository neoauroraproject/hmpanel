"use client";

import { use, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Download, QrCode, MonitorSmartphone, Check, MessageCircle, Phone, Globe, Mail, X, Layers, ShieldCheck, Clock, Zap, ChevronDown, ChevronUp } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { formatBytes, formatDate } from "@/lib/format";
import { API_BASE } from "@/lib/api";
import { resolveThemeLogo } from "@/modules/shared/brand-logo";

export default function DefaultTheme({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params);
  const id = resolvedParams.id;

  const { data, isLoading, error } = useQuery({
    queryKey: ["subscription", id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/subscriptions/${id}`);
      if (!res.ok) throw new Error("Failed to load subscription");
      return res.json();
    },
    retry: false,
  });

  const { data: nodes } = useQuery({
    queryKey: ["subscriptionNodes", id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/subscriptions/${id}/nodes`);
      if (!res.ok) return [];
      return res.json();
    },
    retry: false,
  });

  const [qrModal, setQrModal] = useState(false);
  const [urlForQR, setUrlForQR] = useState("");
  const [importSheet, setImportSheet] = useState(false);
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [showTrafficDetails, setShowTrafficDetails] = useState(false);

  if (isLoading) {
    return (
      <div className={`flex h-full min-h-[100dvh] items-center justify-center bg-[#0a0a0c]`}>
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-zinc-800 border-t-emerald-500" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className={`flex h-full min-h-[100dvh] flex-col items-center justify-center p-8 text-center bg-[#0a0a0c]`}>
        <Layers className="mb-4 text-zinc-600" size={64} />
        <h2 className={`text-2xl font-bold text-white`}>Subscription Not Found</h2>
        <p className="mt-2 text-zinc-400">This link may be invalid, expired, or deleted.</p>
      </div>
    );
  }

  const { email, remark, enable, up, down, total, expiryTime, portalSettings, inbound, uuid, subId, subToken } = data;
  const used = up + down;

    const currentTheme = 'Dark';
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
  }[currentTheme as 'Dark'|'Light'|'Blue'|'Green'|'Purple'|'Cyberpunk'|'Sunset'|'Minimalist'|'Hacker'] || {
    bg: 'bg-[#0a0a0c]', cardBg: 'bg-[#121319]', card: 'bg-[#121319] border-zinc-800/80', cardHover: 'hover:bg-[#16171e]', text: 'text-zinc-200', heading: 'text-white', muted: 'text-zinc-500', accent: 'text-emerald-400', accentBg: 'bg-emerald-500/20', accentGlow: 'bg-emerald-500/5', selection: 'selection:bg-emerald-500/30', roundedLg: 'rounded-2xl', roundedXl: 'rounded-[2rem]', border: 'border', shadow: 'shadow-2xl shadow-black/50', font: 'font-sans'
  };
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  
  const remainingDays = expiryTime > 0 ? Math.max(0, Math.ceil((expiryTime - Date.now()) / (1000 * 60 * 60 * 24))) : null;
  const isExpired = expiryTime > 0 && Date.now() > expiryTime;
  const isActive = enable && !isExpired && (total === 0 || used < total);
  
  let statusColor = isActive ? "${ts.accent} bg-emerald-500/10 border-emerald-500/20 shadow-[0_0_15px_rgba(16,185,129,0.2)]" : "text-red-400 bg-red-500/10 border-red-500/20 shadow-[0_0_15px_rgba(239,68,68,0.2)]";
  let statusText = isExpired ? "Expired" : !enable ? "Disabled" : total > 0 && used >= total ? "Depleted" : "Active";

  const brandName = portalSettings?.portalName || "Subscription Info";
  const logoSrc = resolveThemeLogo({
    logoLight: portalSettings?.logoUrl,
    logoDark: portalSettings?.logoDarkUrl,
    theme: currentTheme,
  });
  const systemUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/s/${encodeURIComponent(subId || email)}`
      : `/s/${encodeURIComponent(subId || email)}`;
  const getNativeUrl = () => {
    const sub = encodeURIComponent(subId || email);
    if (inbound?.panel?.subUrl) {
      const base = inbound.panel.subUrl.endsWith("/")
        ? inbound.panel.subUrl
        : `${inbound.panel.subUrl}/`;
      return `${base}${sub}`;
    }
    if (inbound?.panel?.url) {
      try {
        const parsed = new URL(inbound.panel.url);
        return `${parsed.origin}/sub/${sub}`;
      } catch {
        const base = inbound.panel.url.endsWith("/")
          ? inbound.panel.url
          : `${inbound.panel.url}/`;
        return `${base}sub/${sub}`;
      }
    }
    return `${typeof window !== "undefined" ? window.location.origin : ""}/sub/${sub}`;
  };
  const nativeUrl = getNativeUrl();
  const primarySubUrl = systemUrl;

  const copyText = async (text: string, id: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(id);
      setTimeout(() => setCopiedText(null), 2000);
    } catch {}
  };

  const openQR = (url: string) => {
    setUrlForQR(url);
    setQrModal(true);
  };

  const clientName = remark || email || "Unknown Client";

  return (
    <div className={`flex flex-col min-h-[100dvh] w-full ${ts.bg} ${ts.font} ${ts.text} ${ts.selection}`}>
      
      {/* Top Navigation / Brand */}
      <div className="w-full max-w-7xl mx-auto p-4 md:px-8 py-6 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {logoSrc ? (
            <img src={logoSrc} alt={brandName} className="h-14 w-auto object-contain" />
          ) : (
            <div className={`h-12 w-12 rounded-xl ${ts.accentBg} flex items-center justify-center`}>
              <ShieldCheck size={28} className={`${ts.accent}`} />
            </div>
          )}
          <span className={`text-2xl font-black ${ts.heading} tracking-wide`}>{brandName}</span>
        </div>
        
        {/* Support Buttons in header for desktop */}
        <div className="hidden md:flex items-center gap-4">
          {portalSettings?.showTelegram && <HeaderAction icon={<MessageCircle size={22}/>} href={portalSettings.telegramLink} />}
          {portalSettings?.showWhatsApp && <HeaderAction icon={<Phone size={22}/>} href={portalSettings.whatsappLink} />}
          {portalSettings?.showWebsite && <HeaderAction icon={<Globe size={22}/>} href={portalSettings.websiteUrl} />}
          {portalSettings?.showEmail && <HeaderAction icon={<Mail size={22}/>} href={`mailto:${portalSettings.emailAddress}`} />}
        </div>
      </div>

      <div className="max-w-6xl mx-auto w-full px-4 md:px-8 pb-12 flex-1 flex flex-col gap-10">
        
        {/* Hero Section: Client Name */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center justify-center pt-8 md:pt-12 pb-4">
          <div className={`px-4 py-1 rounded-full border text-xs font-bold tracking-widest uppercase mb-6 flex items-center gap-2 ${statusColor}`}>
            <div className={`h-2 w-2 rounded-full ${isActive ? 'bg-emerald-400' : 'bg-red-400'} animate-pulse`} />
            {statusText}
          </div>
          <h1 className={`text-4xl md:text-6xl font-black ${ts.heading} text-center tracking-tight leading-tight`}>
            {clientName}
          </h1>
          <p className={`mt-4 ${ts.muted} font-mono text-sm md:text-base`}>ID: {uuid}</p>
        </motion.div>

        {/* Dashboard: Usage & Expiry */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className={`${ts.card} border ${ts.roundedXl} p-6 md:p-10 ${ts.shadow} w-full relative overflow-hidden`}>
          {/* Subtle background glow */}
          <div className={`absolute top-0 left-1/2 -translate-x-1/2 w-[80%] h-[200px] ${ts.accentGlow} blur-[120px] pointer-events-none rounded-full`} />
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 md:gap-16 items-end mb-8 relative z-10">
            {/* Traffic Info */}
            <div>
              <div className={`text-xs font-bold ${ts.muted} uppercase tracking-widest mb-2 flex items-center gap-2`}><Zap size={14}/> Traffic Usage</div>
              <div className="flex items-baseline gap-2">
                <span className={`text-5xl md:text-6xl font-black ${ts.heading} tracking-tighter`}>{formatBytes(used)}</span>
                <span className={`text-xl md:text-2xl ${ts.muted} font-medium`}>/ {total === 0 ? "∞" : formatBytes(total)}</span>
              </div>
              <div className="flex gap-6 mt-4 text-sm font-medium">
                <div className={`${ts.accent}`}>↓ {formatBytes(down)}</div>
                <div className="text-blue-400">↑ {formatBytes(up)}</div>
              </div>
            </div>

            {/* Expiry Info */}
            <div className="md:text-right">
              <div className={`text-xs font-bold ${ts.muted} uppercase tracking-widest mb-2 flex items-center md:justify-end gap-2`}><Clock size={14}/> Time Remaining</div>
              {remainingDays !== null ? (
                <div className="flex items-baseline md:justify-end gap-2">
                  <span className={`text-5xl md:text-6xl font-black tracking-tighter ${remainingDays < 7 ? 'text-red-400' : '${ts.heading}'}`}>{remainingDays}</span>
                  <span className={`text-xl md:text-2xl ${ts.muted} font-medium`}>Days</span>
                </div>
              ) : (
                <div className={`text-3xl md:text-5xl font-black ${ts.accent} tracking-tighter`}>Unlimited</div>
              )}
              <div className={`mt-4 text-sm font-medium ${ts.muted}`}>
                {expiryTime > 0 ? `Expires on ${formatDate(expiryTime)}` : 'No expiration date'}
              </div>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="relative z-10">
            <div className="h-3 md:h-4 w-full bg-zinc-900 rounded-full overflow-hidden shadow-inner border border-zinc-800/50">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 1.5, delay: 0.3, ease: "easeOut" }}
                className={`h-full rounded-full relative overflow-hidden ${pct > 90 ? 'bg-red-500 shadow-[0_0_15px_rgba(239,68,68,0.6)]' : pct > 75 ? 'bg-amber-500 shadow-[0_0_15px_rgba(245,158,11,0.6)]' : 'bg-emerald-500 shadow-[0_0_15px_rgba(16,185,129,0.6)]'}`}
              >
                {/* Shimmer effect inside bar */}
                <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full animate-[shimmer_2s_infinite]" />
              </motion.div>
            </div>
            
            <button 
              onClick={() => setShowTrafficDetails(!showTrafficDetails)}
              className={`mt-6 flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors mx-auto font-medium`}
            >
              {showTrafficDetails ? 'Hide Traffic Details' : 'Show Traffic Details'}
              {showTrafficDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            
            <AnimatePresence>
              {showTrafficDetails && (
                <motion.div 
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden mt-4"
                >
                  <div className="bg-zinc-900/50 rounded-xl p-4 border border-zinc-800 flex flex-col sm:flex-row items-center gap-6 divide-y sm:divide-y-0 sm:divide-x divide-zinc-800">
                    <div className="w-full sm:w-1/3 text-center sm:text-left">
                      <div className={`text-xs ${ts.muted} mb-1`}>Total Limit</div>
                      <div className={`text-lg font-bold ${ts.heading}`}>{total === 0 ? "Unlimited" : formatBytes(total)}</div>
                    </div>
                    <div className="w-full sm:w-1/3 text-center pt-4 sm:pt-0">
                      <div className={`text-xs ${ts.muted} mb-1`}>Total Consumed</div>
                      <div className="text-lg font-bold text-amber-400">{formatBytes(used)}</div>
                    </div>
                    <div className="w-full sm:w-1/3 text-center sm:text-right pt-4 sm:pt-0">
                      <div className={`text-xs ${ts.muted} mb-1`}>Remaining</div>
                      <div className={`text-lg font-bold ${ts.accent}`}>{total === 0 ? "Unlimited" : formatBytes(Math.max(0, total - used))}</div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          
          {/* Left Column: Primary Subscription Link */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="lg:col-span-2 space-y-6">
            <div className="flex items-center gap-3">
              <div className="h-8 w-1 bg-emerald-500 rounded-full"></div>
              <h2 className={`text-2xl font-bold ${ts.heading}`}>Subscription Link</h2>
            </div>
            
            <div className={`${ts.card} border ${ts.roundedLg} p-6 shadow-xl relative overflow-hidden group hover:border-zinc-700 transition-colors`}>
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex-1 min-w-0">
                  <div className={`text-xs font-bold ${ts.muted} uppercase tracking-widest mb-2`}>System Sub</div>
                  <div className="font-mono text-sm md:text-base text-zinc-300 truncate select-all">{primarySubUrl}</div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <MainActionBtn icon={copiedText === 'sub' ? <Check size={18} className={`${ts.accent}`}/> : <Copy size={18}/>} label="Copy" onClick={() => copyText(primarySubUrl, 'sub')} active={copiedText === 'sub'} />
                  <MainActionBtn icon={<QrCode size={18}/>} label="QR Code" onClick={() => openQR(primarySubUrl)} />
                </div>
              </div>
            </div>

            {/* Inbounds / Configurations List */}
            {nodes && nodes.length > 0 && (
              <div className="space-y-4 pt-4">
                <h3 className={`text-lg font-bold ${ts.heading} mb-4`}>Configurations</h3>
                <div className="flex flex-col gap-3">
                  {nodes.map((node: any, idx: number) => (
                    <div key={idx} className={`${ts.card} border ${ts.roundedLg} p-4 flex flex-col sm:flex-row sm:items-center gap-4 shadow-lg ${ts.cardHover} transition-colors`}>
                      <div className="flex gap-2 shrink-0">
                        <span className="px-3 py-1 bg-blue-500/10 text-blue-400 text-xs font-bold rounded-lg uppercase tracking-wider">{node.protocol}</span>
                      </div>
                      <div className={`flex-1 text-base ${ts.text} font-medium truncate`}>{node.tag}</div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button onClick={() => copyText(node.link, 'node_' + idx)} className="p-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors">
                          {copiedText === 'node_' + idx ? <Check size={16} className={`${ts.accent}`}/> : <Copy size={16}/>}
                        </button>
                        <button onClick={() => openQR(node.link)} className="p-2.5 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors">
                          <QrCode size={16}/>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </motion.div>

          {/* Right Column: App Import & Actions */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }} className="space-y-6">
            <div className="flex items-center gap-3">
              <div className="h-8 w-1 bg-blue-500 rounded-full"></div>
              <h2 className={`text-2xl font-bold ${ts.heading}`}>Quick Connect</h2>
            </div>
            
            <div className={`${ts.card} border ${ts.roundedLg} p-6 shadow-xl space-y-4`}>
              <p className="text-zinc-400 text-sm mb-4">Automatically import your subscription into a compatible VPN client.</p>
              <button onClick={() => setImportSheet(true)} className={`flex items-center justify-center gap-3 w-full py-4 bg-emerald-600 hover:bg-emerald-500 transition-colors rounded-xl ${ts.heading} font-bold shadow-lg shadow-emerald-600/20`}>
                <MonitorSmartphone size={20} /> Import to App
              </button>
              
              {/* Optional secondary native panel URL */}
              <div className="pt-4 mt-4 border-t border-zinc-800/80">
                <div className={`text-xs font-bold ${ts.muted} uppercase tracking-widest mb-3`}>Panel Native</div>
                <div className="flex items-center gap-2">
                  <div className={`flex-1 bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 font-mono text-xs ${ts.muted} truncate`}>
                    {nativeUrl}
                  </div>
                  <button onClick={() => copyText(nativeUrl, 'panel')} className="p-2.5 rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors">
                    {copiedText === 'panel' ? <Check size={14} className={`${ts.accent}`}/> : <Copy size={14}/>}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
          
        </div>

      </div>

      {/* Mobile Support Footer */}
      {portalSettings?.showSupportSection !== false && (
        <div className={`md:hidden flex justify-center gap-6 py-8 border-t border-zinc-800/50 ${ts.bg}`}>
          {portalSettings?.showTelegram && <a href={portalSettings.telegramLink} className={`${ts.muted} hover:text-blue-400`}><MessageCircle size={24}/></a>}
          {portalSettings?.showWhatsApp && <a href={portalSettings.whatsappLink} className={`${ts.muted} hover:${ts.accent}`}><Phone size={24}/></a>}
          {portalSettings?.showWebsite && <a href={portalSettings.websiteUrl} className={`${ts.muted} hover:text-purple-400`}><Globe size={24}/></a>}
          {portalSettings?.showEmail && <a href={`mailto:${portalSettings.emailAddress}`} className={`${ts.muted} hover:text-amber-400`}><Mail size={24}/></a>}
        </div>
      )}

      {/* QR MODAL */}
      <AnimatePresence>
        {qrModal && (
          <ModalWrapper onClose={() => setQrModal(false)}>
            <div className={`flex flex-col ${ts.cardBg}`}>
              <div className="flex items-center justify-between p-5 border-b border-zinc-800/80 bg-[#16171e]">
                <h3 className={`font-bold ${ts.heading} text-lg`}>Scan QR Code</h3>
                <button onClick={() => setQrModal(false)} className={`p-1.5 rounded-full text-zinc-400 bg-zinc-800 hover:text-white hover:bg-zinc-700 transition-colors`}><X size={18}/></button>
              </div>
              <div className="p-8 flex flex-col items-center">
                <div className="bg-white p-5 rounded-3xl shadow-2xl shadow-black mb-8 ring-4 ring-white/10">
                  <QRCodeCanvas id="qr-canvas" value={urlForQR} size={240} level="M" />
                </div>
                <button onClick={() => {
                  const canvas = document.getElementById("qr-canvas") as HTMLCanvasElement;
                  if (canvas) {
                    const link = document.createElement("a");
                    link.download = `Subscription_QR.png`;
                    link.href = canvas.toDataURL("image/png");
                    link.click();
                  }
                }} className={`flex items-center justify-center gap-2 w-full py-4 rounded-xl bg-emerald-600 ${ts.heading} font-bold hover:bg-emerald-500 transition-colors shadow-lg shadow-emerald-600/20`}>
                  <Download size={20} /> Save QR Image
                </button>
              </div>
            </div>
          </ModalWrapper>
        )}
      </AnimatePresence>

      {/* IMPORT BOTTOM SHEET */}
      <AnimatePresence>
        {importSheet && (
          <BottomSheetWrapper onClose={() => setImportSheet(false)}>
            <div className={`p-6 md:p-8 space-y-8 ${ts.cardBg}`}>
              <div className="text-center">
                <h3 className={`text-2xl font-black ${ts.heading} mb-2`}>Import to App</h3>
                <p className="text-sm text-zinc-400 font-medium">Select your preferred app to automatically configure your connection.</p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <AppImportBtn name="V2rayNG" icon="🟢" url={`v2rayng://install-sub?url=${encodeURIComponent(primarySubUrl)}`} />
                <AppImportBtn name="Hiddify" icon="🔵" url={`hiddify://install-sub?url=${encodeURIComponent(primarySubUrl)}`} />
                <AppImportBtn name="Shadowrocket" icon="🚀" url={`shadowrocket://add/sub://${btoa(primarySubUrl)}?title=${encodeURIComponent(brandName)}`} />
                <AppImportBtn name="Streisand" icon="⚡" url={`streisand://import/${encodeURIComponent(primarySubUrl)}`} />
              </div>
              <button onClick={() => setImportSheet(false)} className={`w-full py-4 mt-4 rounded-xl bg-zinc-800 ${ts.heading} font-bold hover:bg-zinc-700 transition-colors shadow-md`}>
                Cancel
              </button>
            </div>
          </BottomSheetWrapper>
        )}
      </AnimatePresence>
      
      {/* Global shimmer animation definition */}
      <style dangerouslySetInnerHTML={{__html: `
        @keyframes shimmer {
          100% { transform: translateX(100%); }
        }
      `}} />
    </div>
  );
}

/* Sub-components */

function HeaderAction({ icon, href }: { icon: React.ReactNode, href: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className={`p-2 rounded-lg bg-zinc-800/50 hover:bg-zinc-700 text-zinc-400 hover:text-white transition-colors border border-zinc-700/50`}>
      {icon}
    </a>
  );
}

function MainActionBtn({ icon, label, onClick, active }: any) {
  return (
    <button onClick={onClick} className={`flex items-center gap-2 px-4 py-3 rounded-xl border transition-colors ${active ? 'bg-emerald-500/10 border-emerald-500/30 ${ts.accent}' : 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'}`}>
      {icon} <span className="font-bold text-sm hidden sm:inline">{label}</span>
    </button>
  );
}

/* Modals */

function ModalWrapper({ children, onClose }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <motion.div initial={{ scale: 0.95, opacity: 0, y: 20 }} animate={{ scale: 1, opacity: 1, y: 0 }} exit={{ scale: 0.95, opacity: 0, y: 20 }} className="relative w-full max-w-sm ${ts.roundedXl} overflow-hidden shadow-2xl shadow-black border border-zinc-800">
        {children}
      </motion.div>
    </div>
  );
}

function BottomSheetWrapper({ children, onClose }: any) {
  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={onClose} />
      <motion.div initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }} transition={{ type: "spring", damping: 25, stiffness: 200 }} className="relative w-full sm:max-w-md rounded-t-[2.5rem] sm:${ts.roundedXl} border border-zinc-800 shadow-[0_-10px_50px_rgba(0,0,0,0.8)] overflow-hidden">
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-12 h-1.5 rounded-full bg-zinc-700 sm:hidden z-10" />
        {children}
      </motion.div>
    </div>
  );
}

function AppImportBtn({ name, icon, url }: any) {
  return (
    <a href={url} className="flex flex-col items-center justify-center gap-3 bg-zinc-800/30 border border-zinc-700/50 ${ts.roundedLg} p-5 hover:bg-zinc-700/80 hover:border-zinc-600 transition-all shadow-md group">
      <div className="text-4xl group-hover:scale-110 transition-transform">{icon}</div>
      <span className="text-sm font-bold text-zinc-300">{name}</span>
    </a>
  );
}
