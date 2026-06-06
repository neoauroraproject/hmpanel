"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { QrCode, MonitorSmartphone, X, MessageCircle, Phone, Globe, Mail } from "lucide-react";
import { QRCodeCanvas } from "qrcode.react";
import { formatBytes, formatDate } from "@/lib/format";
import { useQuery } from "@tanstack/react-query";
import { API_BASE } from "@/lib/api";

export default function HackerTheme({ id, data }: { id: string; data: any }) {
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
  const brandName = portalSettings?.portalName || "SYSTEM";

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

  const drawProgressBar = (percentage: number) => {
    const totalBars = 30;
    const filledBars = Math.round((percentage / 100) * totalBars);
    return `[${"#".repeat(filledBars)}${".".repeat(totalBars - filledBars)}] ${percentage.toFixed(1)}%`;
  };

  // ASCII Art generation for Logo (very basic fallback)
  const asciiLogo = `
  ___  _   _  ___  
 / _ \\| | | |/ _ \\ 
| (_) | |_| | (_) |
 \\___/ \\___/ \\___/ 
  `;

  return (
    <div className="min-h-[100dvh] w-full bg-black text-green-500 font-mono p-4 md:p-8 flex flex-col selection:bg-green-500/30">
      
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} className="w-full max-w-4xl mx-auto border border-dashed border-green-500/50 p-6 md:p-10 relative shadow-[0_0_15px_rgba(34,197,94,0.1)]">
        <div className="absolute top-0 left-0 bg-black px-2 -mt-3 ml-4 text-green-400 font-bold">
          TERMINAL_ACCESS
        </div>
        
        <div className="space-y-6">
          
          {/* Header & Logo */}
          <div className="flex flex-col md:flex-row gap-6 border-b border-dashed border-green-900/50 pb-6 mb-6">
            {portalSettings?.logoUrl ? (
              <img src={portalSettings.logoUrl} alt={brandName} className="h-20 w-auto filter grayscale opacity-80 mix-blend-screen" />
            ) : (
              <pre className="text-green-700 text-[10px] leading-tight select-none hidden sm:block">
                {asciiLogo}
              </pre>
            )}
            <div className="flex flex-col justify-end">
              <div className="text-green-700">root@system:~# echo $HOSTNAME</div>
              <div className="text-2xl font-bold uppercase tracking-widest">{brandName}</div>
            </div>
          </div>

          <div className="flex flex-col gap-1">
            <div className="text-green-700">root@system:~# whoami</div>
            <div className="text-xl md:text-3xl font-bold">{clientName}</div>
            <div className="text-sm text-green-700">UUID: {uuid}</div>
          </div>

          <div className="flex flex-col gap-1 mt-6">
            <div className="text-green-700">root@system:~# ./check_status.sh</div>
            <div className="flex items-center gap-2">
              <span className="text-green-400">STATUS:</span>
              <span className={isActive ? "text-green-400 animate-pulse font-bold" : "text-red-500 font-bold"}>
                [{isActive ? "ONLINE" : "OFFLINE"}]
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-green-400">EXPIRY:</span>
              <span>{expiryTime > 0 ? formatDate(expiryTime) : "NEVER"}</span>
            </div>
          </div>

          <div className="flex flex-col gap-1 mt-6">
            <div className="text-green-700">root@system:~# ./check_quota.sh</div>
            <div className="mt-2">
              <div className="mb-1 text-sm flex justify-between max-w-md">
                <span>{formatBytes(used)}</span>
                <span>{total === 0 ? "UNLIMITED" : formatBytes(total)}</span>
              </div>
              <div className="text-green-400">
                {drawProgressBar(pct)}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1 mt-6">
            <div className="text-green-700">root@system:~# cat connection_info.txt</div>
            
            <div className="mt-4 border border-green-900 bg-green-950/20 p-4 relative group">
              <div className="text-xs text-green-700 mb-2">## SUBSCRIPTION_LINK</div>
              <div className="truncate text-green-400 mb-4">{nativeUrl}</div>
              
              <div className="flex flex-wrap gap-4">
                <button 
                  onClick={() => copyText(nativeUrl, 'sub')}
                  className="bg-green-900/50 hover:bg-green-800 text-green-400 px-4 py-2 text-sm transition-colors border border-green-800"
                >
                  {copiedText === 'sub' ? "> COPIED" : "> COPY_LINK"}
                </button>

                {portalSettings?.showNativeQR !== false && (
                  <button 
                    onClick={() => openQR(nativeUrl)}
                    className="bg-transparent hover:bg-green-900/30 text-green-500 px-4 py-2 text-sm transition-colors border border-green-900 flex items-center gap-2"
                  >
                    <QrCode size={14} /> GENERATE_QR
                  </button>
                )}

                {portalSettings?.allowDirectImport !== false && (
                  <button 
                    onClick={() => setImportSheet(true)}
                    className="bg-transparent hover:bg-green-900/30 text-green-500 px-4 py-2 text-sm transition-colors border border-green-900 flex items-center gap-2"
                  >
                    <MonitorSmartphone size={14} /> AUTO_INJECT
                  </button>
                )}
              </div>
            </div>
          </div>

          {nodes && nodes.length > 0 && (
            <div className="flex flex-col gap-1 mt-6">
              <div className="text-green-700">root@system:~# ls -l /nodes</div>
              <div className="mt-2 flex flex-col gap-2">
                {nodes.map((node: any, idx: number) => (
                  <div key={idx} className="flex flex-col md:flex-row md:items-center justify-between border-b border-dashed border-green-900/50 py-2 hover:bg-green-950/30">
                    <div className="truncate">{node.tag}</div>
                    <button 
                      onClick={() => copyText(node.link, `node-${idx}`)}
                      className="text-xs text-green-600 hover:text-green-400 transition-colors mt-2 md:mt-0"
                    >
                      {copiedText === `node-${idx}` ? "[COPIED]" : "[COPY]"}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Support section terminal style */}
          {portalSettings?.showSupportSection !== false && (
            <div className="flex flex-col gap-1 mt-6 pt-6 border-t border-dashed border-green-900/50">
              <div className="text-green-700">root@system:~# ./contact_admin.sh</div>
              <div className="flex gap-6 mt-4">
                {portalSettings?.showTelegram && <a href={portalSettings.telegramLink} className="text-green-600 hover:text-green-400"><MessageCircle size={20}/></a>}
                {portalSettings?.showWhatsApp && <a href={portalSettings.whatsappLink} className="text-green-600 hover:text-green-400"><Phone size={20}/></a>}
                {portalSettings?.showWebsite && <a href={portalSettings.websiteUrl} className="text-green-600 hover:text-green-400"><Globe size={20}/></a>}
                {portalSettings?.showEmail && <a href={`mailto:${portalSettings.emailAddress}`} className="text-green-600 hover:text-green-400"><Mail size={20}/></a>}
              </div>
            </div>
          )}

          <div className="pt-2 mt-2 text-green-700 text-sm animate-pulse">
            _
          </div>
        </div>
      </motion.div>

      {/* MODALS */}
      <AnimatePresence>
        {qrModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }} className="bg-black border border-green-500 p-8 max-w-sm w-full relative shadow-[0_0_30px_rgba(34,197,94,0.2)]">
              <button onClick={() => setQrModal(false)} className="absolute top-4 right-4 text-green-700 hover:text-green-400"><X size={24} /></button>
              <div className="text-green-600 mb-6 font-bold uppercase text-center border-b border-dashed border-green-900 pb-2">OPTICAL_DATA_MATRIX</div>
              <div className="bg-white p-4 rounded-sm flex justify-center mb-6">
                <QRCodeCanvas value={urlForQR} size={220} bgColor="#ffffff" fgColor="#000000" level="H" />
              </div>
              <p className="text-green-700 text-xs text-center">Execute scanner protocol.</p>
            </motion.div>
          </motion.div>
        )}

        {importSheet && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/90 backdrop-blur-sm">
            <motion.div initial={{ y: 100 }} animate={{ y: 0 }} exit={{ y: 100 }} className="bg-black border border-green-500 p-8 w-full max-w-md relative shadow-[0_0_30px_rgba(34,197,94,0.2)]">
              <button onClick={() => setImportSheet(false)} className="absolute top-4 right-4 text-green-700 hover:text-green-400"><X size={24} /></button>
              <div className="text-green-600 mb-6 font-bold uppercase text-center border-b border-dashed border-green-900 pb-2">EXECUTE_INJECTION</div>
              <div className="space-y-4">
                <a href={`v2rayng://install-config?url=${encodeURIComponent(nativeUrl)}`} className="block w-full text-center bg-green-950/30 border border-green-800 hover:bg-green-900 text-green-400 py-4 uppercase tracking-widest text-xs transition-colors">
                  ./inject_v2rayng.sh
                </a>
                <a href={`shadowrocket://add/sub://${btoa(nativeUrl)}`} className="block w-full text-center bg-green-950/30 border border-green-800 hover:bg-green-900 text-green-400 py-4 uppercase tracking-widest text-xs transition-colors">
                  ./inject_shadowrocket.sh
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
