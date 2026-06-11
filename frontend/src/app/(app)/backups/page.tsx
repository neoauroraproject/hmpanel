"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, DatabaseBackup, Trash2, RefreshCw, Server, Box, AlertTriangle, Clock, HardDrive, Upload, Play, CheckCircle2, FileUp, Save, Download, Cloud } from "lucide-react";
import { api } from "@/lib/api";
import { formatBytes, formatDateTime } from "@/lib/format";
import { Card, PageHeader, Badge, Spinner, ErrorBox } from "@/components/ui";
import { useToast } from "@/components/toast";
import { motion, AnimatePresence } from "framer-motion";
import { RemoteBackups } from "./RemoteBackups";
import { useLicense } from "@/hooks/useLicense";

interface Backup {
  id: string;
  type: "postgres" | "x-ui-db";
  filePath: string;
  fileSize: string;
  checksum: string | null;
  tier: string;
  isManual: boolean;
  status: "completed" | "failed" | "pending" | "corrupted";
  createdAt: string;
  panel?: { id: string; name: string } | null;
}

const MOTION_CONFIG = {
  page: { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.2, ease: "easeOut" as any } },
  cardHover: { scale: 1.02, transition: { duration: 0.2 } },
  row: { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.2 } },
  staggerContainer: { animate: { transition: { staggerChildren: 0.05 } } },
  staggerItem: { initial: { opacity: 0, y: 5 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.15 } }
};

export default function BackupsPage() {
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);
  const [activeTab, setActiveTab] = useState<"system" | "panel" | "migration" | "restore" | "remote">("system");
  const { hasFeature } = useLicense();
  const hasRemoteBackups = hasFeature('REMOTE_BACKUPS');

  const { data: backups, isLoading, error } = useQuery<Backup[]>({
    queryKey: ["backups"],
    queryFn: async () => (await api.get<Backup[]>("/backups")).data,
  });

  const { data: panels } = useQuery({
    queryKey: ["panels"],
    queryFn: async () => (await api.get<any[]>("/panels")).data,
  });

  const { data: settings } = useQuery({
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

  const updatePanel = useMutation({
    mutationFn: async ({ id, payload }: any) => (await api.patch(`/panels/${id}`, payload)).data,
    onSuccess: () => {
      toast("Panel backup config updated");
      qc.invalidateQueries({ queryKey: ["panels"] });
    },
    onError: () => toast("Failed to update panel config", "error"),
  });

  const createBackup = useMutation({
    mutationFn: async ({ type, panelId }: { type: "postgres" | "x-ui-db", panelId?: string }) => {
      return (await api.post<Backup>("/backups", { type, panelId })).data;
    },
    onSuccess: (d) => {
      toast(`Backup created successfully`);
      qc.invalidateQueries({ queryKey: ["backups"] });
    },
    onError: (e: any) => toast(e.response?.data?.message || "Failed to create backup", "error"),
  });

  const restoreBackup = useMutation({
    mutationFn: async (id: string) =>
      (await api.post<{ restored: boolean; message: string }>(`/backups/${id}/restore`)).data,
    onSuccess: (d) => {
      toast(d.message || "Safety backup created and restore issued successfully");
      qc.invalidateQueries({ queryKey: ["backups"] });
    },
    onError: (e: any) => toast(e.response?.data?.message || "Failed to restore backup", "error"),
  });

  const deleteBackup = useMutation({
    mutationFn: async (id: string) =>
      (await api.delete<{ deleted: boolean }>(`/backups/${id}`)).data,
    onSuccess: () => {
      toast("Backup deleted");
      qc.invalidateQueries({ queryKey: ["backups"] });
    },
    onError: () => toast("Failed to delete backup", "error"),
  });

  const uploadRestore = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return (await api.post("/backups/restore-upload", formData)).data;
    },
    onSuccess: (d) => {
      toast(d.message || "Platform restored successfully");
      qc.invalidateQueries({ queryKey: ["backups"] });
    },
    onError: (e: any) => toast(e.response?.data?.message || "Restore failed", "error"),
  });

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message="Failed to load backups" />;
  const list = backups ?? [];

  const sysBackups = list.filter(b => b.type === "postgres");
  const panelBackups = list.filter(b => b.type === "x-ui-db");

  const totalStorage = list.reduce((acc, curr) => acc + Number(curr.fileSize), 0);
  const lastSuccess = list.find(b => b.status === "completed")?.createdAt;
  const lastFailed = list.find(b => b.status === "failed" || b.status === "corrupted")?.createdAt;

  return (
    <motion.div {...MOTION_CONFIG.page} className="space-y-8">
      <PageHeader
        title="Backup Center"
        subtitle="Manage platform configuration, databases, and connected panel snapshots"
      />

      {/* Top Metrics Cards */}
      <motion.div variants={MOTION_CONFIG.staggerContainer} initial="initial" animate="animate" className="grid grid-cols-4 gap-4">
        <MetricCard title="Total Backups" value={list.length.toString()} icon={<DatabaseBackup className="text-blue-400" />} />
        <MetricCard title="Storage Usage" value={formatBytes(totalStorage)} icon={<HardDrive className="text-purple-400" />} />
        <MetricCard title="Last Successful" value={lastSuccess ? formatDateTime(lastSuccess) : "Never"} icon={<Clock className="text-emerald-400" />} />
        <MetricCard title="Last Failed" value={lastFailed ? formatDateTime(lastFailed) : "None"} icon={<AlertTriangle className="text-red-400" />} danger={!!lastFailed} />
      </motion.div>

      {/* Navigation Tabs */}
      <div className="flex border-b border-zinc-200 dark:border-zinc-800 overflow-x-auto">
        <TabButton active={activeTab === "system"} onClick={() => setActiveTab("system")} icon={<Server size={16} />} label="Platform Backups" />
        {hasRemoteBackups && (
          <TabButton active={activeTab === "panel"} onClick={() => setActiveTab("panel")} icon={<Box size={16} />} label="Connected Panel Backups" />
        )}
        <TabButton active={activeTab === "remote"} onClick={() => setActiveTab("remote")} icon={<Cloud size={16} />} label="Remote Cloud" />
        <TabButton active={activeTab === "restore"} onClick={() => setActiveTab("restore")} icon={<RefreshCw size={16} />} label="Restore Center" />
        <TabButton active={activeTab === "migration"} onClick={() => setActiveTab("migration")} icon={<Upload size={16} />} label="Migration Wizard" />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === "system" && (
            <div className="space-y-4">
              <PlatformSettings 
                settings={settings} 
                onSave={(payload: any) => updateSettings.mutate(payload)} 
                isSaving={updateSettings.isPending}
                onCreateBackup={() => createBackup.mutate({ type: "postgres" })}
                isCreating={createBackup.isPending}
              />
              <BackupTable backups={sysBackups} deleteBackup={deleteBackup} />
            </div>
          )}

          {activeTab === "panel" && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 mb-6">
                {(panels ?? []).map((panel) => (
                  <PanelBackupSettings 
                    key={panel.id} 
                    panel={panel} 
                    onSave={(payload: any) => updatePanel.mutate({ id: panel.id, payload })}
                    onBackup={() => createBackup.mutate({ type: "x-ui-db", panelId: panel.id })}
                    isCreating={createBackup.isPending}
                  />
                ))}
              </div>

              <h4 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2">Saved Panel Backups (x-ui.db files)</h4>
              <BackupTable backups={panelBackups} deleteBackup={deleteBackup} isPanel />
            </div>
          )}

          {activeTab === "remote" && (
            <RemoteBackups settings={settings} />
          )}

          {activeTab === "restore" && (
            <div className="space-y-6">
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4 flex items-start gap-3">
                <AlertTriangle className="text-amber-500 shrink-0 mt-0.5" size={20} />
                <div>
                  <h4 className="font-semibold text-amber-500">Critical Restore Warning</h4>
                  <p className="text-sm text-amber-400/80 mt-1">
                    Restoring a backup will <strong className="text-amber-300">overwrite your entire current platform data</strong> (Admins, Settings, Traffic Ledger, etc.).
                    The system will attempt to automatically create a 
                    <span className="font-semibold text-amber-400"> safety_pre_restore</span> backup 
                    before executing the restore operation just in case.
                  </p>
                </div>
              </div>

              <Card className="p-6 border border-blue-500/20 bg-blue-500/5">
                <h3 className="text-lg font-bold text-blue-400 mb-2">Restore Platform Backup</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-4">Upload a downloaded `.json` system backup file to restore the platform state.</p>
                <div className="flex items-center gap-4">
                  <input 
                    type="file" 
                    accept=".json"
                    id="restoreFile"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) {
                        if (confirm("This will overwrite your system. Are you completely sure?")) {
                          uploadRestore.mutate(e.target.files[0]);
                        }
                      }
                    }}
                  />
                  <label htmlFor="restoreFile" className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500 cursor-pointer transition-colors">
                    {uploadRestore.isPending ? <Spinner className="w-5 h-5" /> : <Upload size={16} />}
                    Upload & Restore Now
                  </label>
                </div>
              </Card>

              <h4 className="text-sm font-semibold text-zinc-500 dark:text-zinc-400 uppercase tracking-wider mb-2 mt-8">Select a Previous System Backup to Restore</h4>
              <BackupTable backups={sysBackups} restoreBackup={restoreBackup} deleteBackup={deleteBackup} />
            </div>
          )}

          {activeTab === "migration" && (
            <MigrationWizard />
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}

function PlatformSettings({ settings, onSave, isSaving, onCreateBackup, isCreating }: any) {
  const [form, setForm] = useState({
    platformBackupEnabled: false,
    platformBackupCount_5min: 6,
    platformBackupCount_30min: 12,
    platformBackupCount_hourly: 24,
    platformBackupCount_daily: 7,
    platformBackupCount_weekly: 4,
  });

  useEffect(() => {
    if (settings) {
      setForm({
        platformBackupEnabled: settings.platformBackupEnabled === true || settings.platformBackupEnabled === "true",
        platformBackupCount_5min: Number(settings.platformBackupCount_5min) || 6,
        platformBackupCount_30min: Number(settings.platformBackupCount_30min) || 12,
        platformBackupCount_hourly: Number(settings.platformBackupCount_hourly) || 24,
        platformBackupCount_daily: Number(settings.platformBackupCount_daily) || 7,
        platformBackupCount_weekly: Number(settings.platformBackupCount_weekly) || 4,
      });
    }
  }, [settings]);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
            Auto Backup Settings
          </h3>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Configure snapshot retention and automatic scheduling for the central platform.</p>
        </div>
        <button 
          onClick={onCreateBackup} disabled={isCreating}
          className="flex items-center gap-2 rounded-lg bg-emerald-600/20 border border-emerald-500/50 px-4 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-600/30 transition-colors disabled:opacity-50"
        >
          {isCreating ? <Spinner className="w-4 h-4" /> : <Plus size={16} />} Create Backup Now
        </button>
      </div>

      <div className="space-y-4">
        <label className="flex items-center gap-3 cursor-pointer select-none">
          <input 
            type="checkbox" 
            checked={form.platformBackupEnabled} 
            onChange={(e) => setForm(f => ({ ...f, platformBackupEnabled: e.target.checked }))}
            className="w-5 h-5 rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-blue-500 focus:ring-blue-500 focus:ring-offset-zinc-900" 
          />
          <span className="font-medium text-zinc-700 dark:text-zinc-200">Enable Auto Backup</span>
        </label>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <RetentionInput label="5 Minutes" value={form.platformBackupCount_5min} onChange={(v: number) => setForm(f => ({ ...f, platformBackupCount_5min: v }))} disabled={!form.platformBackupEnabled} />
          <RetentionInput label="30 Minutes" value={form.platformBackupCount_30min} onChange={(v: number) => setForm(f => ({ ...f, platformBackupCount_30min: v }))} disabled={!form.platformBackupEnabled} />
          <RetentionInput label="1 Hour" value={form.platformBackupCount_hourly} onChange={(v: number) => setForm(f => ({ ...f, platformBackupCount_hourly: v }))} disabled={!form.platformBackupEnabled} />
          <RetentionInput label="24 Hours" value={form.platformBackupCount_daily} onChange={(v: number) => setForm(f => ({ ...f, platformBackupCount_daily: v }))} disabled={!form.platformBackupEnabled} />
          <RetentionInput label="7 Days" value={form.platformBackupCount_weekly} onChange={(v: number) => setForm(f => ({ ...f, platformBackupCount_weekly: v }))} disabled={!form.platformBackupEnabled} />
        </div>

        <div className="flex justify-end pt-4">
          <button 
            onClick={() => onSave(form)} disabled={isSaving}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-2 font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            {isSaving ? <Spinner className="w-4 h-4" /> : <Save size={16} />} Save Settings
          </button>
        </div>
      </div>
    </Card>
  );
}

function PanelBackupSettings({ panel, onSave, onBackup, isCreating }: any) {
  const [enabled, setEnabled] = useState(panel.backupEnabled);
  const [freq, setFreq] = useState(panel.backupFrequency || "daily");
  const [keep, setKeep] = useState(panel.backupKeepCount || 20);

  const isChanged = enabled !== panel.backupEnabled || freq !== panel.backupFrequency || keep !== panel.backupKeepCount;

  return (
    <Card className="p-4 border-l-4 border-l-purple-500">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h4 className="font-bold text-zinc-800 dark:text-zinc-100 text-lg flex items-center gap-2">
            <Box size={18} className="text-purple-400" /> {panel.name}
          </h4>
          <div className="text-xs text-zinc-500 dark:text-zinc-400">{panel.url}</div>
        </div>
        
        <div className="flex flex-wrap items-center gap-4 bg-white dark:bg-zinc-900/50 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input 
              type="checkbox" 
              checked={enabled} 
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-4 h-4 rounded border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 text-purple-500 focus:ring-purple-500 focus:ring-offset-zinc-900" 
            />
            <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">Enable Auto Backup</span>
          </label>
          
          <div className="w-px h-6 bg-zinc-100 dark:bg-zinc-800 hidden md:block"></div>
          
          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Frequency:</span>
            <select 
              value={freq} 
              onChange={(e) => setFreq(e.target.value)} 
              disabled={!enabled}
              className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded text-sm px-2 py-1 text-zinc-700 dark:text-zinc-200 outline-none disabled:opacity-50"
            >
              <option value="hourly">Every Hour</option>
              <option value="6h">Every 6 Hours</option>
              <option value="12h">Every 12 Hours</option>
              <option value="daily">Daily</option>
            </select>
          </div>

          <div className="w-px h-6 bg-zinc-100 dark:bg-zinc-800 hidden md:block"></div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-zinc-500">Keep Last:</span>
            <input 
              type="number" 
              value={keep} 
              onChange={(e) => setKeep(Number(e.target.value))} 
              disabled={!enabled}
              className="bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded text-sm px-2 py-1 w-16 text-zinc-700 dark:text-zinc-200 outline-none disabled:opacity-50"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isChanged && (
            <motion.button 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              onClick={() => onSave({ backupEnabled: enabled, backupFrequency: freq, backupKeepCount: keep })}
              className="rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition-colors"
            >
              Save
            </motion.button>
          )}
          <button
            onClick={onBackup}
            disabled={isCreating}
            className="flex items-center gap-2 rounded bg-zinc-100 dark:bg-zinc-800 px-3 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-700 transition-colors disabled:opacity-50"
          >
            <DatabaseBackup size={16} /> Backup Now
          </button>
        </div>
      </div>
    </Card>
  );
}

function RetentionInput({ label, value, onChange, disabled }: { label: string, value: number, onChange: (v: number) => void, disabled: boolean }) {
  return (
    <div className={`bg-white dark:bg-zinc-900/50 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 transition-opacity ${disabled ? "opacity-50 grayscale" : ""}`}>
      <div className="text-xs font-semibold text-zinc-500 mb-2 uppercase tracking-wider">{label}</div>
      <div className="flex items-center gap-2">
        <span className="text-sm text-zinc-500 dark:text-zinc-400">Keep:</span>
        <input 
          type="number" 
          value={value} 
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled}
          className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded text-sm px-2 py-1 text-zinc-700 dark:text-zinc-200 outline-none" 
        />
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
        active 
          ? "border-blue-500 text-blue-400 bg-blue-500/5" 
          : "border-transparent text-zinc-500 hover:text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:border-zinc-700 hover:bg-white dark:bg-zinc-900/50"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

function MetricCard({ title, value, icon, danger }: { title: string; value: string; icon: React.ReactNode; danger?: boolean }) {
  return (
    <motion.div variants={MOTION_CONFIG.staggerItem} whileHover={MOTION_CONFIG.cardHover} className={`rounded-xl border p-5 shadow-lg ${danger ? "bg-red-500/5 border-red-500/20" : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800"}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs font-medium text-zinc-500 mb-1">{title}</div>
          <div className={`text-xl font-bold ${danger ? "text-red-400" : "text-zinc-800 dark:text-zinc-100"}`}>{value}</div>
        </div>
        <div className="rounded-lg bg-zinc-50 dark:bg-zinc-950/50 p-2">{icon}</div>
      </div>
    </motion.div>
  );
}

function BackupTable({ backups, restoreBackup, deleteBackup, isPanel }: any) {
  const toast = useToast((s) => s.push);
  const downloadFile = async (b: any) => {
    try {
      const res = await api.get(`/backups/${b.id}/download`, { responseType: 'blob' });
      const fallbackExt = b.type === "postgres" ? ".json" : ".db";
      const filename = res.headers["content-disposition"]?.split("filename=")[1]?.replace(/"/g, "") || `backup-${b.id}${fallbackExt}`;
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (e) {
      toast("Download failed", "error");
    }
  };

  return (
    <Card className="overflow-hidden p-0 shadow-lg border-zinc-200 dark:border-zinc-800/50 h-full max-h-[500px] flex flex-col">
      <div className="flex-1 overflow-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white dark:bg-zinc-900/95 backdrop-blur-sm z-10 shadow-sm">
            <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-[11px] uppercase tracking-wider text-zinc-500 bg-white dark:bg-zinc-900/50">
              {isPanel && <th className="px-4 py-3 font-semibold">Panel</th>}
              <th className="px-4 py-3 font-semibold">File Type</th>
              <th className="px-4 py-3 font-semibold">Size</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 font-semibold">Time</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {backups.map((b: any, i: number) => (
              <motion.tr 
                key={b.id} 
                initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.15, delay: i * 0.02 }}
                whileHover={{ backgroundColor: "rgba(39, 39, 42, 0.4)" }}
                className="group"
              >
                {isPanel && (
                  <td className="px-4 py-3">
                    {b.panel ? <Badge tone="purple">{b.panel.name}</Badge> : b.type === "postgres" ? <span className="text-zinc-500 text-xs">System</span> : <span className="text-zinc-500 text-xs">Unknown</span>}
                  </td>
                )}
                <td className="px-4 py-3">
                  <div className="font-medium text-zinc-700 dark:text-zinc-200">{b.type === "postgres" ? "JSON DB Dump" : "Raw x-ui.db"}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] uppercase font-bold text-zinc-500">{b.isManual ? "Manual" : "Auto"}</span>
                    <div className="scale-90 origin-left">
                      <Badge tone={b.tier.includes("safety") ? "amber" : "blue"}>{b.tier}</Badge>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3 text-zinc-600 dark:text-zinc-300 font-mono text-xs">{formatBytes(Number(b.fileSize))}</td>
                <td className="px-4 py-3">
                  <Badge tone={b.status === "completed" ? "green" : b.status === "pending" ? "amber" : "red"}>{b.status}</Badge>
                </td>
                <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400 text-xs">{formatDateTime(b.createdAt)}</td>
                <td className="px-4 py-3 text-right">
                  <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <a
                      href="#"
                      title="Download"
                      className="rounded p-1.5 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:bg-zinc-800 hover:text-emerald-400 transition-colors cursor-pointer"
                      onClick={(e) => { e.preventDefault(); downloadFile(b); }}
                    >
                      <Download size={14} />
                    </a>
                    {restoreBackup && (
                      <button
                        onClick={() => { if (confirm("Are you sure you want to restore this backup?")) restoreBackup.mutate(b.id); }}
                        disabled={restoreBackup.isPending || b.status !== "completed"}
                        title="Restore"
                        className="flex items-center gap-2 rounded px-2 py-1.5 text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:bg-zinc-800 hover:text-blue-400 disabled:opacity-30 transition-colors"
                      >
                        <RefreshCw size={14} /> Restore
                      </button>
                    )}
                    {deleteBackup && (
                      <button
                        onClick={() => { if (confirm("Delete this backup?")) deleteBackup.mutate(b.id); }}
                        disabled={deleteBackup.isPending}
                        title="Delete"
                        className="rounded p-1.5 text-zinc-500 dark:text-zinc-400 hover:bg-red-500/10 hover:text-red-400 disabled:opacity-30 transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </motion.tr>
            ))}
            {backups.length === 0 && (
              <tr><td colSpan={isPanel ? 6 : 5} className="px-4 py-8 text-center text-zinc-500 text-xs">No backups found.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// MIGRATION WIZARD
function MigrationWizard() {
  const toast = useToast((s) => s.push);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [file, setFile] = useState<File | null>(null);
  const [previewData, setPreviewData] = useState<any>(null);
  const [importReport, setImportReport] = useState<any>(null);
  const [syncReport, setSyncReport] = useState<any>(null);

  const uploadFile = useMutation({
    mutationFn: async () => {
      const formData = new FormData();
      formData.append("file", file!);
      return (await api.post("/migration/upload", formData, { headers: { "Content-Type": "multipart/form-data" } })).data;
    },
    onSuccess: () => setStep(2),
    onError: (e: any) => toast(e.response?.data?.message || "Upload failed", "error"),
  });

  const getPreview = useMutation({
    mutationFn: async () => (await api.post("/migration/preview")).data,
    onSuccess: (data) => setPreviewData(data),
    onError: () => toast("Failed to fetch preview", "error"),
  });

  const runImport = useMutation({
    mutationFn: async () => (await api.post("/migration/import")).data,
    onSuccess: (data) => {
      setImportReport(data);
      setStep(3);
    },
    onError: (e: any) => toast(e.response?.data?.message || "Import failed", "error"),
  });

  const runSync = useMutation({
    mutationFn: async () => (await api.post("/migration/sync")).data,
    onSuccess: (data) => {
      setSyncReport(data);
      setStep(4);
    },
    onError: (e: any) => toast(e.response?.data?.message || "Sync failed", "error"),
  });

  return (
    <div className="max-w-3xl mx-auto py-8">
      <div className="flex items-center justify-between mb-8 relative">
        <div className="absolute top-1/2 left-0 w-full h-0.5 bg-zinc-100 dark:bg-zinc-800 -z-10 -translate-y-1/2"></div>
        {[1, 2, 3, 4].map((s) => (
          <div key={s} className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${step >= s ? "bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.5)]" : "bg-white dark:bg-zinc-900 border border-zinc-300 dark:border-zinc-700 text-zinc-500"}`}>
            {s}
          </div>
        ))}
      </div>

      <Card className="p-8 shadow-xl border-t-4 border-t-blue-500">
        {step === 1 && (
          <div className="text-center space-y-6">
            <div className="mx-auto w-16 h-16 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 mb-4">
              <FileUp size={32} />
            </div>
            <h3 className="text-xl font-bold text-zinc-800 dark:text-zinc-100">Upload Whale Panel Backup</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md mx-auto">
              Select your legacy <code className="bg-zinc-100 dark:bg-zinc-800 px-1 py-0.5 rounded">.db</code> backup file to begin the migration process.
            </p>
            
            <div className="flex flex-col items-center gap-4 pt-4">
              <input 
                type="file" 
                accept=".db" 
                onChange={(e) => setFile(e.target.files?.[0] || null)}
                className="text-sm text-zinc-500 dark:text-zinc-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-500/10 file:text-blue-400 hover:file:bg-blue-500/20"
              />
              <button 
                onClick={() => { uploadFile.mutate(); getPreview.mutate(); }}
                disabled={!file || uploadFile.isPending}
                className="w-full max-w-xs rounded-lg bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500 disabled:opacity-50 flex justify-center items-center gap-2 transition-colors"
              >
                {uploadFile.isPending ? <Spinner className="w-4 h-4" /> : <Upload size={16} />}
                Upload & Analyze
              </button>
            </div>
          </div>
        )}

        {step === 2 && previewData && (
          <div className="space-y-6">
            <h3 className="text-xl font-bold text-zinc-800 dark:text-zinc-100 text-center mb-6">Migration Preview</h3>
            <div className="grid grid-cols-3 gap-4 mb-8">
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-xl text-center shadow-inner">
                <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Panels</div>
                <div className="text-2xl font-bold text-blue-400">{previewData.panels}</div>
              </div>
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-xl text-center shadow-inner">
                <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Admins</div>
                <div className="text-2xl font-bold text-emerald-400">{previewData.admins}</div>
              </div>
              <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-4 rounded-xl text-center shadow-inner">
                <div className="text-xs text-zinc-500 uppercase tracking-wider mb-1">Users to map</div>
                <div className="text-2xl font-bold text-purple-400">{previewData.users}</div>
              </div>
            </div>
            
            <button 
              onClick={() => runImport.mutate()}
              disabled={runImport.isPending}
              className="w-full rounded-lg bg-emerald-600 px-4 py-3 font-medium text-white hover:bg-emerald-500 disabled:opacity-50 flex justify-center items-center gap-2 transition-colors"
            >
              {runImport.isPending ? <Spinner className="w-5 h-5" /> : <Play size={18} />}
              Start Database Import
            </button>
          </div>
        )}

        {step === 3 && importReport && (
          <div className="space-y-6 text-center">
            <CheckCircle2 size={48} className="text-emerald-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-zinc-800 dark:text-zinc-100">Database Imported Successfully</h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              The local database has been populated. Next, we must sync with the live panels to complete the mapping.
            </p>
            
            <button 
              onClick={() => runSync.mutate()}
              disabled={runSync.isPending}
              className="w-full mt-4 rounded-lg bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-500 disabled:opacity-50 flex justify-center items-center gap-2 transition-colors"
            >
              {runSync.isPending ? <Spinner className="w-5 h-5" /> : <RefreshCw size={18} />}
              Sync Live Panels
            </button>
          </div>
        )}

        {step === 4 && syncReport && (
          <div className="space-y-6 text-center">
            <CheckCircle2 size={48} className="text-emerald-500 mx-auto mb-4 shadow-[0_0_30px_rgba(16,185,129,0.3)] rounded-full" />
            <h3 className="text-2xl font-bold text-zinc-800 dark:text-zinc-100">Migration Complete!</h3>
            
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 rounded-xl mt-6 text-left text-sm space-y-3 shadow-inner">
              <div className="flex justify-between"><span className="text-zinc-500 dark:text-zinc-400">Panels Synced</span><span className="font-bold text-zinc-700 dark:text-zinc-200">{syncReport.panelsSynced}</span></div>
              <div className="flex justify-between"><span className="text-zinc-500 dark:text-zinc-400">Clients Imported</span><span className="font-bold text-zinc-700 dark:text-zinc-200">{syncReport.clientsImported}</span></div>
              <div className="flex justify-between"><span className="text-emerald-400">Successful Maps</span><span className="font-bold text-emerald-400">{syncReport.clientsMatched}</span></div>
              <div className="flex justify-between"><span className="text-amber-400">Missing Maps</span><span className="font-bold text-amber-400">{syncReport.clientsMissing}</span></div>
            </div>
            
            <button 
              onClick={() => { setStep(1); setFile(null); }}
              className="mt-6 text-blue-400 hover:text-blue-300 text-sm font-medium transition-colors"
            >
              Run another migration
            </button>
          </div>
        )}
      </Card>
    </div>
  );
}
