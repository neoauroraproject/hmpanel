"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useParams } from "next/navigation";
import { AlertCircle, RefreshCw, CheckCircle2, Clock, XCircle, Package, Copy, Check, QrCode } from "lucide-react";
import { useState, useEffect } from "react";
import QRCode from "react-qr-code";

export default function TrackOrderPage() {
  const params = useParams();
  const code = params.code as string;

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["track", code],
    queryFn: async () => (await api.get(`/store/track/${code}`)).data,
    refetchInterval: (query: any) => (query?.state?.data?.status === 'PENDING' ? 5000 : false), // Poll every 5s while pending
  });

  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (isLoading && !data) {
    return <div className="min-h-screen flex items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="animate-spin text-blue-500"><RefreshCw size={32} /></div>
    </div>;
  }

  if (error || !data) {
    return <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-50 dark:bg-zinc-950 p-4">
      <AlertCircle size={48} className="text-red-500 mb-4" />
      <h1 className="text-2xl font-bold text-zinc-800 dark:text-zinc-100 mb-2">Order Not Found</h1>
      <p className="text-zinc-500">The tracking code you entered is invalid.</p>
    </div>;
  }

  const { trackingCode, status, productName, isRenewal, delivery } = data;

  const StatusIcon = status === 'PENDING' ? Clock : status === 'DELIVERED' ? CheckCircle2 : XCircle;
  const statusColor = status === 'PENDING' ? 'text-amber-500 bg-amber-500/10 border-amber-500/20' : 
                      status === 'DELIVERED' ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20' : 
                      'text-red-500 bg-red-500/10 border-red-500/20';

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-12 px-4 font-sans text-zinc-900 dark:text-zinc-100">
      <div className="max-w-xl mx-auto">
        <div className="bg-white dark:bg-zinc-900 rounded-3xl p-8 shadow-sm border border-zinc-200 dark:border-zinc-800">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold mb-2">Order Tracking</h1>
            <p className="text-zinc-500 text-sm">Keep this tracking code safe</p>
            <div className="mt-4 font-mono text-2xl font-black tracking-widest text-zinc-800 dark:text-zinc-100 bg-zinc-100 dark:bg-zinc-950 py-3 px-6 rounded-xl inline-block border border-zinc-200 dark:border-zinc-800">
              {trackingCode}
            </div>
          </div>

          <div className={`p-6 rounded-2xl border ${statusColor} mb-8 flex flex-col items-center justify-center text-center`}>
            <StatusIcon size={48} className="mb-4" />
            <h2 className="text-xl font-bold mb-1">
              {status === 'PENDING' ? "Order Processing" : 
               status === 'DELIVERED' ? "Order Complete" : "Order Rejected"}
            </h2>
            <p className="text-sm opacity-80">
              {status === 'PENDING' ? "We are verifying your payment. This page will update automatically." : 
               status === 'DELIVERED' ? "Your order has been approved and delivered." : "Your order was rejected. Please contact support."}
            </p>
          </div>

          <div className="space-y-4">
            <div className="flex justify-between items-center py-3 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-500 text-sm">Product</span>
              <span className="font-semibold flex items-center gap-2"><Package size={14}/> {productName}</span>
            </div>
            <div className="flex justify-between items-center py-3 border-b border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-500 text-sm">Type</span>
              <span className="font-semibold">{isRenewal ? "Renewal" : "New Account"}</span>
            </div>
          </div>

          {status === 'DELIVERED' && delivery && (
            <div className="mt-8">
              <h3 className="font-bold text-lg mb-4 text-emerald-600 dark:text-emerald-400">Your Subscription</h3>
              {isRenewal ? (
                <div className="bg-emerald-50 dark:bg-emerald-500/10 p-5 rounded-xl border border-emerald-100 dark:border-emerald-500/20">
                  <p className="text-sm text-emerald-800 dark:text-emerald-300">Your existing subscription has been successfully renewed and extended. You do not need to change anything in your app.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-zinc-500 uppercase tracking-wider mb-2">Subscription Link</label>
                    <div className="flex gap-2">
                      <input 
                        readOnly 
                        value={`${window.location.origin}/s/${delivery.subToken}`} 
                        className="flex-1 bg-zinc-100 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 text-sm text-zinc-700 dark:text-zinc-300 outline-none font-mono"
                      />
                      <button 
                        onClick={() => handleCopy(`${window.location.origin}/s/${delivery.subToken}`)}
                        className="p-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-colors"
                      >
                        {copied ? <Check size={20} /> : <Copy size={20} />}
                      </button>
                    </div>
                  </div>
                  
                  <div className="pt-4 border-t border-zinc-100 dark:border-zinc-800">
                    <button 
                      onClick={() => setShowQR(!showQR)}
                      className="w-full py-3 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-colors"
                    >
                      <QrCode size={18} /> {showQR ? "Hide QR Code" : "Show QR Code"}
                    </button>
                  </div>

                  {showQR && (
                    <div className="flex justify-center p-4 bg-white rounded-xl border border-zinc-200">
                      <QRCode value={`${window.location.origin}/s/${delivery.subToken}`} size={200} />
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
