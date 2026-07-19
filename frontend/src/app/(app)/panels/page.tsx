"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Plus, Pencil, Trash2, PlugZap, RefreshCw, Power, ScrollText, X, CheckCircle2, XCircle, FileText, Network
} from "lucide-react";
import { api } from "@/lib/api";
import type { PanelRow } from "@/lib/types";
import { formatDateTime } from "@/lib/format";
import { Card, PageHeader, Badge, Spinner, ErrorBox } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useT } from "@/i18n";
import { motion, AnimatePresence } from "framer-motion";
import { MOTION_CONFIG } from "@/lib/motion";

interface PanelForm {
  name: string;
  url: string;
  subUrl: string;
  apiToken: string;
}

export default function PanelsPage() {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);

  const { data, isLoading, error } = useQuery({
    queryKey: ["panels"],
    queryFn: async () => (await api.get<any[]>("/panels")).data,
  });

  const [editing, setEditing] = useState<any | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [logsFor, setLogsFor] = useState<any | null>(null);
  const [inboundsFor, setInboundsFor] = useState<any | null>(null);
  const [syncStatus, setSyncStatus] = useState<Record<string, 'Started' | 'Running' | 'Finished' | undefined>>({});

  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("add") === "1") {
      setWizardOpen(true);
    }
  }, []);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["panels"] });
    qc.invalidateQueries({ queryKey: ["monitoring"] });
  };

  const remove = useMutation({
    mutationFn: async (id: string) => api.delete(`/panels/${id}`),
    onSuccess: () => { toast("Panel deleted"); invalidate(); },
    onError: () => toast("Delete failed", "error"),
  });
  const sync = useMutation({
    mutationFn: async (id: string) => {
      setSyncStatus(prev => ({ ...prev, [id]: 'Started' }));
      setTimeout(() => setSyncStatus(prev => ({ ...prev, [id]: 'Running' })), 600);
      return api.post(`/panels/${id}/sync`);
    },
    onSuccess: (data, id) => { 
      setSyncStatus(prev => ({ ...prev, [id]: 'Finished' }));
      setTimeout(() => {
        setSyncStatus(prev => ({ ...prev, [id]: undefined }));
        invalidate();
      }, 2000);
      const r = data.data;
      if (r.discrepancyMsg && r.discrepancyMsg !== "Perfect Match") {
        toast(`Sync OK: ${r.discrepancyMsg}`);
      } else {
        toast(`Synced ${r.syncedClients} clients perfectly`);
      }
    },
    onError: (err, id) => {
      setSyncStatus(prev => ({ ...prev, [id]: undefined }));
      toast("Sync failed (panel offline?)", "error");
    },
  });
  const restart = useMutation({
    mutationFn: async (id: string) => api.post(`/panels/${id}/restart-xray`),
    onSuccess: () => toast("Xray restart issued"),
    onError: () => toast("Restart failed", "error"),
  });

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message="Failed to load panels" />;
  const panels = data ?? [];

  return (
    <motion.div {...MOTION_CONFIG.page}>
      <PageHeader
        title={t("panels.title")}
        subtitle={t(panels.length === 1 ? "panels.subtitle" : "panels.subtitle_plural", { count: panels.length })}
        action={
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setWizardOpen(true)} 
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 shadow-sm"
          >
            <Plus size={16} /> {t("panels.addPanel")}
          </motion.button>
        }
      />

      <Card className="overflow-x-auto p-0 shadow-lg border-transparent md:border-zinc-200 dark:border-zinc-800/50 bg-transparent md:bg-zinc-50 dark:bg-zinc-950">
        <table className="w-full text-sm block md:table">
          <thead className="hidden md:table-header-group">
            <tr className="border-b border-zinc-200 dark:border-zinc-800 text-start text-xs uppercase tracking-wide text-zinc-500 bg-white dark:bg-zinc-900/50">
              <th className="px-4 py-3 font-medium">Name</th>
              <th className="px-4 py-3 font-medium">URL</th>
              <th className="px-4 py-3 font-medium">Version</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Clients</th>
              <th className="px-4 py-3 font-medium">Inbounds</th>
              <th className="px-4 py-3 font-medium">Last Sync</th>
              <th className="px-4 py-3 text-end font-medium">Actions</th>
            </tr>
          </thead>
          <tbody className="block md:table-row-group space-y-3 md:space-y-0 md:divide-y md:divide-zinc-800/50">
            {panels.map((p, i) => (
              <motion.tr 
                key={p.id} 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: i * 0.03 }}
                whileHover={{ backgroundColor: "rgba(39, 39, 42, 0.4)" }}
                className="block md:table-row group border border-zinc-200 dark:border-zinc-800 md:border-none rounded-xl md:rounded-none bg-zinc-50 dark:bg-zinc-950 md:bg-transparent last:border-0"
              >
                <td className="block md:table-cell px-4 py-3">
                  <div className="flex justify-between items-start md:block">
                    <div>
                      <div className="font-medium text-zinc-800 dark:text-zinc-100">{p.name}</div>
                      <div className="text-xs text-zinc-500">{p.server?.name ?? 'Local Server'}</div>
                    </div>
                    <div className="md:hidden">
                      <Badge tone={p.status === "online" ? "green" : "red"}>{p.status}</Badge>
                    </div>
                  </div>
                </td>
                <td className="hidden md:table-cell px-4 py-3 text-zinc-500 dark:text-zinc-400">{p.url}</td>
                <td className="block md:table-cell px-4 py-2 md:py-3 text-zinc-600 dark:text-zinc-300">
                  <div className="md:hidden text-[10px] uppercase text-zinc-500 font-semibold mb-1 tracking-wider mt-2 border-t border-zinc-200 dark:border-zinc-800/50 pt-2">Version</div>
                  {p.version ?? "—"}
                </td>
                <td className="hidden md:table-cell px-4 py-3"><Badge tone={p.status === "online" ? "green" : "red"}>{p.status}</Badge></td>
                <td className="block md:table-cell px-4 py-2 md:py-3 text-zinc-600 dark:text-zinc-300">
                  <div className="md:hidden text-[10px] uppercase text-zinc-500 font-semibold mb-1 tracking-wider">Clients</div>
                  {p.clientCount ?? 0}
                </td>
                <td className="block md:table-cell px-4 py-2 md:py-3 text-zinc-600 dark:text-zinc-300">
                  <div className="md:hidden text-[10px] uppercase text-zinc-500 font-semibold mb-1 tracking-wider">Inbounds</div>
                  {p.inboundCount ?? 0}
                </td>
                <td className="block md:table-cell px-4 py-2 md:py-3 text-zinc-500 dark:text-zinc-400">
                  <div className="md:hidden text-[10px] uppercase text-zinc-500 font-semibold mb-1 tracking-wider">Last Sync</div>
                  {p.lastSync ? formatDateTime(p.lastSync) : "never"}
                  {p.syncState && (
                    <div className="text-xs mt-1">
                      <span className={p.syncState.status === "success" ? "text-emerald-400" : "text-red-400"}>
                        {p.syncState.status}
                      </span>
                      {p.syncState.latencyMs != null && <span className="text-zinc-500"> · {p.syncState.latencyMs}ms</span>}
                    </div>
                  )}
                </td>
                <td className="block md:table-cell px-4 py-3 border-t border-zinc-200 dark:border-zinc-800/50 md:border-0 mt-2 md:mt-0">
                  <div className="flex flex-wrap items-center justify-start md:justify-end gap-1 md:opacity-0 md:group-hover:opacity-100 transition-opacity w-full">
                    <IconBtn title="Test Connection" onClick={async () => {
                      try {
                        const { data: r } = await api.post("/panels/test-connection", { url: p.url, panelId: p.id });
                        if (r.ok) toast(`OK · v${r.version} · ${r.pingMs}ms`);
                        else toast(r.errorType || "Connection failed", "error");
                      } catch { toast("Connection failed", "error"); }
                    }}><PlugZap size={15} /></IconBtn>
                    
                    <motion.button 
                      whileHover={{ scale: syncStatus[p.id] ? 1 : 1.1 }}
                      whileTap={{ scale: syncStatus[p.id] ? 1 : 0.9 }}
                      title="Run Sync" 
                      onClick={() => !syncStatus[p.id] && sync.mutate(p.id)}
                      disabled={!!syncStatus[p.id]}
                      className={`rounded-md border border-zinc-300 dark:border-zinc-700 px-2 py-1.5 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 flex items-center justify-center min-w-[32px] min-h-[32px] transition-colors ${syncStatus[p.id] ? 'bg-zinc-100 dark:bg-zinc-800/50' : ''}`}
                    >
                      {syncStatus[p.id] === 'Started' ? <span className="text-[10px] uppercase font-bold text-blue-400 tracking-wider">Started</span> : 
                       syncStatus[p.id] === 'Running' ? <span className="text-[10px] uppercase font-bold text-amber-400 tracking-wider flex items-center gap-1"><Spinner /> Run</span> : 
                       syncStatus[p.id] === 'Finished' ? <span className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">Finish</span> : 
                       <RefreshCw size={15} />}
                    </motion.button>
                    <IconBtn title="Restart Xray" onClick={() => restart.mutate(p.id)}><Power size={15} /></IconBtn>
                    <IconBtn title="Inbounds" onClick={() => setInboundsFor(p)}><Network size={15} /></IconBtn>
                    <IconBtn title="View Logs" onClick={() => setLogsFor(p)}><ScrollText size={15} /></IconBtn>
                    <IconBtn title="Edit" onClick={() => setEditing(p)}><Pencil size={15} /></IconBtn>
                    <IconBtn title="Delete" danger onClick={() => {
                      if (confirm(`Delete panel "${p.name}"? This removes its inbounds and clients.`)) remove.mutate(p.id);
                    }}><Trash2 size={15} /></IconBtn>
                  </div>
                </td>
              </motion.tr>
            ))}
            {panels.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-zinc-500">No panels registered.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <AnimatePresence>
        {wizardOpen && <PanelWizard onClose={() => setWizardOpen(false)} onSaved={() => { invalidate(); }} />}
        {editing && <EditPanel panel={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); invalidate(); }} />}
        {logsFor && <LogsModal panel={logsFor} onClose={() => setLogsFor(null)} />}
        {inboundsFor && <InboundsModal panel={inboundsFor} onClose={() => setInboundsFor(null)} />}
      </AnimatePresence>
    </motion.div>
  );
}

function IconBtn({ children, title, onClick, danger }: { children: React.ReactNode; title: string; onClick: () => void; danger?: boolean }) {
  return (
    <motion.button 
      whileHover={{ scale: 1.1 }}
      whileTap={{ scale: 0.9 }}
      title={title} 
      onClick={onClick}
      className={`rounded-md border border-zinc-300 dark:border-zinc-700 p-1.5 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 ${danger ? "hover:border-red-500/40 hover:text-red-400" : "hover:text-zinc-800 dark:hover:text-zinc-100"}`}
    >
      {children}
    </motion.button>
  );
}

function Modal({ title, onClose, children, hideClose }: { title: string; onClose: () => void; children: React.ReactNode; hideClose?: boolean }) {
  return (
    <motion.div {...MOTION_CONFIG.modalOverlay} className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-black/60 pt-[10dvh] px-4 sm:pt-0 sm:p-4 backdrop-blur-sm">
        <motion.div {...MOTION_CONFIG.modalContent} className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-2xl relative overflow-hidden flex flex-col max-h-[85dvh]">
        <div className="mb-4 flex items-center justify-between sticky top-0 bg-white dark:bg-zinc-900 z-10 pb-2 border-b border-zinc-200 dark:border-zinc-800/50">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{title}</h2>
          {!hideClose && <button onClick={onClose} className="text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"><X size={18} /></button>}
        </div>
        <div className="pt-2 overflow-y-auto flex-1">
          {children}
        </div>
      </motion.div>
    </motion.div>
  );
}

function Field({ label, ...props }: { label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div>
      <label className="mb-1 block text-sm text-zinc-500 dark:text-zinc-400">{label}</label>
      <input {...props} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors" />
    </div>
  );
}

function ChecklistItem({ label, status }: { label: string, status: boolean | null }) {
  return (
    <motion.div variants={MOTION_CONFIG.staggerItem} className="flex items-center gap-3">
      {status === true && <CheckCircle2 size={16} className="text-emerald-500" />}
      {status === false && <XCircle size={16} className="text-red-500" />}
      {status === null && <div className="w-4 h-4 rounded-full border-2 border-zinc-300 dark:border-zinc-700 border-t-zinc-500 animate-spin" />}
      <span className={status === false ? 'text-red-400' : 'text-zinc-600 dark:text-zinc-300'}>{label}</span>
    </motion.div>
  );
}

function PanelWizard({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast((s) => s.push);
  const [form, setForm] = useState<PanelForm>({ name: "", url: "https://", subUrl: "", apiToken: "" });
  const [test, setTest] = useState<any | null>(null);
  const [syncReport, setSyncReport] = useState<any | null>(null);

  const testConn = useMutation({
    mutationFn: async () => (await api.post("/panels/test-connection", { url: form.url, apiToken: form.apiToken })).data,
    onSuccess: (d) => { 
      setTest(d); 
      if (!d.ok) toast(d.errorType || "Validation failed", "error"); 
    },
    onError: () => { 
      setTest({ ok: false, errorType: "Network Error", message: "Failed to communicate with panel or backend." }); 
      toast("Connection failed", "error"); 
    },
  });
  
  const create = useMutation({
    mutationFn: async () => (await api.post("/panels", form)).data,
    onSuccess: (data) => { 
      toast("Panel added and sync executed");
      setSyncReport(data.syncReport);
      onSaved(); 
    },
    onError: () => toast("Failed to add panel", "error"),
  });

  const isStrictlyValid = test?.ok === true;

  if (syncReport) {
    return (
      <Modal title="Synchronization Report" onClose={onClose} hideClose>
        <div className="space-y-6 text-center py-6">
          <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/10 flex items-center justify-center mb-4 border border-emerald-500/20">
            {syncReport.success ? <CheckCircle2 size={32} className="text-emerald-500" /> : <XCircle size={32} className="text-red-500" />}
          </div>
          
          <div>
            <h3 className="text-xl font-bold text-zinc-800 dark:text-zinc-100">{syncReport.success ? "Sync Completed" : "Sync Failed"}</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Panel registered successfully. Initial synchronization {syncReport.success ? "finished." : "encountered errors."}</p>
          </div>

          {syncReport.success ? (
            <div className="grid grid-cols-2 gap-4 text-start">
              <div className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
                <div className="text-xs text-zinc-500 mb-1">Synced Inbounds</div>
                <div className="text-lg font-medium text-zinc-700 dark:text-zinc-200">{syncReport.syncedInbounds}</div>
              </div>
              <div className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
                <div className="text-xs text-zinc-500 mb-1">Synced Clients</div>
                <div className="text-lg font-medium text-zinc-700 dark:text-zinc-200">{syncReport.syncedClients}</div>
              </div>
              <div className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
                <div className="text-xs text-zinc-500 mb-1">Panel Version</div>
                <div className="text-lg font-medium text-zinc-700 dark:text-zinc-200">v{syncReport.version}</div>
              </div>
              <div className="bg-zinc-50 dark:bg-zinc-950 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
                <div className="text-xs text-zinc-500 mb-1">Duration</div>
                <div className="text-lg font-medium text-zinc-700 dark:text-zinc-200">{syncReport.syncDurationMs}ms</div>
              </div>
            </div>
          ) : (
            <div className="bg-red-500/10 border border-red-500/20 p-4 rounded-xl text-start text-sm text-red-400">
              {syncReport.error}
            </div>
          )}

          <div className="pt-4">
            <button onClick={onClose} className="w-full rounded-lg bg-zinc-100 dark:bg-zinc-800 px-4 py-2.5 text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-200 dark:hover:bg-zinc-600 transition-colors">
              Close Workflow
            </button>
          </div>
        </div>
      </Modal>
    );
  }

  return (
    <Modal title="Add Panel" onClose={onClose}>
      <div className="space-y-4">
        <Field label="Panel Name" value={form.name} placeholder="e.g. FRA Panel D" onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <div>
          <Field label="Panel URL" value={form.url} placeholder="https://domain.com:2053/custompath/panel/" onChange={(e) => { setForm({ ...form, url: e.target.value }); setTest(null); }} />
          <div className="text-[10px] text-zinc-500 mt-1 ps-1">Examples: https://domain:2053 or https://ip:2053/custompath/panel/</div>
        </div>
        <div>
          <Field label="Subscription Domain / URL *" value={form.subUrl} placeholder="https://sub.domain.com:2096/sub/" onChange={(e) => { setForm({ ...form, subUrl: e.target.value }); }} />
          <div className="text-[10px] text-zinc-500 mt-1 ps-1 leading-tight">
            Required. Example: <b>https://domain.com:2096/sub/</b><br/>
            Include the correct path (like <b>/sub/</b> or your custom path) at the end.
          </div>
        </div>
        <Field label="API Token" value={form.apiToken} placeholder="Required Bearer Token" onChange={(e) => { setForm({ ...form, apiToken: e.target.value }); setTest(null); }} />

        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <motion.button 
              whileHover={{ scale: testConn.isPending || !form.url || !form.apiToken ? 1 : 1.02 }}
              whileTap={{ scale: testConn.isPending || !form.url || !form.apiToken ? 1 : 0.98 }}
              onClick={() => testConn.mutate()} 
              disabled={testConn.isPending || !form.url || !form.apiToken}
              className="flex items-center gap-2 rounded-lg border border-zinc-300 dark:border-zinc-700 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-50 transition-colors"
            >
              <PlugZap size={15} /> {testConn.isPending ? "Validating API…" : "Test Connection"}
            </motion.button>
          </div>

          <AnimatePresence>
            {(test || testConn.isPending) && (
              <motion.div 
                initial={{ opacity: 0, height: 0 }} 
                animate={{ opacity: 1, height: "auto" }} 
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="grid grid-cols-2 gap-4 mt-2">
                  
                  {/* Real Data Diagnostics */}
                  <motion.div 
                    variants={MOTION_CONFIG.staggerContainer}
                    initial="initial"
                    animate="animate"
                    className="col-span-2 text-xs grid grid-cols-2 gap-x-4 gap-y-2 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800/60 rounded-xl p-4 font-mono text-zinc-500 dark:text-zinc-400"
                  >
                    {testConn.isPending ? (
                      <div className="col-span-2 flex items-center gap-2 justify-center py-2 text-blue-400"><Spinner /> Contacting remote API...</div>
                    ) : test?.ok ? (
                      <>
                        <div className="flex justify-between items-center"><span className="text-zinc-600">Host:</span> <span className="text-emerald-400">{test.parsedHost}</span></div>
                        <div className="flex justify-between items-center"><span className="text-zinc-600">Port:</span> <span className="text-emerald-400">{test.parsedPort}</span></div>
                        <div className="flex justify-between items-center"><span className="text-zinc-600">Base Path:</span> <span className="text-blue-400">{test.webBasePath || '/'}</span></div>
                        <div className="flex justify-between items-center"><span className="text-zinc-600">API URL:</span> <span className="text-amber-400 truncate max-w-[120px]" title={test.debugLog?.endpoint}>{test.debugLog?.endpoint || '—'}</span></div>
                        <div className="col-span-2 border-t border-zinc-200 dark:border-zinc-800/60 my-1 pt-2 grid grid-cols-2 gap-x-4 gap-y-2">
                           <div className="flex justify-between items-center"><span className="text-zinc-600">Panel Version:</span> <span className="text-zinc-800 dark:text-zinc-100 font-bold">v{test.version}</span></div>
                           <div className="flex justify-between items-center"><span className="text-zinc-600">Xray Core:</span> <span className="text-zinc-800 dark:text-zinc-100 font-bold">v{test.xrayVersion}</span></div>
                        </div>
                      </>
                    ) : test ? (
                      <div className="col-span-2 text-center text-red-400 py-2">Connection Diagnostics Failed</div>
                    ) : (
                      <div className="col-span-2 text-center text-zinc-600 py-2">Awaiting connection test...</div>
                    )}
                  </motion.div>

                  {/* Results / Errors */}
                  <div className="col-span-2 flex flex-col gap-3">
                    {test && !isStrictlyValid && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-xs">
                        <div className="font-bold text-red-500 mb-1 flex items-center gap-2"><AlertTriangle size={15} /> {test.errorType || "Validation Failed"}</div>
                        <div className="text-red-400/80 leading-relaxed">{test.message || "Ensure the backend service is up-to-date and returning the correct validation checklist."}</div>
                      </motion.div>
                    )}
                    
                    {test && isStrictlyValid && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-emerald-500/5 border border-emerald-500/10 rounded-xl p-3 text-xs flex justify-between items-center">
                        <div>
                          <div className="font-bold text-emerald-500 flex items-center gap-1.5 mb-1"><CheckCircle2 size={14} /> Ready ({test.pingMs}ms)</div>
                          <div className="text-emerald-400/70 text-[10px]">Panel {test.version} · Xray {test.xrayVersion}</div>
                        </div>
                        <div className="text-end">
                          <div className="text-emerald-300 font-medium">{test.inboundCount} Inbounds</div>
                          <div className="text-emerald-300 font-medium">{test.clientCount} Clients</div>
                        </div>
                      </motion.div>
                    )}

                    {/* Expandable Debug Trace */}
                    {test && (
                      <details className="group border border-zinc-200 dark:border-zinc-800/60 bg-zinc-50 dark:bg-zinc-950 rounded-xl overflow-hidden text-[10px]">
                        <summary className="cursor-pointer px-3 py-2 text-zinc-500 dark:text-zinc-400 font-medium hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors flex items-center justify-between outline-none">
                          <span className="flex items-center gap-2"><PlugZap size={12} className="text-zinc-500" /> URL Parser Engine & Telemetry</span>
                          <span className="text-zinc-600 group-open:rotate-180 transition-transform">▼</span>
                        </summary>
                        <div className="p-3 border-t border-zinc-200 dark:border-zinc-800/60 font-mono space-y-2 bg-black/40">
                          <div className="grid grid-cols-2 gap-2 text-zinc-600 dark:text-zinc-300">
                            <div><span className="text-zinc-600 block mb-0.5">Host / Port</span>{test.parsedHost} <span className="text-emerald-400">:{test.parsedPort}</span></div>
                            <div><span className="text-zinc-600 block mb-0.5">Base Path</span><span className="text-blue-400">{test.webBasePath || '/'}</span></div>
                          </div>
                          
                          {test.debugLog && (
                            <div className="mt-2 pt-2 border-t border-zinc-200 dark:border-zinc-800/50">
                              <div className="flex gap-2"><span className="text-zinc-600 min-w-[50px]">URL:</span> <span className="text-amber-400 break-all">{test.debugLog.method} {test.debugLog.endpoint}</span></div>
                              <div className="flex gap-2"><span className="text-zinc-600 min-w-[50px]">Code:</span> <span className={test.debugLog.responseStatus >= 200 && test.debugLog.responseStatus < 300 ? "text-emerald-500 font-bold" : "text-red-500 font-bold"}>{test.debugLog.responseStatus || "TCP Error"}</span></div>
                            </div>
                          )}
                          {test.capabilities && (
                            <div className="mt-2 pt-2 border-t border-zinc-200 dark:border-zinc-800/50">
                              <div className="text-zinc-500 mb-1 font-semibold uppercase text-[9px] tracking-wider">Detected Capabilities</div>
                              <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                                <div className="flex gap-1 items-center"><span className={test.capabilities.clientsApi ? "text-emerald-400" : "text-zinc-600"}>{test.capabilities.clientsApi ? "✓" : "✗"}</span> <span className="text-zinc-400">Clients API</span></div>
                                <div className="flex gap-1 items-center"><span className={test.capabilities.pagination ? "text-emerald-400" : "text-zinc-600"}>{test.capabilities.pagination ? "✓" : "✗"}</span> <span className="text-zinc-400">Pagination</span></div>
                                <div className="flex gap-1 items-center"><span className={test.capabilities.slimInbounds ? "text-emerald-400" : "text-zinc-600"}>{test.capabilities.slimInbounds ? "✓" : "✗"}</span> <span className="text-zinc-400">Slim Inbounds</span></div>
                                <div className="flex gap-1 items-center"><span className={test.capabilities.observatory ? "text-emerald-400" : "text-zinc-600"}>{test.capabilities.observatory ? "✓" : "✗"}</span> <span className="text-zinc-400">Observatory</span></div>
                              </div>
                            </div>
                          )}
                        </div>
                      </details>
                    )}
                  </div>

                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-200 dark:border-zinc-800 pt-4 mt-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 transition-colors">Cancel</button>
          <motion.button 
            whileHover={{ scale: create.isPending || !form.name || !form.url || !form.subUrl || !form.apiToken || !isStrictlyValid ? 1 : 1.05 }}
            whileTap={{ scale: create.isPending || !form.name || !form.url || !form.subUrl || !form.apiToken || !isStrictlyValid ? 1 : 0.95 }}
            onClick={() => create.mutate()} 
            disabled={create.isPending || !form.name || !form.url || !form.subUrl || !form.apiToken || !isStrictlyValid}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors shadow-lg shadow-blue-900/20"
          >
            {create.isPending ? <Spinner /> : <FileText size={16} />}
            {create.isPending ? "Syncing…" : "Save & Synchronize"}
          </motion.button>
        </div>
      </div>
    </Modal>
  );
}

function AlertTriangle({ size, className }: { size: number, className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>
    </svg>
  );
}

function EditPanel({ panel, onClose, onSaved }: { panel: any; onClose: () => void; onSaved: () => void }) {
  const toast = useToast((s) => s.push);
  const [form, setForm] = useState({ name: panel.name, url: panel.url, subUrl: panel.subUrl || "", status: panel.status, apiToken: "" });
  const update = useMutation({
    mutationFn: async () => {
      const payload: any = { name: form.name, url: form.url, subUrl: form.subUrl, status: form.status };
      if (form.apiToken) payload.apiToken = form.apiToken;
      return (await api.patch(`/panels/${panel.id}`, payload)).data;
    },
    onSuccess: () => { toast("Panel updated"); onSaved(); },
    onError: () => toast("Update failed", "error"),
  });
  return (
    <Modal title={`Edit ${panel.name}`} onClose={onClose}>
      <div className="space-y-4">
        <Field label="Panel Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <Field label="Panel URL" value={form.url} onChange={(e) => setForm({ ...form, url: e.target.value })} />
        <div>
          <Field label="Subscription Domain / URL *" value={form.subUrl} placeholder="e.g. https://sub.domain.com:2096/sub/" onChange={(e) => setForm({ ...form, subUrl: e.target.value })} />
          <div className="text-[10px] text-zinc-500 mt-1 ps-1 leading-tight">
            Required. Example: <b>https://domain.com:2096/sub/</b><br/>
            Include the correct path (like <b>/sub/</b> or your custom path) at the end.
          </div>
        </div>
        <Field label="API Token" type="password" value={form.apiToken} placeholder="Leave blank to keep current token" onChange={(e) => setForm({ ...form, apiToken: e.target.value })} />
        <div>
          <label className="mb-1 block text-sm text-zinc-500 dark:text-zinc-400">Status</label>
          <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}
            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors">
            <option value="online">online</option>
            <option value="offline">offline</option>
          </select>
        </div>
        <div className="flex justify-end gap-2 border-t border-zinc-200 dark:border-zinc-800 pt-4 mt-4">
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200">Cancel</button>
          <motion.button 
            whileHover={{ scale: update.isPending || !form.subUrl ? 1 : 1.05 }}
            whileTap={{ scale: update.isPending || !form.subUrl ? 1 : 0.95 }}
            onClick={() => update.mutate()} 
            disabled={update.isPending || !form.subUrl}
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            {update.isPending ? "Saving…" : "Save changes"}
          </motion.button>
        </div>
      </div>
    </Modal>
  );
}

function LogsModal({ panel, onClose }: { panel: any; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ["logs", panel.id],
    queryFn: async () => (await api.get<{ lines: string[] }>(`/panels/${panel.id}/logs`)).data,
  });
  return (
    <Modal title={`Logs — ${panel.name}`} onClose={onClose}>
      {isLoading ? (
        <Spinner />
      ) : (
        <pre className="max-h-80 overflow-auto rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3 font-mono text-xs leading-relaxed text-zinc-600 dark:text-zinc-300">
          {(data?.lines ?? []).join("\n")}
        </pre>
      )}
    </Modal>
  );
}
function InboundsModal({ panel, onClose }: { panel: any; onClose: () => void }) {
  const toast = useToast((s) => s.push);
  const qc = useQueryClient();

  // We reuse the global inbounds endpoint to fetch all inbounds, then filter by panel
  const { data: allInbounds, isLoading } = useQuery({
    queryKey: ["inbounds"],
    queryFn: async () => (await api.get<any[]>("/inbounds")).data,
  });

  const inbounds = allInbounds?.filter((i) => i.panel?.id === panel.id) || [];
  const [editingId, setEditingId] = useState<string | null>(null);
  const [remark, setRemark] = useState("");

  const update = useMutation({
    mutationFn: async ({ id, remark }: { id: string; remark: string }) => {
      return api.patch(`/inbounds/${id}`, { remark });
    },
    onSuccess: () => {
      toast("Inbound updated");
      setEditingId(null);
      qc.invalidateQueries({ queryKey: ["inbounds"] });
    },
    onError: () => toast("Update failed", "error"),
  });

  return (
    <Modal title={`Inbounds — ${panel.name}`} onClose={onClose}>
      {isLoading ? (
        <Spinner />
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Custom names (remarks) help identify inbounds when adding new clients.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-start">
              <thead className="bg-white dark:bg-zinc-900 text-zinc-500 text-xs uppercase">
                <tr>
                  <th className="px-3 py-2 font-medium rounded-ss-lg">Tag</th>
                  <th className="px-3 py-2 font-medium">Protocol</th>
                  <th className="px-3 py-2 font-medium">Port</th>
                  <th className="px-3 py-2 font-medium">Remark</th>
                  <th className="px-3 py-2 font-medium rounded-se-lg"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800">
                {inbounds.map((ib) => (
                  <tr key={ib.id} className="hover:bg-zinc-100 dark:hover:bg-zinc-800/50">
                    <td className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-200">{ib.tag}</td>
                    <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400">{ib.protocol}</td>
                    <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400">{ib.port}</td>
                    <td className="px-3 py-2 text-zinc-600 dark:text-zinc-300">
                      {editingId === ib.id ? (
                        <input
                          autoFocus
                          value={remark}
                          onChange={(e) => setRemark(e.target.value)}
                          className="w-full rounded bg-zinc-50 dark:bg-zinc-950 px-2 py-1 text-sm text-zinc-800 dark:text-zinc-100 border border-blue-500 outline-none"
                          placeholder="e.g. VIP Server 1"
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') update.mutate({ id: ib.id, remark });
                            if (e.key === 'Escape') setEditingId(null);
                          }}
                        />
                      ) : (
                        ib.remark || <span className="text-zinc-600 italic">None</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-end">
                      {editingId === ib.id ? (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => setEditingId(null)} className="text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"><X size={14} /></button>
                          <button onClick={() => update.mutate({ id: ib.id, remark })} disabled={update.isPending} className="text-emerald-500 hover:text-emerald-400">
                            {update.isPending ? <Spinner size={14} /> : <CheckCircle2 size={14} />}
                          </button>
                        </div>
                      ) : (
                        <button onClick={() => { setEditingId(ib.id); setRemark(ib.remark || ""); }} className="text-blue-400 hover:text-blue-300">
                          <Pencil size={14} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {inbounds.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-3 py-6 text-center text-zinc-500">No inbounds found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Modal>
  );
}
