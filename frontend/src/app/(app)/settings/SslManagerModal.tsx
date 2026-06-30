"use client";

import React, { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Shield, RefreshCw, X, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useToast } from "@/components/toast";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/store/auth";

interface SslStatus {
  mode: string;
  domain: string;
  isHttpsEnabled: boolean;
  provider?: string;
  certPath?: string;
  certificate: {
    exists: boolean;
    expiration?: string;
    daysRemaining?: number;
    issuer?: string;
  };
  warning?: string;
}

export function SslManagerModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);
  const token = useAuth((s) => s.token);
  const isSuccessRef = React.useRef(false);

  const { data: sslInfo, isLoading, refetch } = useQuery({
    queryKey: ["sslStatus"],
    queryFn: async () => (await api.get<SslStatus>("/settings/ssl")).data,
    enabled: isOpen,
  });

  const [view, setView] = useState<"status" | "issue" | "change" | "progress">("status");
  const [form, setForm] = useState({ domain: "", email: "", selfSigned: false });
  const [logs, setLogs] = useState<string[]>([]);
  const [workflowState, setWorkflowState] = useState<"idle" | "running" | "success" | "error">("idle");
  const [workflowError, setWorkflowError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setView("status");
      setLogs([]);
      setWorkflowState("idle");
    }
  }, [isOpen]);

  const startStream = () => {
    const url = new URL(api.defaults.baseURL + "/settings/ssl/stream", window.location.origin);
    if (token) url.searchParams.append("token", token);
    const eventSource = new EventSource(url.toString());
    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "progress") {
          setLogs((prev) => [...prev, data.message]);
        } else if (data.type === "complete") {
          isSuccessRef.current = true;
          setWorkflowState("success");
          eventSource.close();

          const currentProtocol = window.location.protocol;
          const currentHost = window.location.hostname;
          let newProtocol = currentProtocol;
          let newHost = currentHost;

          if (data.data?.domain) newHost = data.data.domain;
          if (data.data?.https !== undefined) newProtocol = data.data.https ? "https:" : "http:";
          else if (data.data?.domain) newProtocol = "https:"; // Issue/change domain always results in HTTPS

          if (newProtocol !== currentProtocol || newHost !== currentHost) {
            setTimeout(() => {
              window.location.href = `${newProtocol}//${newHost}${window.location.pathname}`;
            }, 2500);
          }
        } else if (data.type === "error") {
          setWorkflowState("error");
          setWorkflowError(data.error?.message || data.error?.reason || "Unknown error occurred.");
          eventSource.close();
        }
      } catch (e) {
        // parse error
      }
    };
    eventSource.onerror = () => {
      // Do not close. Allow browser to auto-reconnect when Nginx is restarting.
    };
    return eventSource;
  };

  const executeAction = async (actionFn: () => Promise<any>) => {
    setView("progress");
    setWorkflowState("running");
    setLogs(["Starting workflow..."]);
    isSuccessRef.current = false;
    const es = startStream();
    try {
      await actionFn();
      // Refetch info
      refetch();
    } catch (err: any) {
      if (isSuccessRef.current) return;
      if (err.message === "Network Error") return; // Nginx restart drops connection
      setWorkflowState("error");
      setWorkflowError(err.response?.data?.message || err.message || "Failed to execute action.");
      es.close();
    }
  };

  const handleIssue = () => {
    executeAction(() => api.post("/settings/ssl/issue", form));
  };

  const handleChangeDomain = () => {
    executeAction(() => api.post("/settings/ssl/change-domain", form));
  };

  const handleRenew = () => {
    executeAction(() => api.post("/settings/ssl/renew"));
  };

  const handleDisable = () => {
    if (confirm("Are you sure you want to disable HTTPS?")) {
      executeAction(() => api.post("/settings/ssl/switch", { enableHttps: false }));
    }
  };

  const handleRepair = () => {
    executeAction(() => api.post("/settings/ssl/switch", { enableHttps: true }));
  };

  if (!isOpen) return null;

  const isIp = sslInfo?.domain && (/^[0-9\.]+$/.test(sslInfo.domain) || sslInfo.domain === "localhost");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => workflowState !== 'running' && onClose()} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
              <Shield size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white">SSL Manager</h2>
              <p className="text-sm text-zinc-500">Manage your platform's security and domains</p>
            </div>
          </div>
          {workflowState !== 'running' && (
            <button onClick={onClose} className="p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200 transition-colors">
              <X size={20} />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-zinc-400" /></div>
          ) : view === "progress" ? (
            <div className="space-y-6">
              <div className="flex items-center gap-4">
                {workflowState === "running" && <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />}
                {workflowState === "success" && <CheckCircle className="w-6 h-6 text-emerald-500" />}
                {workflowState === "error" && <AlertCircle className="w-6 h-6 text-red-500" />}
                <span className="font-medium text-lg">
                  {workflowState === "running" ? "Processing..." : workflowState === "success" ? "Completed Successfully" : "Workflow Failed"}
                </span>
              </div>
              
              <div className="bg-zinc-950 rounded-xl p-4 font-mono text-sm h-64 overflow-y-auto space-y-2">
                {logs.map((log, i) => (
                  <div key={i} className="text-zinc-300 flex gap-3">
                    <span className="text-zinc-600 shrink-0">{(new Date()).toLocaleTimeString()}</span>
                    <span>{log}</span>
                  </div>
                ))}
              </div>

              {workflowState === "error" && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-600 dark:text-red-400 text-sm">
                  {workflowError}
                </div>
              )}

              {workflowState !== "running" && (
                <button
                  onClick={() => { setView("status"); refetch(); }}
                  className="w-full py-3 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white font-medium rounded-xl transition-colors"
                >
                  Return to Status
                </button>
              )}
            </div>
          ) : view === "issue" ? (
            <div className="space-y-4">
              <h3 className="font-bold text-lg mb-4">Issue New Certificate</h3>
              <div className="space-y-2">
                <label className="text-sm font-medium">Domain Name</label>
                <input
                  type="text"
                  value={form.domain}
                  onChange={e => setForm({...form, domain: e.target.value})}
                  placeholder="e.g. panel.example.com"
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Admin Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm({...form, email: e.target.value})}
                  placeholder="admin@example.com"
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2"
                />
              </div>
              <div className="flex items-center gap-2 mt-2">
                <input type="checkbox" id="selfsigned" checked={form.selfSigned} onChange={e => setForm({...form, selfSigned: e.target.checked})} className="rounded text-indigo-600 focus:ring-indigo-500" />
                <label htmlFor="selfsigned" className="text-sm">Use Self-Signed Certificate</label>
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={() => setView("status")} className="flex-1 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors">Cancel</button>
                <button onClick={handleIssue} disabled={!form.domain} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg disabled:opacity-50 hover:bg-indigo-700 transition-colors">Issue Certificate</button>
              </div>
            </div>
          ) : view === "change" ? (
             <div className="space-y-4">
              <h3 className="font-bold text-lg mb-4">Change Domain</h3>
              <p className="text-sm text-zinc-500 mb-4">This will issue a new certificate and update your panel's domain. If it fails, the previous configuration will be restored automatically.</p>
              <div className="space-y-2">
                <label className="text-sm font-medium">New Domain Name</label>
                <input
                  type="text"
                  value={form.domain}
                  onChange={e => setForm({...form, domain: e.target.value})}
                  placeholder="e.g. new.example.com"
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Admin Email</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => setForm({...form, email: e.target.value})}
                  placeholder="admin@example.com"
                  className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg px-4 py-2"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button onClick={() => setView("status")} className="flex-1 py-2 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-lg transition-colors">Cancel</button>
                <button onClick={handleChangeDomain} disabled={!form.domain} className="flex-1 py-2 bg-indigo-600 text-white rounded-lg disabled:opacity-50 hover:bg-indigo-700 transition-colors">Change Domain</button>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-200 dark:border-zinc-800/50">
                  <p className="text-xs text-zinc-500 mb-1">Current Domain</p>
                  <p className="font-mono font-medium">{sslInfo?.domain}</p>
                </div>
                <div className="p-4 bg-zinc-50 dark:bg-zinc-900/50 rounded-xl border border-zinc-200 dark:border-zinc-800/50">
                  <p className="text-xs text-zinc-500 mb-1">Mode</p>
                  <p className="font-medium flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${sslInfo?.isHttpsEnabled ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    {sslInfo?.isHttpsEnabled ? "HTTPS Active" : "HTTP Only"}
                  </p>
                </div>
              </div>

              {sslInfo?.certificate?.exists ? (
                <div className="space-y-4 border-t border-zinc-200 dark:border-zinc-800 pt-6">
                  <h3 className="font-bold">Certificate Details</h3>
                  <div className="space-y-3 text-sm bg-zinc-50 dark:bg-zinc-900/50 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800/50">
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Provider</span>
                      <span className="font-medium">{sslInfo.provider}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Issuer</span>
                      <span className="font-medium truncate max-w-[200px]" title={sslInfo.certificate.issuer}>{sslInfo.certificate.issuer || 'Unknown'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-zinc-500">Expires</span>
                      <span className={`font-medium ${(sslInfo.certificate.daysRemaining || 0) < 15 ? 'text-amber-500' : 'text-emerald-500'}`}>
                        {sslInfo.certificate.expiration ? new Date(sslInfo.certificate.expiration).toLocaleDateString() : 'Unknown'} 
                        {' '}({sslInfo.certificate.daysRemaining} days left)
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 pt-2">
                    {!isIp && sslInfo.provider !== 'Self Signed' && (
                      <button onClick={handleRenew} className="flex items-center justify-center gap-2 py-2.5 bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-500/20 transition-colors">
                        <RefreshCw size={16} /> Renew Cert
                      </button>
                    )}
                    <button onClick={handleRepair} className="flex items-center justify-center gap-2 py-2.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
                      Repair Config
                    </button>
                    {!isIp && (
                      <button onClick={() => { setForm({...form, domain: sslInfo.domain}); setView("change"); }} className="col-span-2 py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg font-medium hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors">
                        Change Domain
                      </button>
                    )}
                    <button onClick={handleDisable} className="col-span-2 py-2.5 border border-red-200 dark:border-red-900 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
                      Disable HTTPS
                    </button>
                  </div>
                </div>
              ) : (
                <div className="border-t border-zinc-200 dark:border-zinc-800 pt-6">
                  {isIp ? (
                    <div className="p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-900/50 rounded-xl text-amber-600 dark:text-amber-400 text-sm flex gap-3 items-start">
                      <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                      <p>SSL cannot be configured for IP addresses. To enable HTTPS, you must assign a domain name to your server.</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <div className="p-4 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 rounded-xl text-indigo-600 dark:text-indigo-400 text-sm">
                        No active certificate found. You can easily issue a free Let's Encrypt certificate or configure a self-signed one.
                      </div>
                      <button onClick={() => { setForm({ domain: sslInfo?.domain || "", email: "admin@" + (sslInfo?.domain || "example.com"), selfSigned: false }); setView("issue"); }} className="w-full py-3 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-500/20">
                        Setup HTTPS Now
                      </button>
                      {sslInfo?.isHttpsEnabled && (
                        <button onClick={handleDisable} className="w-full py-3 border border-red-200 dark:border-red-900 text-red-600 font-medium rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                          Fallback to HTTP Mode
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
