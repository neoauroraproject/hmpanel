"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Settings, Activity, ArchiveX, ChevronRight, Info, ExternalLink, Database, Download, Upload, Shield, RefreshCw } from "lucide-react";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { ErrorBox, PageHeader, Spinner, Card } from "@/components/ui";
import { useToast } from "@/components/toast";
import { motion } from "framer-motion";
import { SslManagerModal } from "./SslManagerModal";
import { LicenseSettingsCard } from "@/components/LicenseSettingsCard";

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
  
  const [isSslModalOpen, setIsSslModalOpen] = useState(false);

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

          <LicenseSettingsCard />
          <BackupRestoreCard />
          <Card className="p-0 overflow-hidden hover:border-indigo-500 transition-colors cursor-pointer">
            <div className="p-6 flex items-center justify-between" onClick={() => setIsSslModalOpen(true)}>
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-lg bg-indigo-500/10 text-indigo-500">
                  <Shield size={24} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">SSL Management</h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">Manage platform access mode and certificates.</p>
                </div>
              </div>
              <ChevronRight className="text-zinc-400" />
            </div>
          </Card>
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
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">
                    <VersionDisplay />
                  </span>
                </div>
                <div className="flex justify-between border-b border-zinc-200 dark:border-zinc-800/60 pb-2">
                  <span className="text-zinc-500">Edition</span>
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">Professional Edition</span>
                </div>
                <div className="flex justify-between border-b border-zinc-200 dark:border-zinc-800/60 pb-2">
                  <span className="text-zinc-500">Build</span>
                  <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                    <VersionDisplay />
                  </span>
                </div>
              <div className="pt-2 space-y-2">
                <a href="https://github.com/neoauroraproject/hmpanel" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400 hover:text-blue-500 transition-colors">
                  <ExternalLink size={14} /> Official GitHub
                </a>
                <a href="https://t.me/hmpanel" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400 hover:text-blue-500 transition-colors">
                  <ExternalLink size={14} /> Telegram Channel
                </a>
              </div>
              <UpdateCard />
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
      <SslManagerModal isOpen={isSslModalOpen} onClose={() => setIsSslModalOpen(false)} />
    </motion.div>
  );
}

interface RestoreAnalysis {
  id: string;
  fileName: string;
  type: string;
  domain?: string;
  version?: string;
  schemaVersion?: string;
  sizeBytes: number;
  uploadDate: string;
  isLegacy: boolean;
  counts?: {
    admin: number;
    panel: number;
    inbound: number;
  };
  warnings: string[];
}

function BackupRestoreCard() {
  const toast = useToast((s) => s.push);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [backupType, setBackupType] = useState('full');
  const [restoreAnalysis, setRestoreAnalysis] = useState<RestoreAnalysis | null>(null);
  
  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      const res = await api.post<{ id: string }>("/backups", { type: backupType });
      const backupId = res.data.id;
      const downloadRes = await api.get(`/backups/${backupId}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([downloadRes.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', backupId); // API already returns full filename in id
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
      // @ts-ignore
      const analysis = restoreAnalysis as { id: string, fileName: string };
      await api.post(`/backups/restore-apply`, { id: analysis.id, fileName: analysis.fileName });
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
        <div className="flex-1 flex flex-col gap-2 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
          <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">Backup Type</label>
          <select 
            value={backupType}
            onChange={e => setBackupType(e.target.value)}
            className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white"
            disabled={isBackingUp || isRestoring}
          >
            <option value="full">Full Backup (Database + Config)</option>
            <option value="database">Database Only</option>
            <option value="config">Configuration Only</option>
          </select>
          <button
            onClick={handleBackup}
            disabled={isBackingUp || isRestoring}
            className="mt-2 w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
          >
            {isBackingUp ? <Spinner className="w-4 h-4" /> : <Download size={16} />}
            Download Backup
          </button>
        </div>

        <div className="flex-1 flex flex-col justify-end gap-2 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
            Upload a .tar.gz or legacy .sql.gz backup file to restore. Note: Transactional restores currently require using the CLI.
          </p>
          <label className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-600 hover:bg-amber-500/20 cursor-pointer disabled:opacity-50 transition-colors">
            {isRestoring && !restoreAnalysis ? <Spinner className="w-5 h-5 text-amber-500" /> : <Upload size={18} />}
            Upload Archive
            <input type="file" accept=".sql,.gz,.tar.gz" className="hidden" onChange={handleRestoreUpload} disabled={isRestoring || isBackingUp} />
          </label>
        </div>
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
              You are about to restore this backup. Note: Full transactional restores currently must be executed from the CLI.
            </p>

            <div className="bg-zinc-50 dark:bg-zinc-950 rounded-xl p-4 mb-6 space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-zinc-200 dark:border-zinc-800/50">
                <span className="text-zinc-500">File</span>
                <span className="font-mono text-xs text-zinc-800 dark:text-zinc-200">{restoreAnalysis.fileName}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-zinc-200 dark:border-zinc-800/50">
                <span className="text-zinc-500">Type</span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200 uppercase">{restoreAnalysis.type}</span>
              </div>
              {!restoreAnalysis.isLegacy && (
                <>
                  <div className="flex justify-between items-center pb-2 border-b border-zinc-200 dark:border-zinc-800/50">
                    <span className="text-zinc-500">App Version</span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">{restoreAnalysis.version}</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-zinc-200 dark:border-zinc-800/50">
                    <span className="text-zinc-500">Timestamp</span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">{new Date(restoreAnalysis.uploadDate).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-zinc-200 dark:border-zinc-800/50">
                    <span className="text-zinc-500">Domain</span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">{restoreAnalysis.domain}</span>
                  </div>
                </>
              )}
              {restoreAnalysis.counts && (
                <div className="flex justify-between items-center pb-2 border-b border-zinc-200 dark:border-zinc-800/50">
                  <span className="text-zinc-500">Contents</span>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200 text-xs">
                    {restoreAnalysis.counts.admin} Admins, {restoreAnalysis.counts.panel} Panels, {restoreAnalysis.counts.inbound} Inbounds
                  </span>
                </div>
              )}
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">Size</span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">{(restoreAnalysis.sizeBytes / 1024 / 1024).toFixed(2)} MB</span>
              </div>
            </div>

            {restoreAnalysis.warnings?.length > 0 && (
              <div className="mb-6 p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-400 mb-1">Warnings:</p>
                <ul className="list-disc pl-4 text-xs text-amber-700 dark:text-amber-500">
                  {restoreAnalysis.warnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
              </div>
            )}

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
  };
}

function VersionDisplay() {
  const { data: updateInfo } = useQuery({
    queryKey: ['check-update'],
    queryFn: async () => (await api.get("/settings/check-update")).data,
    refetchInterval: 1000 * 60 * 60,
  });
  return <>{updateInfo?.currentVersion || 'Loading...'}</>;
}

function UpdateCard() {
  const toast = useToast((s) => s.push);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateLogs, setUpdateLogs] = useState<string>('');
  const [updateCompleted, setUpdateCompleted] = useState(false);

  const { data: updateInfo, isLoading } = useQuery({
    queryKey: ['check-update'],
    queryFn: async () => (await api.get("/settings/check-update")).data,
    refetchInterval: 1000 * 60 * 60, // Check every hour
  });

  const pollLogs = async () => {
    try {
      const res = await api.get("/settings/update-logs");
      if (res.data.success && res.data.logs) {
        setUpdateLogs(res.data.logs);
      }
      if (res.data.completed) {
        setUpdateCompleted(true);
      }
    } catch (e) {
      // Panel is likely offline and restarting!
      setUpdateLogs((prev) => prev + '\n[Waiting for panel to restart... connection lost]');
    }
  };

  useEffect(() => {
    let interval: any;
    if (isUpdating && !updateCompleted) {
      interval = setInterval(pollLogs, 3000);
    }
    return () => clearInterval(interval);
  }, [isUpdating, updateCompleted]);

  const updatePanel = useMutation({
    mutationFn: async () => (await api.post("/settings/update-panel")).data,
    onSuccess: (data: { message: string }) => {
      toast(data.message || 'Update started...', 'success');
      setIsUpdating(true);
      setUpdateCompleted(false);
    },
    onError: (e: Error & { response?: { data?: { message?: string } } }) => {
      toast(e.response?.data?.message || "Failed to initiate update", "error");
    },
  });

  const handleUpdate = () => {
    if (window.confirm("Are you sure you want to update? The panel will go offline for 1-2 minutes during the update process.")) {
      updatePanel.mutate();
    }
  };

  if (isLoading || !updateInfo) return null;

  if (isUpdating) {
    return (
      <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800/60">
        {updateCompleted ? (
          <>
            <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 mb-2">✔ Update Complete!</p>
            <pre className="text-[10px] sm:text-xs bg-zinc-900 text-green-400 p-3 rounded-lg overflow-x-auto max-h-48 whitespace-pre-wrap font-mono mb-3">
              {updateLogs}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className="w-full py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw size={14} /> Reload Panel
            </button>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-2">Update in Progress...</p>
            <pre className="text-[10px] sm:text-xs bg-zinc-900 text-green-400 p-3 rounded-lg overflow-x-auto max-h-48 whitespace-pre-wrap font-mono">
              {updateLogs || 'Initializing updater...'}
            </pre>
          </>
        )}
      </div>
    );
  }

  if (updateInfo.hasUpdate) {
    return (
      <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800/60">
        <div className="p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-lg">
          <div className="flex flex-col gap-2">
            <div>
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-500">Update Available!</p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                Version {updateInfo.latestVersion} is now available (Current: {updateInfo.currentVersion}).
              </p>
            </div>
            {updateInfo.canAutoUpdate ? (
              <button
                onClick={handleUpdate}
                disabled={updatePanel.isPending}
                className="mt-1 flex items-center justify-center gap-2 w-full py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded transition-colors disabled:opacity-50"
              >
                {updatePanel.isPending ? <Spinner className="w-4 h-4 text-white" /> : <RefreshCw size={14} />}
                {updatePanel.isPending ? 'Preparing Update...' : 'Update Now'}
              </button>
            ) : (
              <div className="mt-2 text-xs text-amber-800 dark:text-amber-500 bg-amber-100 dark:bg-amber-900/30 p-2 rounded">
                <strong>Auto Update is disabled.</strong><br/>
                Docker socket is not mounted in the panel container. To update, connect to your server via SSH and run:
                <code className="block mt-1 bg-black/10 dark:bg-black/30 p-1.5 rounded text-amber-900 dark:text-amber-400 font-mono">hm</code>
                Then select Option 3 (Update).
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800/60">
      <p className="text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
        <Shield size={14} /> You are on the latest version.
      </p>
    </div>
  );
}
