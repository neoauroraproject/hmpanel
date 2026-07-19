"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader, Card, Spinner } from "@/components/ui";
import { Import, CheckCircle2, AlertCircle, Database, Server, Users, Activity } from "lucide-react";
import { motion } from "framer-motion";
import { useT } from "@/i18n";

export default function MigrationPage() {
  const t = useT();
  const [step, setStep] = useState<number>(1);
  const [file, setFile] = useState<File | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // States for preview & reports
  const [previewData, setPreviewData] = useState<any>(null);
  const [importReport, setImportReport] = useState<any>(null);
  const [syncReport, setSyncReport] = useState<any>(null);
  const [createGroups, setCreateGroups] = useState(true);

  // Mutations
  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error(t("migration.selectFileError"));
      const formData = new FormData();
      formData.append("file", file);
      return (await api.post("/migration/upload", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })).data;
    },
    onSuccess: () => {
      setErrorMsg(null);
      setStep(2);
    },
    onError: (e: any) => setErrorMsg(e.response?.data?.message || e.message),
  });

  const preview = useMutation({
    mutationFn: async () => (await api.post("/migration/preview")).data,
    onSuccess: (data) => {
      setPreviewData(data);
      setStep(3);
    },
    onError: (e: any) => setErrorMsg(e.response?.data?.message || e.message),
  });

  const runImport = useMutation({
    mutationFn: async () => (await api.post("/migration/import")).data,
    onSuccess: (data) => {
      setImportReport(data);
      setStep(4);
    },
    onError: (e: any) => setErrorMsg(e.response?.data?.message || e.message),
  });

  const runSync = useMutation({
    mutationFn: async () => (await api.post("/migration/sync", { createGroups })).data,
    onSuccess: (data) => {
      setSyncReport(data);
      setStep(5);
    },
    onError: (e: any) => setErrorMsg(e.response?.data?.message || e.message),
  });

  const nextAction = () => {
    setErrorMsg(null);
    if (step === 1) upload.mutate();
    if (step === 2) preview.mutate();
    if (step === 3) runImport.mutate();
    if (step === 4) runSync.mutate();
  };

  const getStepStatus = (current: number) => {
    if (step > current) return "completed";
    if (step === current) return "active";
    return "pending";
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <PageHeader
        title={t("migration.title")}
        subtitle={t("migration.subtitle")}
      />

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Wizard Progress Sidebar */}
        <div className="lg:col-span-1 space-y-2">
          {[
            { num: 1, label: t("migration.stepUpload") },
            { num: 2, label: t("migration.stepValidate") },
            { num: 3, label: t("migration.stepPreview") },
            { num: 4, label: t("migration.stepImport") },
            { num: 5, label: t("migration.stepSync") },
          ].map((s) => {
            const status = getStepStatus(s.num);
            return (
              <div
                key={s.num}
                className={`flex items-center gap-3 p-3 rounded-xl border ${
                  status === "active"
                    ? "bg-blue-600/10 border-blue-500/50 text-blue-400"
                    : status === "completed"
                    ? "bg-emerald-600/10 border-emerald-500/50 text-emerald-400"
                    : "bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 text-zinc-500"
                }`}
              >
                {status === "completed" ? (
                  <CheckCircle2 size={18} />
                ) : (
                  <div className={`w-5 h-5 flex items-center justify-center rounded-full text-xs font-bold ${status === 'active' ? 'bg-blue-500 text-white' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400'}`}>
                    {s.num}
                  </div>
                )}
                <span className="font-semibold text-sm">{s.label}</span>
              </div>
            );
          })}
        </div>

        {/* Wizard Content */}
        <div className="lg:col-span-3">
          <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 p-6 min-h-[400px] flex flex-col">
            
            {errorMsg && (
              <div className="mb-6 p-4 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 flex items-start gap-3 text-sm">
                <AlertCircle size={18} className="mt-0.5 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            {step === 1 && (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <Database size={48} className="text-zinc-600 mb-4" />
                <h3 className="text-xl font-bold text-zinc-800 dark:text-zinc-100 mb-2">{t("migration.selectLegacyTitle")}</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 mb-6 max-w-md">
                  {t("migration.selectLegacyHint")}
                </p>
                <label className="cursor-pointer bg-zinc-50 dark:bg-zinc-950 border-2 border-dashed border-zinc-300 dark:border-zinc-700 hover:border-blue-500 transition-colors rounded-xl px-12 py-8 flex flex-col items-center justify-center group w-full max-w-md">
                  <Import size={24} className="text-zinc-500 group-hover:text-blue-500 mb-2 transition-colors" />
                  <span className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
                    {file ? file.name : t("migration.selectDbFile")}
                  </span>
                  <input
                    type="file"
                    className="hidden"
                    accept=".db,.sqlite,.sqlite3"
                    onChange={(e) => setFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>
            )}

            {step === 2 && (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <Activity size={48} className="text-blue-500 mb-4 animate-pulse" />
                <h3 className="text-xl font-bold text-zinc-800 dark:text-zinc-100 mb-2">{t("migration.validatedTitle")}</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md mb-6">
                  {t("migration.validatedHint")}
                </p>
              </div>
            )}

            {step === 3 && previewData && (
              <div className="flex-1">
                <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100 mb-4 flex items-center gap-2">
                  <Database size={18} className="text-emerald-500" />
                  {t("migration.previewTitle")}
                </h3>
                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                    <div className="text-xs text-zinc-500 uppercase tracking-widest font-semibold mb-1 flex items-center gap-1"><Server size={12}/> {t("migration.panelsFound")}</div>
                    <div className="text-3xl font-black text-zinc-800 dark:text-zinc-100">{previewData.panels}</div>
                  </div>
                  <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                    <div className="text-xs text-zinc-500 uppercase tracking-widest font-semibold mb-1 flex items-center gap-1"><Users size={12}/> {t("migration.adminsFound")}</div>
                    <div className="text-3xl font-black text-zinc-800 dark:text-zinc-100">{previewData.admins}</div>
                  </div>
                  <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800">
                    <div className="text-xs text-zinc-500 uppercase tracking-widest font-semibold mb-1 flex items-center gap-1"><Users size={12}/> {t("migration.clientsToMap")}</div>
                    <div className="text-3xl font-black text-zinc-800 dark:text-zinc-100">{previewData.users}</div>
                  </div>
                </div>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">
                  {t("migration.previewHint")}
                </p>
              </div>
            )}

            {step === 4 && importReport && (
              <div className="flex-1 flex flex-col items-center justify-center text-center">
                <CheckCircle2 size={48} className="text-emerald-500 mb-4" />
                <h3 className="text-xl font-bold text-zinc-800 dark:text-zinc-100 mb-2">{t("migration.importCompleteTitle")}</h3>
                <p className="text-sm text-zinc-500 dark:text-zinc-400 max-w-md mb-6">
                  {t("migration.importCompleteHint", {
                    panels: importReport.importedPanels,
                    admins: importReport.importedAdmins,
                    clients: importReport.legacyClientsToMap,
                  })}
                </p>
                <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400 text-sm max-w-md text-left mb-4">
                  <strong>{t("migration.nextPhaseTitle")}</strong><br/>
                  {t("migration.nextPhaseHint")}
                </div>

                <div className="max-w-md w-full bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg p-4 flex items-center justify-between">
                  <div className="text-left">
                    <div className="font-semibold text-zinc-800 dark:text-zinc-100 text-sm">{t("migration.createGroupsTitle")}</div>
                    <div className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">{t("migration.createGroupsHint")}</div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      className="sr-only peer"
                      checked={createGroups}
                      onChange={(e) => setCreateGroups(e.target.checked)}
                    />
                    <div className="w-11 h-6 bg-zinc-200 peer-focus:outline-none rounded-full peer dark:bg-zinc-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-zinc-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-zinc-600 peer-checked:bg-blue-600"></div>
                  </label>
                </div>
              </div>
            )}

            {step === 5 && syncReport && (
              <div className="flex-1">
                <h3 className="text-xl font-bold text-emerald-400 mb-4 flex items-center gap-2">
                  <CheckCircle2 size={24} />
                  {t("migration.finishedTitle")}
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg">
                    <div className="text-xs text-zinc-500">{t("migration.adminsImported")}</div>
                    <div className="text-2xl font-black text-zinc-800 dark:text-zinc-100">{importReport?.importedAdmins}</div>
                  </div>
                  <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg">
                    <div className="text-xs text-zinc-500">{t("migration.clientsSynced")}</div>
                    <div className="text-2xl font-black text-zinc-800 dark:text-zinc-100">{syncReport.clientsImported}</div>
                  </div>
                  <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg">
                    <div className="text-xs text-emerald-500">{t("migration.groupsCreated")}</div>
                    <div className="text-2xl font-black text-emerald-400">{syncReport.groupsCreated || 0}</div>
                  </div>
                  <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg">
                    <div className="text-xs text-blue-500">{t("migration.clientsGrouped")}</div>
                    <div className="text-2xl font-black text-blue-400">{syncReport.clientsAssignedToGroups || 0}</div>
                  </div>
                  <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg">
                    <div className="text-xs text-emerald-500">{t("migration.clientsMatched")}</div>
                    <div className="text-2xl font-black text-emerald-400">{syncReport.clientsMatched}</div>
                  </div>
                  <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg">
                    <div className="text-xs text-amber-500">{t("migration.missingOrphaned")}</div>
                    <div className="text-2xl font-black text-amber-400">{syncReport.clientsMissing}</div>
                  </div>
                  <div className="p-4 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-lg col-span-2">
                    <div className="text-xs text-red-500">{t("migration.failedAssignments")}</div>
                    <div className="text-2xl font-black text-red-400">{syncReport.failedAssignments || 0}</div>
                  </div>
                </div>

                <div className="h-32 overflow-y-auto bg-black border border-zinc-200 dark:border-zinc-800 p-3 rounded-lg font-mono text-xs">
                  {syncReport.panelReports.map((pr: any, i: number) => (
                    <div key={i} className={pr.success ? "text-emerald-400" : "text-red-400"}>
                      {pr.success
                        ? t("migration.panelReportSuccess", { panel: pr.panelName, count: pr.syncedClients })
                        : t("migration.panelReportError", { panel: pr.panelName, error: pr.error })}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Wizard Footer Controls */}
            {step < 5 && (
              <div className="mt-auto pt-6 border-t border-zinc-200 dark:border-zinc-800 flex justify-end">
                <button
                  onClick={nextAction}
                  disabled={upload.isPending || preview.isPending || runImport.isPending || runSync.isPending || (step === 1 && !file)}
                  className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white px-6 py-2 rounded-lg font-medium text-sm flex items-center gap-2 transition-colors"
                >
                  {(upload.isPending || preview.isPending || runImport.isPending || runSync.isPending) && <Spinner />}
                  {step === 1 ? t("migration.btnUploadValidate") : step === 2 ? t("migration.btnGeneratePreview") : step === 3 ? t("migration.btnExecuteImport") : t("migration.btnRunSync")}
                </button>
              </div>
            )}

            {step === 5 && (
              <div className="mt-auto pt-6 border-t border-zinc-200 dark:border-zinc-800 flex justify-end gap-3">
                <a
                  href={`data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(syncReport, null, 2))}`}
                  download="migration-report.json"
                  className="bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-600 text-zinc-800 dark:text-zinc-100 px-6 py-2 rounded-lg font-medium text-sm transition-colors"
                >
                  {t("migration.downloadReport")}
                </a>
                <button
                  onClick={() => window.location.href = '/dashboard'}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-2 rounded-lg font-medium text-sm transition-colors"
                >
                  {t("migration.goDashboard")}
                </button>
              </div>
            )}

          </Card>
        </div>
      </div>
    </motion.div>
  );
}
