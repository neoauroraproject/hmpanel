"use client";

import { X, Copy, Check, Download, Info } from "lucide-react";
import { QRCodeCanvas, QRCodeSVG } from "qrcode.react";
import { useState } from "react";
import { formatBytes } from "@/lib/format";
import { useToast } from "@/components/toast";
import { API_BASE } from "@/lib/api";
import { motion } from "framer-motion";

interface ConnectionDetailsModalProps {
  client: any; // Full client object containing inbound, panel info, etc.
  portalSettings: any;
  onClose: () => void;
}

function CopyBtn({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-2 rounded bg-zinc-100 dark:bg-zinc-800 px-3 py-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-700 transition-colors"
    >
      {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
      {label || "Copy URL"}
    </button>
  );
}

export function ConnectionDetailsModal({ client, portalSettings, onClose }: ConnectionDetailsModalProps) {
  const toast = useToast((s) => s.push);
  const [activeTab, setActiveTab] = useState<"platform" | "native">(
    portalSettings?.showPlatformQR !== false ? "platform" : "native"
  );

  const [selectedInboundId, setSelectedInboundId] = useState<string>(
    client.inbounds?.[0]?.id || client.inbound?.id || ""
  );

  const used = Number(client.up) + Number(client.down);
  const total = Number(client.total);

  const currentInbound = client.inbounds?.find((i: any) => i.id === selectedInboundId) || client.inbound;

  const getSystemLink = () => {
    if (!client.subId) return 'No Sub ID available';
    return `${window.location.origin}/s/${client.subId}`;
  };

  const getNativeLink = () => {
    if (!client.subId && !client.email) return 'No Sub ID available';
    const sub = encodeURIComponent(client.subId || client.email);
    if (currentInbound?.panel?.subUrl) {
      const base = currentInbound.panel.subUrl.endsWith('/') 
        ? currentInbound.panel.subUrl 
        : `${currentInbound.panel.subUrl}/`;
      return `${base}${sub}`;
    }
    if (currentInbound?.panel?.url) {
      try {
        const parsed = new URL(currentInbound.panel.url);
        return `${parsed.origin}/sub/${sub}`;
      } catch {
        const base = currentInbound.panel.url.endsWith('/') 
          ? currentInbound.panel.url 
          : `${currentInbound.panel.url}/`;
        return `${base}sub/${sub}`;
      }
    }
    return `${typeof window !== 'undefined' ? window.location.origin : ''}/sub/${sub}`;
  };

  const platformUrl = getSystemLink();
  const nativeUrl = getNativeLink();

  const downloadQR = (id: string, filename: string, format: 'png' | 'svg' = 'png') => {
    if (format === 'png') {
      const canvas = document.getElementById(id) as HTMLCanvasElement;
      if (canvas) {
        const pngUrl = canvas.toDataURL("image/png").replace("image/png", "image/octet-stream");
        let downloadLink = document.createElement("a");
        downloadLink.href = pngUrl;
        downloadLink.download = `${filename}.png`;
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
      }
    }
  };

  const showPlatform = portalSettings?.showPlatformQR !== false;
  const showNative = portalSettings?.showNativeQR !== false;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      onClick={onClose}
    >
      <motion.div 
        initial={{ scale: 0.95, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 20 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        className="w-full max-w-lg rounded-t-3xl md:rounded-2xl border-t border-x md:border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-0 overflow-y-auto shadow-2xl mt-auto md:mt-0 max-h-[90vh] md:max-h-none safe-pb"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-800 p-4 bg-white dark:bg-zinc-900/50">
          <h2 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">Connection Details</h2>
          <button onClick={onClose} className="rounded p-1 text-zinc-500 hover:bg-zinc-100 dark:bg-zinc-800 hover:text-zinc-600 dark:text-zinc-300 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Client Info Summary */}
          <div className="grid grid-cols-2 gap-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 p-4 border border-zinc-200 dark:border-zinc-800">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Client Identity</div>
              <div className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{client.remark || client.email}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Status</div>
              <div className="text-sm">
                {client.enable ? (
                  <span className="text-emerald-400 font-medium flex items-center gap-1">Active</span>
                ) : (
                  <span className="text-red-400 font-medium">Disabled</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Traffic Usage</div>
              <div className="text-sm text-zinc-600 dark:text-zinc-300">
                <span className="font-semibold text-zinc-800 dark:text-zinc-100">{formatBytes(used)}</span> / {total === 0 ? "Unlimited" : formatBytes(total)}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1">Selected Node</div>
              <div className="text-sm text-zinc-600 dark:text-zinc-300 truncate">{currentInbound?.panel?.name || "Local Node"}</div>
            </div>
          </div>

          {/* Node Switcher for Multi-Inbound Clients */}
          {client.inbounds && client.inbounds.length > 1 && (
            <div className="space-y-1.5 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-4">
              <label className="text-[10px] uppercase tracking-wider text-zinc-500 font-bold mb-1 block">Switch Active Node View</label>
              <select
                value={selectedInboundId}
                onChange={(e) => setSelectedInboundId(e.target.value)}
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500"
              >
                {client.inbounds.map((inb: any) => (
                  <option key={inb.id} value={inb.id}>
                    {inb.panel?.name || "Node"} — {inb.remark || inb.tag} ({inb.protocol} on port {inb.port})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Tabs */}
          {(showPlatform || showNative) && (
            <div className="flex border-b border-zinc-200 dark:border-zinc-800">
              {showPlatform && (
                <button
                  className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "platform" ? "border-blue-500 text-blue-400 bg-blue-500/5" : "border-transparent text-zinc-500 hover:text-zinc-600 dark:text-zinc-300"}`}
                  onClick={() => setActiveTab("platform")}
                >
                  Platform QR
                </button>
              )}
              {showNative && (
                <button
                  className={`flex-1 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === "native" ? "border-emerald-500 text-emerald-400 bg-emerald-500/5" : "border-transparent text-zinc-500 hover:text-zinc-600 dark:text-zinc-300"}`}
                  onClick={() => setActiveTab("native")}
                >
                  Native 3x-ui QR
                </button>
              )}
            </div>
          )}

          {/* QR Code Content */}
          <div className="flex flex-col items-center justify-center py-2 space-y-6">
            {activeTab === "platform" && showPlatform && (
              <>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(platformUrl);
                    toast("Copied platform subscription URL", "success");
                  }}
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-blue-600 text-white font-bold hover:bg-blue-500 transition-colors shadow-md"
                >
                  <Copy size={18} /> Copy Subscription URL
                </button>
                
                <div className="text-xs uppercase tracking-widest text-zinc-500 font-bold my-2">Or scan QR code</div>
                
                <div className="rounded-xl bg-white p-3 shadow-lg ring-4 ring-zinc-800 relative">
                  <QRCodeCanvas id="qr-platform" value={platformUrl} size={180} level="M" />
                  <div className="hidden">
                    <QRCodeSVG id="qr-platform-svg" value={platformUrl} size={180} level="M" />
                  </div>
                </div>
                
                {portalSettings?.allowQRDownload !== false && (
                  <div className="flex w-full gap-2 mt-4">
                    <button 
                      onClick={() => downloadQR("qr-platform", `PlatformQR_${client.email}`, "png")}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
                    >
                      <Download size={16} /> Download Image
                    </button>
                  </div>
                )}
              </>
            )}

            {activeTab === "native" && showNative && (
              <>
                <button 
                  onClick={() => {
                    navigator.clipboard.writeText(nativeUrl);
                    toast("Copied native node link", "success");
                  }}
                  className="flex items-center justify-center gap-2 w-full py-3 rounded-xl bg-emerald-600 text-white font-bold hover:bg-emerald-500 transition-colors shadow-md"
                >
                  <Copy size={18} /> Copy Direct Node Link
                </button>
                
                <div className="text-xs uppercase tracking-widest text-zinc-500 font-bold my-2">Or scan QR code</div>

                <div className="rounded-xl bg-white p-3 shadow-lg ring-4 ring-zinc-800 relative">
                  <QRCodeCanvas id="qr-native" value={nativeUrl} size={180} level="M" />
                  <div className="hidden">
                    <QRCodeSVG id="qr-native-svg" value={nativeUrl} size={180} level="M" />
                  </div>
                </div>
                
                {portalSettings?.allowQRDownload !== false && (
                  <div className="flex w-full gap-2 mt-4">
                    <button 
                      onClick={() => downloadQR("qr-native", `NativeQR_${client.email}`, "png")}
                      className="flex w-full items-center justify-center gap-2 rounded-lg bg-zinc-100 dark:bg-zinc-800 px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-700 hover:text-white transition-colors"
                    >
                      <Download size={16} /> Download Image
                    </button>
                  </div>
                )}
              </>
            )}

            {!showPlatform && !showNative && (
              <div className="text-center text-zinc-500 text-sm py-8 flex flex-col items-center gap-3">
                <Info size={32} className="text-zinc-600" />
                QR Codes have been disabled by the portal administrator.
              </div>
            )}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}
