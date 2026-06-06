"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Copy, Check, Wifi, ShieldCheck, QrCode, MonitorSmartphone, X, MessageCircle, Phone, Globe, Mail } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { formatBytes, formatDate } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";

export default function SunsetTheme({ id, data }: { id: string; data: any }) {
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
    <div className="min-h-[100dvh] w-full bg-gradient-to-br from-orange-100 via-rose-100 to-purple-200 text-stone-800 font-sans p-4 md:p-8 flex flex-col items-center justify-center selection:bg-rose-500/30">
      
      {/* Centered Glass Card */}
      <motion.div 
        initial={{ y: 30, opacity: 0 }} 
        animate={{ y: 0, opacity: 1 }} 
        transition={{ duration: 0.8, ease: "easeOut" }}
        className="w-full max-w-lg bg-white/40 backdrop-blur-3xl border border-white/60 p-8 md:p-12 rounded-[3rem] shadow-2xl shadow-rose-900/10 relative overflow-hidden"
      >
        {/* Soft background glows inside the card */}
        <div className="absolute -top-20 -right-20 w-64 h-64 bg-rose-300/30 blur-[60px] rounded-full pointer-events-none" />
        <div className="absolute -bottom-20 -left-20 w-64 h-64 bg-orange-300/30 blur-[60px] rounded-full pointer-events-none" />

        <div className="relative z-10 flex flex-col items-center text-center">
          
          {portalSettings?.logoUrl ? (
            <img src={portalSettings.logoUrl} alt={brandName} className="h-20 w-auto mb-4 rounded-xl shadow-lg shadow-rose-500/20" />
          ) : (
            <div className="w-16 h-16 bg-gradient-to-tr from-rose-400 to-orange-400 rounded-full flex items-center justify-center text-white mb-6 shadow-lg shadow-rose-500/30">
              <ShieldCheck size={32} />
            </div>
          )}

          <h2 className="text-sm font-semibold tracking-widest text-rose-500 uppercase mb-2">{brandName}</h2>
          <h1 className="text-3xl font-bold text-stone-900 mb-1">{clientName}</h1>
          
          <div className={`mt-4 px-4 py-1 rounded-full text-xs font-bold uppercase tracking-wider flex items-center gap-2 ${isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
            <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
            {isActive ? 'Active Connection' : 'Offline / Expired'}
          </div>

          {/* Elegant Circular/Pill Progress */}
          <div className="w-full mt-10">
            <div className="flex justify-between text-sm font-medium text-stone-600 mb-2">
              <span>{formatBytes(used)}</span>
              <span>{total === 0 ? "Unlimited" : formatBytes(total)}</span>
            </div>
            <div className="h-3 w-full bg-white/50 rounded-full overflow-hidden border border-white/50 shadow-inner">
              <motion.div 
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 1.5, delay: 0.3, ease: "circOut" }}
                className="h-full bg-gradient-to-r from-orange-400 to-rose-500 rounded-full"
              />
            </div>
            <div className="mt-4 text-xs font-medium text-stone-500">
              Expires: {expiryTime > 0 ? formatDate(expiryTime) : 'Never'}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="w-full mt-10 space-y-3">
            <button 
              onClick={() => copyText(nativeUrl, 'sub')}
              className="w-full bg-stone-900 hover:bg-stone-800 text-white rounded-[2rem] py-4 px-6 flex items-center justify-center gap-3 font-medium transition-all shadow-xl shadow-stone-900/20 active:scale-95"
            >
              {copiedText === 'sub' ? <Wifi size={20} className="text-emerald-400" /> : <Wifi size={20} />}
              {copiedText === 'sub' ? 'Link Copied!' : 'Copy Subscription Link'}
            </button>
            <div className="flex gap-3">
              {portalSettings?.showNativeQR !== false && (
                <button 
                  onClick={() => openQR(nativeUrl)}
                  className="flex-1 bg-white/50 hover:bg-white/80 border border-white/60 text-stone-700 rounded-[2rem] py-3 flex items-center justify-center gap-2 font-medium transition-all shadow-md active:scale-95"
                >
                  <QrCode size={18} /> Show QR
                </button>
              )}
              {portalSettings?.allowDirectImport !== false && (
                <button 
                  onClick={() => setImportSheet(true)}
                  className="flex-1 bg-white/50 hover:bg-white/80 border border-white/60 text-stone-700 rounded-[2rem] py-3 flex items-center justify-center gap-2 font-medium transition-all shadow-md active:scale-95"
                >
                  <MonitorSmartphone size={18} /> Import
                </button>
              )}
            </div>
          </div>

          {/* Support Icons */}
          {portalSettings?.showSupportSection !== false && (
            <div className="flex gap-6 justify-center mt-8 pt-6 border-t border-white/30 w-full">
              {portalSettings?.showTelegram && <a href={portalSettings.telegramLink} className="text-rose-500 hover:text-rose-600 transition-colors bg-white/40 p-3 rounded-full shadow-sm"><MessageCircle size={20}/></a>}
              {portalSettings?.showWhatsApp && <a href={portalSettings.whatsappLink} className="text-rose-500 hover:text-rose-600 transition-colors bg-white/40 p-3 rounded-full shadow-sm"><Phone size={20}/></a>}
              {portalSettings?.showWebsite && <a href={portalSettings.websiteUrl} className="text-rose-500 hover:text-rose-600 transition-colors bg-white/40 p-3 rounded-full shadow-sm"><Globe size={20}/></a>}
              {portalSettings?.showEmail && <a href={`mailto:${portalSettings.emailAddress}`} className="text-rose-500 hover:text-rose-600 transition-colors bg-white/40 p-3 rounded-full shadow-sm"><Mail size={20}/></a>}
            </div>
          )}

        </div>
      </motion.div>

      {/* Nodes minimal list below */}
      {nodes && nodes.length > 0 && (
        <motion.div 
          initial={{ opacity: 0 }} 
          animate={{ opacity: 1 }} 
          transition={{ delay: 0.5 }}
          className="w-full max-w-lg mt-8 space-y-3"
        >
          <div className="text-center text-xs font-bold text-stone-500 uppercase tracking-widest mb-4">Available Nodes</div>
          {nodes.map((node: any, idx: number) => (
            <div key={idx} className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl bg-white/40 border border-white/50 shadow-sm hover:bg-white/60 transition-colors">
              <div className="flex gap-2 shrink-0">
                <span className="px-3 py-1 bg-blue-500/10 text-blue-500 text-xs font-bold rounded-lg uppercase tracking-wider">{node.protocol}</span>
              </div>
              <div className="flex-1 text-base text-stone-700 font-medium truncate">{node.tag}</div>
              <div className="flex items-center gap-2 shrink-0">
                <button onClick={() => copyText(node.link, 'node_' + idx)} className="p-2.5 rounded-xl bg-white hover:bg-zinc-50 text-stone-500 transition-colors shadow-sm">
                  {copiedText === 'node_' + idx ? <Check size={16} className="text-orange-500"/> : <Copy size={16}/>}
                </button>
                <button onClick={() => openQR(node.link)} className="p-2.5 rounded-xl bg-white hover:bg-zinc-50 text-stone-500 transition-colors shadow-sm">
                  <QrCode size={16}/>
                </button>
              </div>
            </div>
          ))}
        </motion.div>
      )}

      {/* MODALS */}
      <AnimatePresence>
        {qrModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 20 }} className="bg-white/80 backdrop-blur-2xl border border-white/60 p-8 max-w-sm w-full relative shadow-2xl rounded-[2.5rem]">
              <button onClick={() => setQrModal(false)} className="absolute top-6 right-6 text-stone-400 hover:text-stone-600 bg-white/50 p-2 rounded-full"><X size={20} /></button>
              <h3 className="text-lg font-bold text-stone-800 text-center mb-6">Scan QR Code</h3>
              <div className="bg-white p-4 rounded-3xl flex justify-center mb-6 shadow-inner border border-stone-100">
                <QRCodeCanvas value={urlForQR} size={220} bgColor="#ffffff" fgColor="#1c1917" level="H" />
              </div>
              <p className="text-stone-500 text-sm text-center">Scan this code with your mobile client to instantly import configuration.</p>
            </motion.div>
          </motion.div>
        )}

        {importSheet && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-stone-900/40 backdrop-blur-sm">
            <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }} className="bg-white/80 backdrop-blur-2xl border border-white/60 p-8 w-full max-w-md relative shadow-2xl rounded-[2.5rem]">
              <button onClick={() => setImportSheet(false)} className="absolute top-6 right-6 text-stone-400 hover:text-stone-600 bg-white/50 p-2 rounded-full"><X size={20} /></button>
              <h3 className="text-lg font-bold text-stone-800 text-center mb-6">Import to Application</h3>
              <div className="space-y-3">
                <a href={`v2rayng://install-config?url=${encodeURIComponent(nativeUrl)}`} className="block w-full text-center bg-white/60 hover:bg-white border border-white/60 text-stone-800 font-semibold py-4 rounded-[1.5rem] transition-colors shadow-sm">
                  Import to V2rayNG
                </a>
                <a href={`shadowrocket://add/sub://${btoa(nativeUrl)}`} className="block w-full text-center bg-white/60 hover:bg-white border border-white/60 text-stone-800 font-semibold py-4 rounded-[1.5rem] transition-colors shadow-sm">
                  Import to Shadowrocket
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
