"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { QrCode, MonitorSmartphone, X, MessageCircle, Phone, Globe, Mail } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { formatBytes, formatDate } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";

export default function MinimalistTheme({ id, data }: { id: string; data: any }) {
  const [copiedText, setCopiedText] = useState<string | null>(null);
  const [qrModal, setQrModal] = useState(false);
  const [importSheet, setImportSheet] = useState(false);
  const [urlForQR, setUrlForQR] = useState("");

  const { data: nodes } = useQuery({
    queryKey: ["subscriptionNodes", id],
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/subscriptions/${id}/nodes`);
      if (!res.ok) return [];
      return res.json();
    },
    retry: false,
  });

  const { email, remark, enable, up, down, total, expiryTime, uuid, subId, subToken, inbound, portalSettings } = data;
  const used = up + down;
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  
  const isExpired = expiryTime > 0 && Date.now() > expiryTime;
  const isActive = enable && !isExpired && (total === 0 || used < total);
  
  const clientName = remark || email || "Client";
  const brandName = portalSettings?.portalName || "Service";

  const getNativeUrl = () => {
    const sub = encodeURIComponent(subId || email);
    if (inbound?.panel?.subUrl) return `${inbound.panel.subUrl}${sub}`;
    if (inbound?.panel?.url) return `${inbound.panel.url}/sub/${sub}`;
    return `${typeof window !== 'undefined' ? window.location.origin : ''}/sub/${sub}`;
  };
  const nativeUrl = getNativeUrl();

  const copyText = async (text: string, cid: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedText(cid);
      setTimeout(() => setCopiedText(null), 2000);
    } catch {}
  };

  const openQR = (url: string) => {
    setUrlForQR(url);
    setQrModal(true);
  };

  return (
    <div className="min-h-[100dvh] w-full bg-white text-black font-sans flex flex-col selection:bg-black/10 relative">
      
      {/* Header */}
      <header className="w-full p-6 md:p-12 flex justify-between items-start border-b border-black/10">
        <div className="flex flex-col gap-4">
          {portalSettings?.logoUrl && (
            <img src={portalSettings.logoUrl} alt={brandName} className="h-10 w-auto object-contain grayscale" />
          )}
          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-1">Provider</div>
            <div className="text-xl font-bold tracking-tight">{brandName}</div>
          </div>
        </div>

        <div className="flex gap-12 text-right">
          {/* Support Icons */}
          {portalSettings?.showSupportSection !== false && (
            <div className="hidden md:flex gap-4 items-end pb-1 border-b border-transparent">
              {portalSettings?.showTelegram && <a href={portalSettings.telegramLink} className="text-zinc-400 hover:text-black transition-colors"><MessageCircle size={20}/></a>}
              {portalSettings?.showWhatsApp && <a href={portalSettings.whatsappLink} className="text-zinc-400 hover:text-black transition-colors"><Phone size={20}/></a>}
              {portalSettings?.showWebsite && <a href={portalSettings.websiteUrl} className="text-zinc-400 hover:text-black transition-colors"><Globe size={20}/></a>}
              {portalSettings?.showEmail && <a href={`mailto:${portalSettings.emailAddress}`} className="text-zinc-400 hover:text-black transition-colors"><Mail size={20}/></a>}
            </div>
          )}

          <div>
            <div className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-1">Status</div>
            <div className={`text-sm font-bold uppercase tracking-widest ${isActive ? 'text-black' : 'text-zinc-400'}`}>
              {isActive ? 'Active' : 'Inactive'}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-6 md:p-12 grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-24 relative z-10">
        
        {/* Left Column: Big Title & Link */}
        <div className="lg:col-span-7 flex flex-col justify-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
            <h1 className="text-6xl md:text-8xl font-black tracking-tighter leading-none mb-6">
              {clientName}
            </h1>
            <p className="text-zinc-500 font-mono text-sm mb-12">ID: {uuid}</p>
            
            <div className="space-y-4">
              <div className="text-sm font-bold uppercase tracking-widest">Subscription Link</div>
              <div className="flex flex-col sm:flex-row gap-4">
                <input 
                  readOnly 
                  value={nativeUrl} 
                  className="w-full bg-zinc-50 border border-black/10 p-4 font-mono text-xs outline-none text-zinc-600 focus:border-black transition-colors"
                />
                <button 
                  onClick={() => copyText(nativeUrl, 'sub')}
                  className="bg-black text-white px-8 py-4 text-sm font-bold uppercase tracking-widest hover:bg-zinc-800 transition-colors shrink-0"
                >
                  {copiedText === 'sub' ? 'Copied' : 'Copy'}
                </button>
              </div>

              <div className="flex gap-4 pt-4">
                {portalSettings?.showNativeQR !== false && (
                  <button 
                    onClick={() => openQR(nativeUrl)}
                    className="flex-1 border border-black/20 hover:border-black text-black px-6 py-3 text-sm font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
                  >
                    <QrCode size={18} /> View QR
                  </button>
                )}
                {portalSettings?.allowDirectImport !== false && (
                  <button 
                    onClick={() => setImportSheet(true)}
                    className="flex-1 border border-black/20 hover:border-black text-black px-6 py-3 text-sm font-bold uppercase tracking-widest transition-colors flex items-center justify-center gap-2"
                  >
                    <MonitorSmartphone size={18} /> Auto Import
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        </div>

        {/* Right Column: Data Grid */}
        <div className="lg:col-span-5 flex flex-col justify-center gap-12">
          
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, delay: 0.2 }}>
            <div className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-4">Traffic Usage</div>
            <div className="text-5xl font-bold tracking-tighter mb-2">
              {formatBytes(used)} <span className="text-2xl text-zinc-400">/ {total === 0 ? "∞" : formatBytes(total)}</span>
            </div>
            
            <div className="h-1 w-full bg-zinc-100 mt-6 relative overflow-hidden">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 1, delay: 0.5 }}
                className="absolute top-0 left-0 h-full bg-black"
              />
            </div>
          </motion.div>

          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, delay: 0.3 }}>
            <div className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-4">Expiration Date</div>
            <div className="text-3xl font-bold tracking-tighter">
              {expiryTime > 0 ? formatDate(expiryTime) : 'Never Expires'}
            </div>
          </motion.div>

          {nodes && nodes.length > 0 && (
            <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.8, delay: 0.4 }}>
              <div className="text-xs font-bold uppercase tracking-widest text-zinc-400 mb-4">Nodes</div>
              <ul className="space-y-4">
                {nodes.map((node: any, idx: number) => (
                  <li key={idx} className="flex justify-between items-center group cursor-pointer border-b border-black/5 pb-2 hover:border-black/30 transition-colors" onClick={() => copyText(node.link, `node-${idx}`)}>
                    <span className="font-medium">{node.tag}</span>
                    <span className="text-xs font-bold uppercase tracking-widest text-zinc-400 group-hover:text-black transition-colors">
                      {copiedText === `node-${idx}` ? 'Copied' : 'Copy'}
                    </span>
                  </li>
                ))}
              </ul>
            </motion.div>
          )}

        </div>

      </main>

      {/* Support Mobile Footer */}
      {portalSettings?.showSupportSection !== false && (
        <footer className="md:hidden p-6 border-t border-black/10 flex justify-center gap-8">
          {portalSettings?.showTelegram && <a href={portalSettings.telegramLink} className="text-zinc-500 hover:text-black"><MessageCircle size={24}/></a>}
          {portalSettings?.showWhatsApp && <a href={portalSettings.whatsappLink} className="text-zinc-500 hover:text-black"><Phone size={24}/></a>}
          {portalSettings?.showWebsite && <a href={portalSettings.websiteUrl} className="text-zinc-500 hover:text-black"><Globe size={24}/></a>}
          {portalSettings?.showEmail && <a href={`mailto:${portalSettings.emailAddress}`} className="text-zinc-500 hover:text-black"><Mail size={24}/></a>}
        </footer>
      )}

      {/* MODALS */}
      <AnimatePresence>
        {qrModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-white/90 backdrop-blur-sm">
            <motion.div initial={{ y: 20 }} animate={{ y: 0 }} exit={{ y: 20 }} className="bg-white border border-black/10 p-8 md:p-12 max-w-sm w-full relative shadow-2xl">
              <button onClick={() => setQrModal(false)} className="absolute top-6 right-6 text-zinc-400 hover:text-black"><X size={24} /></button>
              <h3 className="text-sm font-bold uppercase tracking-widest text-black mb-8 text-center">Scan QR Code</h3>
              <div className="bg-white flex justify-center mb-8 border border-black/5 p-4">
                <QRCodeCanvas value={urlForQR} size={240} bgColor="#ffffff" fgColor="#000000" level="H" />
              </div>
              <p className="text-zinc-500 text-sm text-center">Scan with your mobile client to import.</p>
            </motion.div>
          </motion.div>
        )}

        {importSheet && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-white/90 backdrop-blur-sm">
            <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }} className="bg-white border border-black/10 p-8 md:p-12 w-full max-w-md relative shadow-2xl">
              <button onClick={() => setImportSheet(false)} className="absolute top-6 right-6 text-zinc-400 hover:text-black"><X size={24} /></button>
              <h3 className="text-sm font-bold uppercase tracking-widest text-black mb-8">Import Config</h3>
              <div className="space-y-4">
                <a href={`v2rayng://install-config?url=${encodeURIComponent(nativeUrl)}`} className="block w-full text-center bg-zinc-50 hover:bg-black hover:text-white border border-black/10 text-black py-4 uppercase tracking-widest text-xs font-bold transition-colors">
                  V2rayNG
                </a>
                <a href={`shadowrocket://add/sub://${btoa(nativeUrl)}`} className="block w-full text-center bg-zinc-50 hover:bg-black hover:text-white border border-black/10 text-black py-4 uppercase tracking-widest text-xs font-bold transition-colors">
                  Shadowrocket
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
