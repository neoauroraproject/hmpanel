"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Settings, Activity, ArchiveX, ChevronRight, Info, ExternalLink, Database, Download, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { ErrorBox, PageHeader, Spinner, Card } from "@/components/ui";
import { useToast } from "@/components/toast";
import { motion } from "framer-motion";

export default function GlobalSettingsPage() {
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);
  const router = useRouter();

  const { data: settings, isLoading, error } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await api.get<any>("/settings")).data,
  });

  const updateSettings = useMutation({
    mutationFn: async (payload: any) => (await api.post("/settings", payload)).data,
    onSuccess: () => {
      toast("Settings saved successfully");
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: () => toast("Failed to save settings", "error"),
  });

  const [form, setForm] = useState({
    cleanup_threshold_days: 30,
  });

  useEffect(() => {
    if (settings) {
      setForm({
        cleanup_threshold_days: Number(settings.cleanup_threshold_days) || 30,
      });
    }
  }, [settings]);

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message="Failed to load settings" />;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <PageHeader
        title="Global Settings"
        subtitle="Manage platform-wide configurations"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                <Settings size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">Cleanup Candidate Threshold</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Determine when expired clients become eligible for cleanup.</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  Days After Expiration
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    value={form.cleanup_threshold_days}
                    onChange={(e) => setForm({ ...form, cleanup_threshold_days: Number(e.target.value) })}
                    className="w-full max-w-[120px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors"
                  />
                  <span className="text-sm text-zinc-500">Days</span>
                </div>
                <p className="text-xs text-zinc-500 mt-2">Clients expired for more than {form.cleanup_threshold_days} days will appear in the Cleanup Candidates list.</p>
              </div>

              <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end">
                <button
                  onClick={() => updateSettings.mutate(form)}
                  disabled={updateSettings.isPending}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
                >
                  {updateSettings.isPending ? <Spinner className="w-4 h-4" /> : <Save size={16} />}
                  Save Settings
                </button>
              </div>
            </div>
          </Card>

          <BackupRestoreCard />
        </div>

        {/* Quick Links and About */}
        <div className="space-y-4">
          <Card className="p-6 border-blue-500/20 bg-blue-500/5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                <Info size={20} />
              </div>
              <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">About HMPanel</h3>
            </div>
            <div className="space-y-3 text-sm">
                <div className="flex justify-between border-b border-zinc-200 dark:border-zinc-800/60 pb-2">
                  <span className="text-zinc-500">Panel Version</span>
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">v{process.env.NEXT_PUBLIC_APP_VERSION || "1.0.17"}</span>
                </div>
                <div className="flex justify-between border-b border-zinc-200 dark:border-zinc-800/60 pb-2">
                  <span className="text-zinc-500">Edition</span>
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">Professional Edition</span>
                </div>
                <div className="flex justify-between border-b border-zinc-200 dark:border-zinc-800/60 pb-2">
                  <span className="text-zinc-500">Build</span>
                  <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">v{process.env.NEXT_PUBLIC_APP_VERSION || "1.0.17"}</span>
                </div>
              <div className="pt-2 space-y-2">
                <a href="https://github.com/neoauroraproject/hmpanel" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400 hover:text-blue-500 transition-colors">
                  <ExternalLink size={14} /> Official GitHub
                </a>
                <a href="https://t.me/hmpanel" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400 hover:text-blue-500 transition-colors">
                  <ExternalLink size={14} /> Telegram Channel
                </a>
              </div>
            </div>
          </Card>
          <Card className="p-0 overflow-hidden hover:border-blue-500 transition-colors cursor-pointer">
            <div className="p-6 flex items-center justify-between" onClick={() => router.push('/diagnostics')}>
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-indigo-500/10 text-indigo-500">
                  <Activity size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">System Diagnostics</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">View platform logs, health checks, and system processes.</p>
                </div>
              </div>
              <ChevronRight className="text-zinc-400" />
            </div>
          </Card>

          <Card className="p-0 overflow-hidden hover:border-red-500 transition-colors cursor-pointer">
            <div className="p-6 flex items-center justify-between" onClick={() => router.push('/cleanup')}>
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-red-500/10 text-red-500">
                  <ArchiveX size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">Cleanup Candidates</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Manage and permanently delete long-expired clients.</p>
                </div>
              </div>
              <ChevronRight className="text-zinc-400" />
            </div>
          </Card>
        </div>
      </div>
    </motion.div>
  );
}

function BackupRestoreCard() {
  const toast = require("@/components/toast").useToast((s: any) => s.push);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [restoreAnalysis, setRestoreAnalysis] = useState<any>(null);
  
  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      const res = await api.post<{ id: string }>("/backups", { type: "postgres" });
      const backupId = res.data.id;
      const downloadRes = await api.get(`/backups/${backupId}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([downloadRes.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `backup-${backupId}.gz`);
      document.body.appendChild(link);
      link.click();
      link.parentNode?.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      toast("Backup generated successfully");
    } catch (e) {
      toast("Failed to generate backup", "error");
    } finally {
      setIsBackingUp(false);
    }
  };

  const handleRestoreUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setIsRestoring(true);
    const formData = new FormData();
    formData.append("file", file);
    
    try {
      const res = await api.post("/backups/analyze-upload", formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setRestoreAnalysis(res.data);
    } catch (err) {
      toast("Failed to analyze backup file", "error");
    } finally {
      setIsRestoring(false);
      e.target.value = "";
    }
  };

  const confirmRestore = async () => {
    if (!restoreAnalysis) return;
    setIsRestoring(true);
    try {
      await api.post(`/backups/restore-apply/${restoreAnalysis.id}`, { fileName: restoreAnalysis.fileName });
      toast("System restored successfully. Reloading...");
      setTimeout(() => window.location.reload(), 2000);
    } catch (err) {
      toast("Failed to apply backup", "error");
      setIsRestoring(false);
      setRestoreAnalysis(null);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
          <Database size={20} />
        </div>
        <div>
          <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">System Backup & Restore</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Download a full snapshot of your platform or restore from an existing file.</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <button
          onClick={handleBackup}
          disabled={isBackingUp || isRestoring}
          className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm font-medium text-emerald-600 hover:bg-emerald-500/20 disabled:opacity-50 transition-colors"
        >
          {isBackingUp ? <Spinner className="w-5 h-5 text-emerald-500" /> : <Download size={18} />}
          Download Backup
        </button>

        <label className="flex-1 flex items-center justify-center gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-600 hover:bg-amber-500/20 cursor-pointer disabled:opacity-50 transition-colors">
          {isRestoring && !restoreAnalysis ? <Spinner className="w-5 h-5 text-amber-500" /> : <Upload size={18} />}
          Restore Database
          <input type="file" accept=".sql,.gz" className="hidden" onChange={handleRestoreUpload} disabled={isRestoring || isBackingUp} />
        </label>
      </div>

      {restoreAnalysis && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 p-6 shadow-2xl border border-zinc-200 dark:border-zinc-800"
          >
            <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">Confirm Restore</h3>
            <p className="text-sm text-zinc-500 mb-6">
              This backup contains the following data. Applying it will completely overwrite your current database. This action cannot be undone.
            </p>

            <div className="bg-zinc-50 dark:bg-zinc-950 rounded-xl p-4 mb-6 space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-zinc-200 dark:border-zinc-800/50">
                <span className="text-zinc-500">Admins</span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">{restoreAnalysis.counts.admins}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-zinc-200 dark:border-zinc-800/50">
                <span className="text-zinc-500">Panels</span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">{restoreAnalysis.counts.panels}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-zinc-200 dark:border-zinc-800/50">
                <span className="text-zinc-500">Clients</span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">{restoreAnalysis.counts.clients}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Inbounds</span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">{restoreAnalysis.counts.inbounds}</span>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setRestoreAnalysis(null)}
                className="flex-1 rounded-xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-800 px-4 py-2.5 font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
                disabled={isRestoring}
              >
                Cancel
              </button>
              <button
                onClick={confirmRestore}
                className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 font-medium text-white hover:bg-red-500 transition-colors shadow-lg shadow-red-600/20 flex justify-center items-center gap-2"
                disabled={isRestoring}
              >
                {isRestoring ? <Spinner className="w-5 h-5" /> : "Confirm and Apply"}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </Card>
  );
}
