"use client";

import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Shield, RefreshCw, X, CheckCircle, AlertCircle, Loader2, Globe, Lock, Unlock, Server } from "lucide-react";
import { api } from "@/lib/api";
import { useAuth } from "@/store/auth";
import { motion, AnimatePresence } from "framer-motion";
import { useT } from "@/i18n";

interface SslStatus {
  mode: string;
  domain: string;
  isHttpsEnabled: boolean;
  provider?: string;
  certificate: {
    exists: boolean;
    expiration?: string;
    daysRemaining?: number;
    issuer?: string;
  };
  warning?: string;
  isCorrupted?: boolean;
}

export function SslManagerModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const t = useT();
  const token = useAuth((s) => s.token);
  const isSuccessRef = React.useRef(false);
  const isExecutingRef = React.useRef(false);

  const { data: sslInfo, isLoading, refetch } = useQuery({
    queryKey: ["sslStatus"],
    queryFn: async () => (await api.get<SslStatus>("/settings/ssl")).data,
    enabled: isOpen,
  });

  const [view, setView] = useState<"status" | "issue" | "change" | "progress">("status");
  const [wizardStep, setWizardStep] = useState<1 | 2>(1);
  const [form, setForm] = useState({ domain: "", email: "", selfSigned: false });
  const [logs, setLogs] = useState<string[]>([]);
  const [workflowState, setWorkflowState] = useState<"idle" | "running" | "success" | "error">("idle");
  const [workflowError, setWorkflowError] = useState("");

  useEffect(() => {
    if (isOpen) {
      setView("status");
      setWizardStep(1);
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
          setWorkflowError(data.error?.message || data.error?.reason || t("settings.sslUnknownError"));
          eventSource.close();
        }
      } catch (e) {
        // parse error
      }
    };
    eventSource.onopen = () => {
      setLogs([t("settings.sslStartingWorkflow")]);
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
    setLogs([t("settings.sslStartingWorkflow")]);
    isSuccessRef.current = false;
    const es = startStream();
    try {
      await actionFn();
      refetch();
    } catch (err: unknown) {
      if (isSuccessRef.current) return;
      
      let message = t("settings.sslFailedToExecute");
      if (err instanceof Error) {
        if (err.message === "Network Error") {
          // Nginx restart drops connection
          if (form.domain && (actionFn.toString().includes("change-domain") || actionFn.toString().includes("issue"))) {
            setLogs(prev => [...prev, t("settings.sslConnectionLostRedirect"), t("settings.sslRedirectingIn", { domain: form.domain })]);
            setTimeout(() => {
              window.location.href = `https://${form.domain}${window.location.pathname}`;
            }, 10000);
          }
          return;
        }
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

  const handleIssue = () => executeAction(() => api.post("/settings/ssl/issue", form));
  const handleChangeDomain = () => executeAction(() => api.post("/settings/ssl/change-domain", form));
  const handleRenew = () => executeAction(() => api.post("/settings/ssl/renew"));
  const handleEnable = () => executeAction(() => api.post("/settings/ssl/switch", { enableHttps: true }));
  const handleDisable = () => executeAction(() => api.post("/settings/ssl/switch", { enableHttps: false }));
  const handleRepair = () => executeAction(() => api.post("/settings/ssl/repair"));

  if (!isOpen) return null;

  const isIp = sslInfo?.domain && (/^[0-9\.]+$/.test(sslInfo.domain) || sslInfo.domain === "localhost");
  const isManual = sslInfo?.certificate?.exists && !sslInfo?.isHttpsEnabled && (sslInfo?.provider === "none" || !sslInfo?.provider);

  const containerVariants: any = {
    hidden: { opacity: 0, scale: 0.95, y: 20 },
    visible: { opacity: 1, scale: 1, y: 0, transition: { type: "spring", damping: 25, stiffness: 300 } },
    exit: { opacity: 0, scale: 0.95, y: -20 }
  };

  const slideVariants: any = {
    enter: { x: 20, opacity: 0 },
    center: { x: 0, opacity: 1 },
    exit: { x: -20, opacity: 0 }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-md" onClick={() => workflowState !== 'running' && onClose()} />
      <AnimatePresence mode="wait">
        <motion.div
          key="modal"
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="relative w-full max-w-2xl bg-white dark:bg-zinc-900 rounded-3xl shadow-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden flex flex-col max-h-[90vh]"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 bg-zinc-50/50 dark:bg-zinc-900/50 border-b border-zinc-200 dark:border-zinc-800">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-2xl ${sslInfo?.isHttpsEnabled ? 'bg-emerald-500/10 text-emerald-500' : 'bg-indigo-500/10 text-indigo-500'}`}>
                {sslInfo?.isHttpsEnabled ? <Lock size={24} /> : <Shield size={24} />}
              </div>
              <div>
                <h2 className="text-xl font-bold text-zinc-900 dark:text-white">{t("settings.sslModalTitle")}</h2>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">{t("settings.sslModalSubtitle")}</p>
              </div>
            </div>
            {workflowState !== 'running' && (
              <button onClick={onClose} className="p-2 text-zinc-400 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
                <X size={20} />
              </button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto p-6">
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 text-zinc-400">
                <Loader2 className="w-10 h-10 animate-spin mb-4" />
                <p>{t("settings.sslLoadingState")}</p>
              </div>
            ) : view === "progress" ? (
              <motion.div variants={slideVariants} initial="enter" animate="center" exit="exit" className="space-y-6">
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="relative mb-6">
                    {workflowState === "running" && (
                      <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-20 rounded-full animate-pulse" />
                    )}
                    {workflowState === "running" && <Loader2 className="w-16 h-16 animate-spin text-indigo-500 relative z-10" />}
                    {workflowState === "success" && <CheckCircle className="w-16 h-16 text-emerald-500 relative z-10" />}
                    {workflowState === "error" && <AlertCircle className="w-16 h-16 text-red-500 relative z-10" />}
                  </div>
                  <h3 className="text-2xl font-bold mb-2 text-zinc-900 dark:text-white">
                    {workflowState === "running" ? t("settings.sslApplying") : workflowState === "success" ? t("settings.sslOperationSuccess") : t("settings.sslConfigFailed")}
                  </h3>
                  <p className="text-zinc-500 max-w-sm">
                    {workflowState === "running" ? t("settings.sslApplyingHint") : workflowState === "success" ? t("settings.sslSuccessHint") : t("settings.sslErrorHint")}
                  </p>
                </div>
                
                <div className="bg-zinc-950 rounded-2xl p-5 font-mono text-xs sm:text-sm h-48 overflow-y-auto space-y-2 border border-zinc-800 shadow-inner">
                  {logs.map((log, i) => (
                    <div key={i} className="text-zinc-300 flex gap-3">
                      <span className="text-zinc-600 shrink-0">{(new Date()).toLocaleTimeString()}</span>
                      <span className={log.toLowerCase().includes('error') ? 'text-red-400' : log.toLowerCase().includes('success') ? 'text-emerald-400' : ''}>{log}</span>
                    </div>
                  ))}
                  {workflowState === "running" && (
                    <div className="flex gap-2 items-center text-zinc-500">
                      <span className="w-2 h-2 rounded-full bg-zinc-600 animate-bounce" />
                      <span className="w-2 h-2 rounded-full bg-zinc-600 animate-bounce" style={{ animationDelay: "0.2s" }} />
                      <span className="w-2 h-2 rounded-full bg-zinc-600 animate-bounce" style={{ animationDelay: "0.4s" }} />
                    </div>
                  )}
                </div>

                {workflowState === "error" && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-650 dark:text-red-400 text-sm flex gap-3">
                    <AlertCircle className="w-5 h-5 shrink-0" />
                    <div>{workflowError}</div>
                  </div>
                )}

                {workflowState !== "running" && (
                  <button
                    onClick={() => { setView("status"); refetch(); }}
                    className="w-full py-3.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white font-medium rounded-xl transition-colors"
                  >
                    {t("settings.sslReturnToOverview")}
                  </button>
                )}
              </motion.div>
            ) : view === "issue" || view === "change" ? (
              <motion.div variants={slideVariants} initial="enter" animate="center" exit="exit" className="space-y-6">
                <div className="flex items-center gap-2 mb-8">
                  <div className={`flex-1 h-1.5 rounded-full ${wizardStep >= 1 ? 'bg-indigo-600' : 'bg-zinc-200 dark:bg-zinc-800'}`} />
                  <div className={`flex-1 h-1.5 rounded-full ${wizardStep >= 2 ? 'bg-indigo-600' : 'bg-zinc-200 dark:bg-zinc-800'}`} />
                </div>

                {wizardStep === 1 ? (
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                    <div>
                      <h3 className="text-xl font-bold mb-2">{t("settings.sslConfigureDomainTitle")}</h3>
                      <p className="text-zinc-500 text-sm">{t("settings.sslConfigureDomainHint")}</p>
                    </div>
                    
                    <div className="space-y-3">
                      <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t("settings.sslPublicDomain")}</label>
                      <div className="relative">
                        <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-zinc-400" />
                        <input
                          type="text"
                          value={form.domain}
                          onChange={e => setForm({...form, domain: e.target.value.toLowerCase()})}
                          placeholder={t("settings.sslDomainPlaceholder")}
                          className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl pl-10 pr-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                        />
                      </div>
                    </div>

                    <div className="pt-4 flex gap-3">
                      <button onClick={() => setView("status")} className="px-6 py-3 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl font-medium transition-colors">{t("common.cancel")}</button>
                      <button 
                        onClick={() => setWizardStep(2)} 
                        disabled={!form.domain || form.domain.length < 4 || !form.domain.includes('.')} 
                        className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 text-white rounded-xl font-medium transition-colors shadow-lg shadow-indigo-500/20"
                      >
                        {t("settings.sslContinue")}
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                    <div>
                      <h3 className="text-xl font-bold mb-2">{t("settings.sslCertDetailsTitle")}</h3>
                      <p className="text-zinc-500 text-sm">{t("settings.sslCertDetailsHint", { domain: form.domain })}</p>
                    </div>

                    <div className="grid grid-cols-1 gap-4">
                      <label className={`relative flex cursor-pointer rounded-xl border p-4 transition-all ${!form.selfSigned ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10' : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50'}`}>
                        <input type="radio" name="certType" className="sr-only" checked={!form.selfSigned} onChange={() => setForm({...form, selfSigned: false})} />
                        <div className="flex w-full items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${!form.selfSigned ? 'bg-indigo-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}>
                              <Shield className="h-5 w-5" />
                            </div>
                            <div className="flex flex-col">
                              <span className={`font-semibold ${!form.selfSigned ? 'text-indigo-900 dark:text-indigo-100' : 'text-zinc-900 dark:text-white'}`}>{t("settings.sslLetsEncrypt")}</span>
                              <span className="text-sm text-zinc-500">{t("settings.sslLetsEncryptHint")}</span>
                            </div>
                          </div>
                          {!form.selfSigned && <CheckCircle className="h-5 w-5 text-indigo-500" />}
                        </div>
                      </label>

                      <label className={`relative flex cursor-pointer rounded-xl border p-4 transition-all ${form.selfSigned ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10' : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50'}`}>
                        <input type="radio" name="certType" className="sr-only" checked={form.selfSigned} onChange={() => setForm({...form, selfSigned: true})} />
                        <div className="flex w-full items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${form.selfSigned ? 'bg-indigo-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500'}`}>
                              <Lock className="h-5 w-5" />
                            </div>
                            <div className="flex flex-col">
                              <span className={`font-semibold ${form.selfSigned ? 'text-indigo-900 dark:text-indigo-100' : 'text-zinc-900 dark:text-white'}`}>{t("settings.sslSelfSigned")}</span>
                              <span className="text-sm text-zinc-500">{t("settings.sslSelfSignedHint")}</span>
                            </div>
                          </div>
                          {form.selfSigned && <CheckCircle className="h-5 w-5 text-indigo-500" />}
                        </div>
                      </label>
                    </div>

                    {!form.selfSigned && (
                      <div className="space-y-3 pt-2">
                        <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">{t("settings.sslAdminEmail")}</label>
                        <input
                          type="email"
                          value={form.email}
                          onChange={e => setForm({...form, email: e.target.value})}
                          placeholder={t("settings.sslEmailPlaceholder")}
                          className="w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all"
                        />
                        <p className="text-xs text-zinc-500">{t("settings.sslAdminEmailHint")}</p>
                      </div>
                    )}

                    <div className="pt-4 flex gap-3">
                      <button onClick={() => setWizardStep(1)} className="px-6 py-3 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl font-medium transition-colors">{t("common.back")}</button>
                      <button 
                        onClick={view === "issue" ? handleIssue : handleChangeDomain} 
                        disabled={!form.selfSigned && !form.email}
                        className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl font-medium transition-colors shadow-lg shadow-indigo-500/20"
                      >
                        {t("settings.sslIssueCertificate")}
                      </button>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            ) : (
              <motion.div variants={slideVariants} initial="enter" animate="center" exit="exit" className="space-y-6">
                
                {/* STATE 1: No Domain (IP Mode) */}
                {isIp && (
                  <div className="flex flex-col items-center justify-center py-8 px-4 text-center">
                    <div className="w-20 h-20 bg-zinc-100 dark:bg-zinc-800 rounded-full flex items-center justify-center mb-6">
                      <Server className="w-10 h-10 text-zinc-400" />
                    </div>
                    <h3 className="text-2xl font-bold mb-2">{t("settings.sslHttpModeTitle")}</h3>
                    <p className="text-zinc-500 max-w-sm mx-auto mb-8">
                      {t("settings.sslHttpModeHint")}
                    </p>
                    <button 
                      onClick={() => { setForm({ domain: "", email: "", selfSigned: false }); setView("issue"); }}
                      className="px-8 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-all shadow-lg shadow-indigo-500/20 hover:scale-[1.02] active:scale-95 flex items-center gap-2"
                    >
                      <Globe className="w-5 h-5" />
                      {t("settings.sslConfigureDomainBtn")}
                    </button>
                  </div>
                )}

                {/* STATE 2: Domain Configured */}
                {!isIp && sslInfo?.domain && (
                  <div className="space-y-6">
                    <div className="bg-gradient-to-br from-zinc-50 to-white dark:from-zinc-900/50 dark:to-zinc-900 border border-zinc-200 dark:border-zinc-800/80 rounded-2xl p-6 shadow-sm">
                      <div className="flex items-center justify-between mb-6">
                        <div>
                          <p className="text-sm font-medium text-zinc-500 dark:text-zinc-400 mb-1">{t("settings.sslCurrentAccessDomain")}</p>
                          <h3 className="text-2xl font-bold text-zinc-900 dark:text-white flex items-center gap-3">
                            {sslInfo.domain}
                            {sslInfo.isHttpsEnabled && (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg">
                                <Lock className="w-3 h-3" /> {t("settings.sslSecure")}
                              </span>
                            )}
                            {!sslInfo.isHttpsEnabled && (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 bg-amber-500/10 text-amber-600 dark:text-amber-400 rounded-lg">
                                <Unlock className="w-3 h-3" /> {t("settings.sslInsecure")}
                              </span>
                            )}
                          </h3>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white dark:bg-zinc-950 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800">
                          <p className="text-xs text-zinc-500 mb-1">{t("settings.sslCertStatus")}</p>
                          <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                            {sslInfo.certificate.exists ? t("settings.sslCertValid") : t("settings.sslCertMissing")}
                          </p>
                        </div>
                        <div className="bg-white dark:bg-zinc-950 p-4 rounded-xl border border-zinc-100 dark:border-zinc-800">
                          <p className="text-xs text-zinc-500 mb-1">{t("settings.sslExpiration")}</p>
                          <p className={`font-semibold ${sslInfo.certificate.daysRemaining && sslInfo.certificate.daysRemaining < 15 ? 'text-amber-500' : 'text-zinc-900 dark:text-zinc-100'}`}>
                            {sslInfo.certificate.daysRemaining ? t("settings.sslDaysRemaining", { count: sslInfo.certificate.daysRemaining }) : t("settings.sslNotApplicable")}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* STATE 3: Manual Certificate Detection */}
                    {isManual && (
                      <div className="p-5 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="flex gap-4 items-start">
                          <div className="p-2 bg-indigo-100 dark:bg-indigo-500/20 rounded-lg text-indigo-600 dark:text-indigo-400 shrink-0 mt-1 sm:mt-0">
                            <Shield className="w-6 h-6" />
                          </div>
                          <div>
                            <h4 className="font-bold text-indigo-900 dark:text-indigo-100 text-lg">{t("settings.sslManualDetectedTitle")}</h4>
                            <p className="text-indigo-700 dark:text-indigo-300 text-sm mt-1">
                              {t("settings.sslManualDetectedHint")}
                            </p>
                          </div>
                        </div>
                        <button 
                          onClick={handleEnable}
                          className="w-full sm:w-auto shrink-0 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-all shadow-lg shadow-indigo-500/20"
                        >
                          {t("settings.sslEnableHttps")}
                        </button>
                      </div>
                    )}

                    {!isManual && (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                        <button 
                          onClick={() => { setForm({ domain: sslInfo.domain, email: "admin@" + sslInfo.domain, selfSigned: false }); setView("change"); }}
                          className="flex items-center justify-center gap-2 py-3.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-900 dark:text-white rounded-xl font-medium transition-colors"
                        >
                          {t("settings.sslChangeDomain")}
                        </button>
                        
                        <button 
                          onClick={handleRenew}
                          disabled={!sslInfo.certificate.exists || sslInfo.provider === "none" || sslInfo.provider === "Self Signed"}
                          className="flex items-center justify-center gap-2 py-3.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 disabled:opacity-50 text-zinc-900 dark:text-white rounded-xl font-medium transition-colors"
                        >
                          <RefreshCw className="w-4 h-4" />
                          {t("settings.sslRenewCertificate")}
                        </button>

                        <button 
                          onClick={handleRepair}
                          className="flex items-center justify-center gap-2 py-3.5 border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 rounded-xl font-medium transition-colors"
                        >
                          {t("settings.sslRepairConfig")}
                        </button>

                        <button 
                          onClick={handleDisable}
                          disabled={!sslInfo.isHttpsEnabled}
                          className="flex items-center justify-center gap-2 py-3.5 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50 rounded-xl font-medium transition-colors"
                        >
                          {t("settings.sslDisableHttps")}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </motion.div>
            )}
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
