"use client";

import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Shield, RefreshCw, X, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { motion } from "framer-motion";

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
  isCorrupted?: boolean;
  diagnostics?: {
    dnsResolution: string;
    resolvedIp: string;
    expectedServerIp: string;
    httpVirtualHost: string;
    httpsVirtualHost: string;
    serverName: string;
    tcp80: string;
    tcp443: string;
    certificateExists: string;
    certificateValid: string;
    certificateLoaded: string;
    nginxConfig: string;
    nginxListening443: string;
    tlsHandshake: string;
    httpHealth: string;
    httpsHealth: string;
    backend: string;
    frontend: string;
    redirect: string;
  };
}

export function SslManagerModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const token = useAuth((s) => s.token);
  const isSuccessRef = React.useRef(false);
  const isExecutingRef = React.useRef(false);

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
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
    eventSource.onopen = () => {
      setLogs(["Starting workflow..."]);
    };
    eventSource.onerror = () => {
      // Do not close. Allow browser to auto-reconnect when Nginx is restarting.
    };
    return eventSource;
  };

  const executeAction = async (actionFn: () => Promise<unknown>) => {
    if (isExecutingRef.current) return;
    isExecutingRef.current = true;
    setView("progress");
    setWorkflowState("running");
    setLogs(["Starting workflow..."]);
    isSuccessRef.current = false;
    const es = startStream();
    try {
      await actionFn();
      refetch();
    } catch (err: unknown) {
      if (isSuccessRef.current) return;
      
      let message = "Failed to execute action.";
      if (err instanceof Error) {
        if (err.message === "Network Error") return; // Nginx restart drops connection
        message = err.message;
      }
      
      const axiosErr = err as { response?: { data?: { message?: string } } };
      if (axiosErr?.response?.data?.message) {
        message = axiosErr.response.data.message;
      }

      setWorkflowState("error");
      setWorkflowError(message);
      es.close();
    } finally {
      isExecutingRef.current = false;
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
    executeAction(() => api.post("/settings/ssl/repair"));
  };

  if (!isOpen) return null;

  const isIp = sslInfo?.domain && (/^[0-9\.]+$/.test(sslInfo.domain) || sslInfo.domain === "localhost");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => workflowState !== 'running' && onClose()} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
      >
        <div className="flex items-center justify-between p-6 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-500">
              <Shield size={24} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-zinc-900 dark:text-white">SSL Manager</h2>
              <p className="text-sm text-zinc-500">Manage your {"platform's"} security and domains</p>
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
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-650 dark:text-red-400 text-sm">
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
              <p className="text-sm text-zinc-500 mb-4">This will issue a new certificate and update your {"panel's"} domain. If it fails, the previous configuration will be restored automatically.</p>
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
                    <span className={`w-2 h-2 rounded-full ${sslInfo?.isCorrupted ? 'bg-red-500' : sslInfo?.isHttpsEnabled ? 'bg-emerald-500' : 'bg-amber-500'}`} />
                    {sslInfo?.isCorrupted ? "Corrupted" : sslInfo?.isHttpsEnabled ? "HTTPS Active" : "HTTP Only"}
                  </p>
                </div>
              </div>

              {sslInfo?.isCorrupted && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-650 dark:text-red-400 text-sm flex gap-3 items-start">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-red-650 dark:text-red-300">Configuration State Corrupted</p>
                    <p className="mt-1">The {"system's"} SSL configuration is inconsistent. Nginx configuration, .env file, or mounted certificates do not match. Please use the Repair Config button below to restore consistency.</p>
                  </div>
                </div>
              )}

              {sslInfo?.warning && !sslInfo?.isCorrupted && (
                <div className="p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-650 dark:text-amber-400 text-sm">
                  {sslInfo.warning}
                </div>
              )}

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
                      <button onClick={() => { setForm({ domain: sslInfo.domain, email: "admin@" + sslInfo.domain, selfSigned: false }); setView("change"); }} className="col-span-2 py-2.5 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-lg font-medium hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors">
                        Change Domain
                      </button>
                    )}
                    <button onClick={handleDisable} className="col-span-2 py-2.5 border border-red-200 dark:border-red-900 text-red-650 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors">
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
                        No active certificate found. You can easily issue a free Let&apos;s Encrypt certificate or configure a self-signed one.
                      </div>
                      <button onClick={() => { setForm({ domain: sslInfo?.domain || "", email: "admin@" + (sslInfo?.domain || "example.com"), selfSigned: false }); setView("issue"); }} className="w-full py-3 bg-indigo-600 text-white font-medium rounded-xl hover:bg-indigo-500 transition-colors shadow-lg shadow-indigo-500/20">
                        Setup HTTPS Now
                      </button>
                      {(sslInfo?.isHttpsEnabled || sslInfo?.isCorrupted) && (
                        <button onClick={handleDisable} className="w-full py-3 border border-red-200 dark:border-red-900 text-red-650 font-medium rounded-xl hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                          Fallback to HTTP Mode
                        </button>
                      )}
                      {sslInfo?.isCorrupted && (
                        <button onClick={handleRepair} className="w-full py-3 bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-white font-medium rounded-xl hover:bg-zinc-200 dark:hover:bg-zinc-700 transition-colors">
                          Repair Config
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )}

              {sslInfo?.diagnostics && (
                <div className="space-y-3 border-t border-zinc-200 dark:border-zinc-800 pt-6">
                  <button
                    onClick={() => setShowDiagnostics(!showDiagnostics)}
                    className="flex items-center justify-between w-full text-xs font-semibold uppercase tracking-wider text-zinc-550 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors"
                  >
                    <span>Advanced SSL Diagnostics</span>
                    <span>{showDiagnostics ? "Hide ▴" : "Show ▾"}</span>
                  </button>

                  {showDiagnostics && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono bg-zinc-50 dark:bg-zinc-950 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
                      <div className="flex justify-between items-center py-1 border-b border-zinc-100 dark:border-zinc-850">
                        <span className="text-zinc-500">DNS Resolution:</span>
                        <span className={sslInfo.diagnostics.dnsResolution === 'PASS' ? 'text-emerald-500 font-bold' : sslInfo.diagnostics.dnsResolution === 'N/A' ? 'text-zinc-500' : 'text-red-500 font-bold'}>
                          {sslInfo.diagnostics.dnsResolution} ({sslInfo.diagnostics.resolvedIp})
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-zinc-100 dark:border-zinc-850">
                        <span className="text-zinc-500">Expected Server IP:</span>
                        <span className="text-zinc-700 dark:text-zinc-300">{sslInfo.diagnostics.expectedServerIp}</span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-zinc-100 dark:border-zinc-850">
                        <span className="text-zinc-500">HTTP Virtual Host:</span>
                        <span className={sslInfo.diagnostics.httpVirtualHost === 'PASS' ? 'text-emerald-500 font-bold' : 'text-red-500 font-bold'}>
                          {sslInfo.diagnostics.httpVirtualHost}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-zinc-100 dark:border-zinc-850">
                        <span className="text-zinc-500">HTTPS Virtual Host:</span>
                        <span className={sslInfo.diagnostics.httpsVirtualHost === 'PASS' ? 'text-emerald-500 font-bold' : 'text-red-500 font-bold'}>
                          {sslInfo.diagnostics.httpsVirtualHost}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-zinc-100 dark:border-zinc-850">
                        <span className="text-zinc-500">server_name:</span>
                        <span className={sslInfo.diagnostics.serverName === 'PASS' ? 'text-emerald-500 font-bold' : 'text-red-500 font-bold'}>
                          {sslInfo.diagnostics.serverName}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-zinc-100 dark:border-zinc-850">
                        <span className="text-zinc-500">TCP Port 80:</span>
                        <span className={sslInfo.diagnostics.tcp80 === 'PASS' ? 'text-emerald-500 font-bold' : 'text-red-500 font-bold'}>
                          {sslInfo.diagnostics.tcp80}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-zinc-100 dark:border-zinc-850">
                        <span className="text-zinc-500">TCP Port 443:</span>
                        <span className={sslInfo.diagnostics.tcp443 === 'PASS' ? 'text-emerald-500 font-bold' : 'text-red-500 font-bold'}>
                          {sslInfo.diagnostics.tcp443}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-zinc-100 dark:border-zinc-850">
                        <span className="text-zinc-500">Certificate Exists:</span>
                        <span className={sslInfo.diagnostics.certificateExists === 'PASS' ? 'text-emerald-500 font-bold' : 'text-red-500 font-bold'}>
                          {sslInfo.diagnostics.certificateExists}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-zinc-100 dark:border-zinc-850">
                        <span className="text-zinc-500">Certificate Valid:</span>
                        <span className={sslInfo.diagnostics.certificateValid === 'PASS' ? 'text-emerald-500 font-bold' : 'text-red-500 font-bold'}>
                          {sslInfo.diagnostics.certificateValid}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-zinc-100 dark:border-zinc-850">
                        <span className="text-zinc-500">Certificate Loaded:</span>
                        <span className={sslInfo.diagnostics.certificateLoaded === 'PASS' ? 'text-emerald-500 font-bold' : 'text-red-500 font-bold'}>
                          {sslInfo.diagnostics.certificateLoaded}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-zinc-100 dark:border-zinc-850">
                        <span className="text-zinc-500">Nginx Config Check:</span>
                        <span className={sslInfo.diagnostics.nginxConfig === 'PASS' ? 'text-emerald-500 font-bold' : 'text-red-500 font-bold'}>
                          {sslInfo.diagnostics.nginxConfig}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-zinc-100 dark:border-zinc-850">
                        <span className="text-zinc-500">Nginx Listening 443:</span>
                        <span className={sslInfo.diagnostics.nginxListening443 === 'PASS' ? 'text-emerald-500 font-bold' : 'text-red-500 font-bold'}>
                          {sslInfo.diagnostics.nginxListening443}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-zinc-100 dark:border-zinc-850">
                        <span className="text-zinc-500">TLS Handshake:</span>
                        <span className={sslInfo.diagnostics.tlsHandshake === 'PASS' ? 'text-emerald-500 font-bold' : 'text-red-500 font-bold'}>
                          {sslInfo.diagnostics.tlsHandshake}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-zinc-100 dark:border-zinc-850">
                        <span className="text-zinc-500">HTTP Health:</span>
                        <span className={sslInfo.diagnostics.httpHealth === 'PASS' ? 'text-emerald-500 font-bold' : 'text-red-500 font-bold'}>
                          {sslInfo.diagnostics.httpHealth}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-zinc-100 dark:border-zinc-850">
                        <span className="text-zinc-500">HTTPS Health:</span>
                        <span className={sslInfo.diagnostics.httpsHealth === 'PASS' ? 'text-emerald-500 font-bold' : 'text-red-500 font-bold'}>
                          {sslInfo.diagnostics.httpsHealth}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-zinc-100 dark:border-zinc-850">
                        <span className="text-zinc-500">Backend API:</span>
                        <span className={sslInfo.diagnostics.backend === 'PASS' ? 'text-emerald-500 font-bold' : 'text-red-500 font-bold'}>
                          {sslInfo.diagnostics.backend}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-zinc-100 dark:border-zinc-850">
                        <span className="text-zinc-500">Frontend SPA:</span>
                        <span className={sslInfo.diagnostics.frontend === 'PASS' ? 'text-emerald-500 font-bold' : 'text-red-500 font-bold'}>
                          {sslInfo.diagnostics.frontend}
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-1 border-b border-zinc-100 dark:border-zinc-850 col-span-1 sm:col-span-2">
                        <span className="text-zinc-500">HTTP to HTTPS Redirect:</span>
                        <span className={sslInfo.diagnostics.redirect === 'PASS' ? 'text-emerald-500 font-bold' : sslInfo.diagnostics.redirect === 'N/A' ? 'text-zinc-500' : 'text-red-500 font-bold'}>
                          {sslInfo.diagnostics.redirect}
                        </span>
                      </div>
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
