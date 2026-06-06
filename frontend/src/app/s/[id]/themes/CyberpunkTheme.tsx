"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Activity, QrCode, MonitorSmartphone, X, ShieldCheck, MessageCircle, Phone, Globe, Mail } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { formatBytes, formatDate } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";

export default function CyberpunkTheme({ id, data }: { id: string; data: any }) {
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
  
  const clientName = remark || email || "Unknown Client";
  const brandName = portalSettings?.portalName || "Command Center";

    const getNativeUrl = () => {
    const sub = subId || email;
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
    <div className="min-h-[100dvh] w-full bg-[#030b14] text-cyan-400 font-mono p-4 md:p-8 relative overflow-hidden selection:bg-cyan-500/30">
      
      {/* Sci-Fi Grid Overlay */}
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PG1hdGggZD0iTTAgNDBoNDBWMEgweiIgZmlsbD0ibm9uZSIvPjxwb2x5Z29uIHBvaW50cz0iMCw0MCA0MCw0MCA0MCwwIDAsMCIgZmlsbD0ibm9uZSIgc3Ryb2tlPSJyZ2JhKDYsIDE4MiwgMjEyLCAwLjA1KSIgc3Ryb2tlLXdpZHRoPSIxIi8+PC9zdmc+')] opacity-50 pointer-events-none" />
      
      {/* Central Glow */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-cyan-900/20 blur-[150px] pointer-events-none rounded-full" />

      <div className="max-w-6xl mx-auto flex flex-col gap-8 relative z-10">
        
        {/* HEADER */}
        <header className="flex justify-between items-center border-b border-cyan-900/50 pb-4">
          <div className="flex items-center gap-4">
            {portalSettings?.logoUrl ? (
              <img src={portalSettings.logoUrl} alt={brandName} className="h-12 w-auto filter drop-shadow-[0_0_10px_rgba(6,182,212,0.8)]" />
            ) : (
              <ShieldCheck size={36} className="text-cyan-500 drop-shadow-[0_0_10px_rgba(6,182,212,0.8)]" />
            )}
            <div className="text-xl font-bold tracking-[0.2em] uppercase text-cyan-50">{brandName}</div>
          </div>
          
          {/* Support Icons */}
          {portalSettings?.showSupportSection !== false && (
            <div className="hidden md:flex gap-4">
              {portalSettings?.showTelegram && <a href={portalSettings.telegramLink} className="text-cyan-600 hover:text-cyan-400 drop-shadow-[0_0_5px_rgba(6,182,212,0.5)]"><MessageCircle size={24}/></a>}
              {portalSettings?.showWhatsApp && <a href={portalSettings.whatsappLink} className="text-cyan-600 hover:text-cyan-400 drop-shadow-[0_0_5px_rgba(6,182,212,0.5)]"><Phone size={24}/></a>}
              {portalSettings?.showWebsite && <a href={portalSettings.websiteUrl} className="text-cyan-600 hover:text-cyan-400 drop-shadow-[0_0_5px_rgba(6,182,212,0.5)]"><Globe size={24}/></a>}
              {portalSettings?.showEmail && <a href={`mailto:${portalSettings.emailAddress}`} className="text-cyan-600 hover:text-cyan-400 drop-shadow-[0_0_5px_rgba(6,182,212,0.5)]"><Mail size={24}/></a>}
            </div>
          )}
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT: HUD Identity & Status */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            <motion.div initial={{ x: -20, opacity: 0 }} animate={{ x: 0, opacity: 1 }} className="bg-[#05111d] border border-cyan-800 p-6 relative shadow-[0_0_20px_rgba(6,182,212,0.1)]">
              {/* Corner Accents */}
              <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-cyan-400" />
              <div className="absolute top-0 right-0 w-2 h-2 border-t-2 border-r-2 border-cyan-400" />
              <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-cyan-400" />
              <div className="absolute bottom-0 right-0 w-2 h-2 border-b-2 border-r-2 border-cyan-400" />
              
              <div className="text-[10px] text-cyan-600 mb-2 tracking-[0.3em] uppercase">SUBJECT_IDENTITY</div>
              <h1 className="text-3xl text-cyan-50 uppercase tracking-wider break-all mb-4">{clientName}</h1>
              
              <div className="space-y-3">
                <div className="flex justify-between border-b border-cyan-900/50 pb-2">
                  <span className="text-cyan-700 text-xs tracking-widest">UUID:</span>
                  <span className="text-cyan-400 text-xs">{uuid}</span>
                </div>
                <div className="flex justify-between border-b border-cyan-900/50 pb-2">
                  <span className="text-cyan-700 text-xs tracking-widest">STATUS:</span>
                  <span className={`text-xs font-bold ${isActive ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'text-red-500'}`}>
                    {isActive ? '[ ACTIVE ]' : '[ OFFLINE ]'}
                  </span>
                </div>
                <div className="flex justify-between border-b border-cyan-900/50 pb-2">
                  <span className="text-cyan-700 text-xs tracking-widest">EXPIRY:</span>
                  <span className="text-cyan-300 text-xs">{expiryTime > 0 ? formatDate(expiryTime) : 'N/A'}</span>
                </div>
              </div>
            </motion.div>

            {/* Support Mobile */}
            {portalSettings?.showSupportSection !== false && (
              <div className="md:hidden flex gap-6 justify-center mt-4">
                {portalSettings?.showTelegram && <a href={portalSettings.telegramLink} className="text-cyan-600 hover:text-cyan-400"><MessageCircle size={24}/></a>}
                {portalSettings?.showWhatsApp && <a href={portalSettings.whatsappLink} className="text-cyan-600 hover:text-cyan-400"><Phone size={24}/></a>}
                {portalSettings?.showWebsite && <a href={portalSettings.websiteUrl} className="text-cyan-600 hover:text-cyan-400"><Globe size={24}/></a>}
                {portalSettings?.showEmail && <a href={`mailto:${portalSettings.emailAddress}`} className="text-cyan-600 hover:text-cyan-400"><Mail size={24}/></a>}
              </div>
            )}
          </div>

          {/* RIGHT: HUD Data & Links */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            
            {/* Telemetry (Usage) */}
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} className="bg-[#05111d] border border-cyan-800 p-6 relative">
              <div className="text-[10px] text-cyan-600 mb-6 tracking-[0.3em] uppercase">SYSTEM_TELEMETRY</div>
              
              <div className="flex justify-between items-end mb-2">
                <span className="text-4xl text-cyan-50">{pct.toFixed(1)}<span className="text-cyan-600 text-xl">%</span></span>
                <span className="text-cyan-400 text-sm">{formatBytes(used)} / {total === 0 ? "∞" : formatBytes(total)}</span>
              </div>
              
              <div className="w-full h-2 bg-[#02060b] border border-cyan-900 relative mb-2">
                <motion.div 
                  initial={{ width: 0 }} 
                  animate={{ width: `${pct}%` }} 
                  transition={{ duration: 1.5, ease: "easeOut" }}
                  className="absolute top-0 left-0 h-full bg-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.8)]"
                />
              </div>
              
              {/* Fake Hex Graph decoration */}
              <div className="h-12 w-full mt-6 opacity-30 flex gap-1 items-end">
                {Array.from({length: 40}).map((_, i) => (
                  <div key={i} className="flex-1 bg-cyan-500" style={{ height: `${Math.random() * 100}%` }} />
                ))}
              </div>
            </motion.div>

            {/* Main Links */}
            <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.2 }} className="bg-[#05111d] border border-cyan-800 p-6">
              <div className="text-[10px] text-cyan-600 mb-4 tracking-[0.3em] uppercase">DATA_LINK_ACCESS</div>
              
              <div className="flex flex-col gap-4">
                <div className="flex">
                  <input 
                    readOnly 
                    value={nativeUrl} 
                    className="flex-1 bg-[#02060b] border border-cyan-900 text-cyan-500 px-4 py-3 outline-none text-xs truncate"
                  />
                  <button 
                    onClick={() => copyText(nativeUrl, 'sub')}
                    className="bg-cyan-900/50 hover:bg-cyan-800 border border-cyan-800 border-l-0 px-6 text-cyan-100 uppercase tracking-widest text-xs transition-colors"
                  >
                    {copiedText === 'sub' ? 'COPIED' : 'COPY'}
                  </button>
                </div>

                <div className="flex gap-4">
                  {portalSettings?.showNativeQR !== false && (
                    <button 
                      onClick={() => openQR(nativeUrl)}
                      className="flex-1 bg-transparent border border-cyan-800 hover:bg-cyan-900/30 text-cyan-400 flex items-center justify-center gap-2 py-3 text-xs uppercase tracking-widest transition-colors"
                    >
                      <QrCode size={16} /> QR CODE
                    </button>
                  )}
                  {portalSettings?.allowDirectImport !== false && (
                    <button 
                      onClick={() => setImportSheet(true)}
                      className="flex-1 bg-cyan-900/50 border border-cyan-800 hover:bg-cyan-800 text-cyan-50 flex items-center justify-center gap-2 py-3 text-xs uppercase tracking-widest transition-colors shadow-[0_0_10px_rgba(6,182,212,0.2)]"
                    >
                      <MonitorSmartphone size={16} /> 1-CLICK IMPORT
                    </button>
                  )}
                </div>
              </div>
            </motion.div>

            {/* Nodes */}
            {nodes && nodes.length > 0 && (
              <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }} className="bg-[#05111d] border border-cyan-800 p-6">
                <div className="text-[10px] text-cyan-600 mb-4 tracking-[0.3em] uppercase">NETWORK_NODES</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {nodes.map((node: any, idx: number) => (
                    <div key={idx} className="bg-[#02060b] border border-cyan-900/50 p-3 flex justify-between items-center group hover:border-cyan-500 transition-colors cursor-pointer" onClick={() => copyText(node.link, `node-${idx}`)}>
                      <span className="text-cyan-100 text-xs truncate">{node.tag}</span>
                      <span className="text-[10px] text-cyan-600 group-hover:text-cyan-400 uppercase tracking-widest">
                        {copiedText === `node-${idx}` ? 'OK' : 'COPY'}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

          </div>
        </div>
      </div>

      {/* MODALS */}
      <AnimatePresence>
        {qrModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#030b14]/90 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-[#05111d] border border-cyan-500 p-8 max-w-sm w-full relative shadow-[0_0_30px_rgba(6,182,212,0.2)]">
              <button onClick={() => setQrModal(false)} className="absolute top-4 right-4 text-cyan-600 hover:text-cyan-400"><X size={24} /></button>
              <div className="text-[10px] text-cyan-600 mb-6 tracking-[0.3em] uppercase text-center">OPTICAL_SCAN_REQUIRED</div>
              <div className="bg-white p-4 rounded-sm flex justify-center mb-6">
                <QRCodeCanvas value={urlForQR} size={220} bgColor="#ffffff" fgColor="#000000" level="H" />
              </div>
              <p className="text-cyan-400 text-xs text-center">Scan this code with your V2Ray client to import the configuration.</p>
            </motion.div>
          </motion.div>
        )}

        {importSheet && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-[#030b14]/90 backdrop-blur-sm">
            <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }} className="bg-[#05111d] border border-cyan-500 p-8 w-full max-w-md relative shadow-[0_0_30px_rgba(6,182,212,0.2)]">
              <button onClick={() => setImportSheet(false)} className="absolute top-4 right-4 text-cyan-600 hover:text-cyan-400"><X size={24} /></button>
              <div className="text-[10px] text-cyan-600 mb-6 tracking-[0.3em] uppercase">AUTO_INJECT_PROTOCOL</div>
              <div className="space-y-4">
                <a href={`v2rayng://install-config?url=${encodeURIComponent(nativeUrl)}`} className="block w-full text-center bg-cyan-900/30 border border-cyan-800 hover:bg-cyan-800 text-cyan-50 py-4 uppercase tracking-widest text-xs transition-colors">
                  Inject via V2rayNG
                </a>
                <a href={`shadowrocket://add/sub://${btoa(nativeUrl)}`} className="block w-full text-center bg-cyan-900/30 border border-cyan-800 hover:bg-cyan-800 text-cyan-50 py-4 uppercase tracking-widest text-xs transition-colors">
                  Inject via Shadowrocket
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
