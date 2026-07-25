"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Save, Settings, Activity, ArchiveX, ChevronRight, Info, ExternalLink, Database, Download, Upload, Shield, RefreshCw, Clock, KeyRound } from "lucide-react";
import { api } from "@/lib/api";
import { useRouter } from "next/navigation";
import { ErrorBox, PageHeader, Spinner, Card } from "@/components/ui";
import { useToast } from "@/components/toast";
import { motion } from "framer-motion";
import { SslManagerModal } from "./SslManagerModal";
import { LicenseSettingsCard } from "@/components/LicenseSettingsCard";
import { LocaleSwitcher } from "@/components/LocaleSwitcher";
import { useT } from "@/i18n";
import { setDisplayTimezone } from "@/lib/format";
import { COMMON_TIMEZONES, DEFAULT_DISPLAY_TIMEZONE } from "@/lib/timezone";

export default function GlobalSettingsPage() {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);
  const router = useRouter();

  type SettingsTab = "general" | "license" | "ssl" | "backup" | "about";
  const [tab, setTab] = useState<SettingsTab>("general");

  const { data: settings, isLoading, error } = useQuery({
    queryKey: ["settings"],
    queryFn: async () => (await api.get<any>("/settings")).data,
  });

  const updateSettings = useMutation({
    mutationFn: async (payload: any) => (await api.post("/settings", payload)).data,
    onSuccess: () => {
      toast(t("settings.savedOk"));
      qc.invalidateQueries({ queryKey: ["settings"] });
    },
    onError: () => toast(t("settings.saveFailed"), "error"),
  });

  const [form, setForm] = useState({
    cleanup_threshold_days: 30,
    display_timezone: DEFAULT_DISPLAY_TIMEZONE,
  });
  
  const [isSslModalOpen, setIsSslModalOpen] = useState(false);

  useEffect(() => {
    if (settings) {
      const tz =
        typeof settings.display_timezone === "string" && settings.display_timezone.trim()
          ? settings.display_timezone.trim()
          : DEFAULT_DISPLAY_TIMEZONE;
      setForm({
        cleanup_threshold_days: Number(settings.cleanup_threshold_days) || 30,
        display_timezone: tz,
      });
      setDisplayTimezone(tz);
    }
  }, [settings]);

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message={t("settings.loadFailed")} />;

  const tabs: { id: SettingsTab; label: string; icon: typeof Settings }[] = [
    { id: "general", label: t("settings.tabGeneral"), icon: Settings },
    { id: "license", label: t("settings.tabLicense"), icon: KeyRound },
    { id: "ssl", label: t("settings.tabSsl"), icon: Shield },
    { id: "backup", label: t("settings.tabBackup"), icon: Database },
    { id: "about", label: t("settings.tabAbout"), icon: Info },
  ];

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <PageHeader
        title={t("settings.title")}
        subtitle={t("settings.subtitle")}
      />

      <div className="mb-6 flex flex-wrap gap-2 rounded-2xl border border-zinc-200 bg-zinc-50/80 p-1.5 dark:border-zinc-800 dark:bg-zinc-900/40">
        {tabs.map(({ id, label, icon: Icon }) => {
          const active = tab === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={
                active
                  ? "inline-flex items-center gap-2 rounded-xl bg-white px-3.5 py-2 text-sm font-semibold text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                  : "inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium text-zinc-500 hover:bg-white/70 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-800/60 dark:hover:text-zinc-200"
              }
            >
              <Icon size={16} />
              {label}
            </button>
          );
        })}
      </div>

      {tab === "general" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 items-start">
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                <Settings size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">{t("settings.cleanupTitle")}</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{t("settings.cleanupHint")}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  {t("settings.daysAfterExpiration")}
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="number"
                    min="0"
                    value={form.cleanup_threshold_days}
                    onChange={(e) => setForm({ ...form, cleanup_threshold_days: Number(e.target.value) })}
                    className="w-full max-w-[120px] rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors"
                  />
                  <span className="text-sm text-zinc-500">{t("settings.daysUnit")}</span>
                </div>
                <p className="text-xs text-zinc-500 mt-2">{t("settings.cleanupThresholdHelp", { days: form.cleanup_threshold_days })}</p>
              </div>

              <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end">
                <button
                  onClick={() => updateSettings.mutate(form)}
                  disabled={updateSettings.isPending}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
                >
                  {updateSettings.isPending ? <Spinner className="w-4 h-4" /> : <Save size={16} />}
                  {t("settings.saveSettings")}
                </button>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                <Clock size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">{t("settings.timezone")}</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{t("settings.timezoneHint")}</p>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">
                  {t("settings.timezone")}
                </label>
                <select
                  value={form.display_timezone}
                  onChange={(e) => {
                    const next = e.target.value;
                    setForm({ ...form, display_timezone: next });
                    setDisplayTimezone(next);
                  }}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors"
                >
                  {COMMON_TIMEZONES.map((tz) => {
                    const label = t(`timezones.${tz}`);
                    return (
                      <option key={tz} value={tz}>
                        {label.startsWith("timezones.") ? tz : label}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="pt-4 border-t border-zinc-200 dark:border-zinc-800 flex justify-end">
                <button
                  onClick={() => {
                    updateSettings.mutate(form);
                    setDisplayTimezone(form.display_timezone);
                  }}
                  disabled={updateSettings.isPending}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
                >
                  {updateSettings.isPending ? <Spinner className="w-4 h-4" /> : <Save size={16} />}
                  {t("common.save")}
                </button>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-violet-500/10 text-violet-500">
                <Info size={20} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">{t("common.language")}</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{t("settings.languageHint")}</p>
              </div>
            </div>
            <LocaleSwitcher className="w-full justify-stretch [&>button]:flex-1" />
          </Card>

          <div className="space-y-4">
            <Card className="p-0 overflow-hidden hover:border-blue-500 transition-colors cursor-pointer">
              <div className="p-6 flex items-center justify-between" onClick={() => router.push('/diagnostics')}>
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-lg bg-indigo-500/10 text-indigo-500">
                    <Activity size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">{t("settings.diagnosticsTitle")}</h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{t("settings.diagnosticsHint")}</p>
                  </div>
                </div>
                <ChevronRight className="text-zinc-400 rtl:rotate-180" />
              </div>
            </Card>

            <Card className="p-0 overflow-hidden hover:border-red-500 transition-colors cursor-pointer">
              <div className="p-6 flex items-center justify-between" onClick={() => router.push('/cleanup')}>
                <div className="flex items-center gap-4">
                  <div className="p-3 rounded-lg bg-red-500/10 text-red-500">
                    <ArchiveX size={24} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">{t("settings.cleanupCandidatesTitle")}</h3>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{t("settings.cleanupCandidatesHint")}</p>
                  </div>
                </div>
                <ChevronRight className="text-zinc-400 rtl:rotate-180" />
              </div>
            </Card>
          </div>
        </div>
      )}

      {tab === "license" && (
        <div className="max-w-3xl">
          <LicenseSettingsCard />
        </div>
      )}

      {tab === "ssl" && (
        <div className="max-w-3xl">
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-3 rounded-lg bg-indigo-500/10 text-indigo-500">
                <Shield size={24} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">{t("settings.sslTitle")}</h3>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{t("settings.sslHint")}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsSslModalOpen(true)}
              className="inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-500 transition-colors"
            >
              <Shield size={16} />
              {t("settings.openSslManager")}
            </button>
          </Card>
        </div>
      )}

      {tab === "backup" && (
        <div className="max-w-4xl">
          <BackupRestoreCard />
        </div>
      )}

      {tab === "about" && (
        <div className="max-w-3xl">
          <Card className="p-6 border-blue-500/20 bg-blue-500/5">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                <Info size={20} />
              </div>
              <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">{t("settings.aboutTitle")}</h3>
            </div>
            <div className="space-y-3 text-sm">
                <div className="flex justify-between border-b border-zinc-200 dark:border-zinc-800/60 pb-2">
                  <span className="text-zinc-500">{t("settings.panelVersion")}</span>
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">
                    <VersionDisplay />
                  </span>
                </div>
                <div className="flex justify-between border-b border-zinc-200 dark:border-zinc-800/60 pb-2">
                  <span className="text-zinc-500">{t("settings.edition")}</span>
                  <span className="font-medium text-zinc-800 dark:text-zinc-200">{t("settings.editionValue")}</span>
                </div>
                <div className="flex justify-between border-b border-zinc-200 dark:border-zinc-800/60 pb-2">
                  <span className="text-zinc-500">{t("settings.build")}</span>
                  <span className="font-mono text-xs text-zinc-600 dark:text-zinc-400 mt-0.5">
                    <VersionDisplay />
                  </span>
                </div>
              <div className="pt-2 space-y-2">
                <a href="https://github.com/neoauroraproject/hmpanel" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400 hover:text-blue-500 transition-colors">
                  <ExternalLink size={14} /> {t("nav.officialGithub")}
                </a>
                <a href="https://t.me/hmpanel" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400 hover:text-blue-500 transition-colors">
                  <ExternalLink size={14} /> {t("settings.telegramChannel")}
                </a>
              </div>
              <UpdateCard />
            </div>
          </Card>
        </div>
      )}

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
    store?: number;
    brand?: number;
    domain?: number;
  };
  components?: string[];
  warnings: string[];
}

function BackupRestoreCard() {
  const t = useT();
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
      
      toast(t("settings.backupGenerated"));
    } catch (e) {
      toast(t("settings.backupFailed"), "error");
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
    } catch (err: any) {
      const status = err?.response?.status;
      const serverMsg = err?.response?.data?.message;
      const msg =
        status === 413
          ? t("settings.analyzeTooLarge")
          : (typeof serverMsg === "string" && serverMsg) ||
            (Array.isArray(serverMsg) ? serverMsg.join(", ") : null) ||
            t("settings.analyzeFailed");
      toast(typeof msg === "string" ? msg : t("settings.analyzeFailed"), "error");
    } finally {
      setIsRestoring(false);
      e.target.value = "";
    }
  };

  const confirmRestore = async () => {
    if (!restoreAnalysis) return;
    setIsRestoring(true);
    try {
      const analysis = restoreAnalysis as { id: string; fileName: string };
      await api.post(`/backups/restore-apply`, {
        id: analysis.id,
        fileName: analysis.fileName,
      });
      toast(t("settings.restoreInitiated"));
      // Restore stops panel, reloads DB, then restarts — give it enough time
      setTimeout(() => window.location.reload(), 120000);
    } catch (err) {
      toast(t("settings.restoreFailed"), "error");
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
          <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100">{t("settings.backupRestoreTitle")}</h3>
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{t("settings.backupRestoreHint")}</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-4">
        <div className="flex-1 flex flex-col gap-2 p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
          <label className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{t("settings.backupType")}</label>
          <select 
            value={backupType}
            onChange={e => setBackupType(e.target.value)}
            className="w-full bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg px-3 py-2 text-sm text-zinc-900 dark:text-white"
            disabled={isBackingUp || isRestoring}
          >
            <option value="full">{t("settings.backupTypeFull")}</option>
            <option value="database">{t("settings.backupTypeDatabase")}</option>
            <option value="config">{t("settings.backupTypeConfig")}</option>
          </select>
          <button
            onClick={handleBackup}
            disabled={isBackingUp || isRestoring}
            className="mt-2 w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-500 disabled:opacity-50 transition-colors"
          >
            {isBackingUp ? <Spinner className="w-4 h-4" /> : <Download size={16} />}
            {t("settings.downloadBackup")}
          </button>
        </div>

        <div className="flex-1 flex flex-col justify-end gap-2 p-4 rounded-xl border border-amber-500/20 bg-amber-500/5">
          <p className="text-xs text-zinc-500 dark:text-zinc-400 mb-2">
            {t("settings.restoreUploadHint")}
          </p>
          <label className="w-full flex items-center justify-center gap-2 rounded-lg border-2 border-dashed border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm font-medium text-amber-600 hover:bg-amber-500/20 cursor-pointer disabled:opacity-50 transition-colors">
            {isRestoring && !restoreAnalysis ? <Spinner className="w-5 h-5 text-amber-500" /> : <Upload size={18} />}
            {t("settings.uploadArchive")}
            <input type="file" accept=".sql,.gz,.tar.gz,.tgz,.db,.dump" className="hidden" onChange={handleRestoreUpload} disabled={isRestoring || isBackingUp} />
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
            <h3 className="text-xl font-bold text-zinc-900 dark:text-white mb-2">{t("settings.confirmRestoreTitle")}</h3>
            <p className="text-sm text-zinc-500 mb-6">
              {t("settings.confirmRestoreHint")}
            </p>

            <div className="bg-zinc-50 dark:bg-zinc-950 rounded-xl p-4 mb-6 space-y-3">
              <div className="flex justify-between items-center pb-2 border-b border-zinc-200 dark:border-zinc-800/50">
                <span className="text-zinc-500">{t("settings.fileLabel")}</span>
                <span className="font-mono text-xs text-zinc-800 dark:text-zinc-200">{restoreAnalysis.fileName}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-zinc-200 dark:border-zinc-800/50">
                <span className="text-zinc-500">{t("settings.typeLabel")}</span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200 uppercase">{restoreAnalysis.type}</span>
              </div>
              {!restoreAnalysis.isLegacy && (
                <>
                  <div className="flex justify-between items-center pb-2 border-b border-zinc-200 dark:border-zinc-800/50">
                    <span className="text-zinc-500">{t("settings.appVersionLabel")}</span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">{restoreAnalysis.version}</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-zinc-200 dark:border-zinc-800/50">
                    <span className="text-zinc-500">{t("settings.timestampLabel")}</span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">{new Date(restoreAnalysis.uploadDate).toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b border-zinc-200 dark:border-zinc-800/50">
                    <span className="text-zinc-500">{t("settings.domainLabel")}</span>
                    <span className="font-semibold text-zinc-800 dark:text-zinc-200">{restoreAnalysis.domain}</span>
                  </div>
                </>
              )}
              {restoreAnalysis.counts && (
                <div className="flex justify-between items-center pb-2 border-b border-zinc-200 dark:border-zinc-800/50">
                  <span className="text-zinc-500">{t("settings.contentsLabel")}</span>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200 text-xs text-end">
                    {t("settings.contentsSummary", { admin: restoreAnalysis.counts.admin, panel: restoreAnalysis.counts.panel, inbound: restoreAnalysis.counts.inbound })}
                    {(restoreAnalysis.counts.store || restoreAnalysis.counts.brand || restoreAnalysis.counts.domain) ? (
                      <span className="block mt-1 opacity-80">
                        Store {restoreAnalysis.counts.store ?? 0} · Brand {restoreAnalysis.counts.brand ?? 0} · Domain {restoreAnalysis.counts.domain ?? 0}
                      </span>
                    ) : null}
                  </span>
                </div>
              )}
              {Array.isArray(restoreAnalysis.components) && restoreAnalysis.components.length > 0 ? (
                <div className="flex justify-between items-center pb-2 border-b border-zinc-200 dark:border-zinc-800/50">
                  <span className="text-zinc-500">Components</span>
                  <span className="font-semibold text-zinc-800 dark:text-zinc-200 text-xs text-end max-w-[60%]">
                    {restoreAnalysis.components.join(", ")}
                  </span>
                </div>
              ) : null}
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">{t("settings.sizeLabel")}</span>
                <span className="font-semibold text-zinc-800 dark:text-zinc-200">{(restoreAnalysis.sizeBytes / 1024 / 1024).toFixed(2)} MB</span>
              </div>
            </div>

            {restoreAnalysis.warnings?.length > 0 && (
              <div className="mb-6 p-3 rounded-lg bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20">
                <p className="text-xs font-semibold text-amber-800 dark:text-amber-400 mb-1">{t("settings.warningsLabel")}</p>
                <ul className="list-disc ps-4 text-xs text-amber-700 dark:text-amber-500">
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
                {t("common.cancel")}
              </button>
              <button
                onClick={confirmRestore}
                className="flex-1 rounded-xl bg-red-600 px-4 py-2.5 font-medium text-white hover:bg-red-500 transition-colors shadow-lg shadow-red-600/20 flex justify-center items-center gap-2"
                disabled={isRestoring}
              >
                {isRestoring ? <Spinner className="w-5 h-5" /> : t("settings.confirmAndApply")}
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
  const t = useT();
  const { data: updateInfo } = useQuery({
    queryKey: ['check-update'],
    queryFn: async () => (await api.get("/settings/check-update")).data,
    refetchInterval: 1000 * 60 * 60,
  });
  return <>{updateInfo?.currentVersion || t("common.loading")}</>;
}

function UpdateCard() {
  const t = useT();
  const toast = useToast((s) => s.push);
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateLogs, setUpdateLogs] = useState<string>('');
  const [updateCompleted, setUpdateCompleted] = useState(false);
  const [updateFailed, setUpdateFailed] = useState(false);

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
        setUpdateFailed(res.data.failed === true || res.data.updateSuccess === false);
      }
    } catch (e) {
      // Panel is likely offline and restarting!
      setUpdateLogs((prev) => prev + '\n[' + t("settings.waitingForRestart") + ']');
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
      toast(data.message || t("settings.updateStarted"), 'success');
      setIsUpdating(true);
      setUpdateCompleted(false);
      setUpdateFailed(false);
    },
    onError: (e: Error & { response?: { data?: { message?: string } } }) => {
      toast(e.response?.data?.message || t("settings.updateInitiateFailed"), "error");
    },
  });

  const handleUpdate = () => {
    if (window.confirm(t("settings.confirmUpdate"))) {
      updatePanel.mutate();
    }
  };

  if (isLoading || !updateInfo) return null;

  if (isUpdating) {
    return (
      <div className="mt-4 pt-4 border-t border-zinc-200 dark:border-zinc-800/60">
        {updateCompleted ? (
          <>
            <p className={`text-sm font-semibold mb-2 ${updateFailed ? "text-red-600 dark:text-red-400" : "text-emerald-600 dark:text-emerald-400"}`}>
              {updateFailed ? `✘ ${t("settings.updateFailedHealth")}` : `✔ ${t("settings.updateComplete")}`}
            </p>
            {updateFailed && (
              <p className="text-xs text-zinc-500 mb-2">{t("settings.updateFailedHint")}</p>
            )}
            <pre className="text-[10px] sm:text-xs bg-zinc-900 text-green-400 p-3 rounded-lg overflow-x-auto max-h-48 whitespace-pre-wrap font-mono mb-3">
              {updateLogs}
            </pre>
            <button
              onClick={() => window.location.reload()}
              className={`w-full py-2 text-white text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 ${
                updateFailed
                  ? "bg-zinc-600 hover:bg-zinc-500"
                  : "bg-emerald-500 hover:bg-emerald-600"
              }`}
            >
              <RefreshCw size={14} /> {t("settings.reloadPanel")}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm font-semibold text-blue-600 dark:text-blue-400 mb-2">{t("settings.updateInProgress")}</p>
            <pre className="text-[10px] sm:text-xs bg-zinc-900 text-green-400 p-3 rounded-lg overflow-x-auto max-h-48 whitespace-pre-wrap font-mono">
              {updateLogs || t("settings.initializingUpdater")}
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
              <p className="text-sm font-semibold text-amber-800 dark:text-amber-500">{t("settings.updateAvailable")}</p>
              <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
                {t("settings.updateVersionInfo", { latest: updateInfo.latestVersion, current: updateInfo.currentVersion })}
              </p>
            </div>
            {updateInfo.canAutoUpdate ? (
              <button
                onClick={handleUpdate}
                disabled={updatePanel.isPending}
                className="mt-1 flex items-center justify-center gap-2 w-full py-2 bg-amber-500 hover:bg-amber-600 text-white text-sm font-medium rounded transition-colors disabled:opacity-50"
              >
                {updatePanel.isPending ? <Spinner className="w-4 h-4 text-white" /> : <RefreshCw size={14} />}
                {updatePanel.isPending ? t("settings.preparingUpdate") : t("settings.updateNow")}
              </button>
            ) : (
              <div className="mt-2 text-xs text-amber-800 dark:text-amber-500 bg-amber-100 dark:bg-amber-900/30 p-2 rounded">
                <strong>{t("settings.autoUpdateDisabled")}</strong><br/>
                {t("settings.autoUpdateDisabledHint")}
                <code className="block mt-1 bg-black/10 dark:bg-black/30 p-1.5 rounded text-amber-900 dark:text-amber-400 font-mono">hm</code>
                {t("settings.autoUpdateDisabledStep")}
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
        <Shield size={14} /> {t("settings.upToDate")}
      </p>
    </div>
  );
}
