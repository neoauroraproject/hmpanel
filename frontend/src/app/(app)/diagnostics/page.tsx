"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader, Card, Spinner, ErrorBox, Badge } from "@/components/ui";
import { Server, HardDrive, Cpu, CheckCircle2, XCircle, Info, Lock, Activity } from "lucide-react";
import { motion } from "framer-motion";
import { useT } from "@/i18n";

export default function DiagnosticsPage() {
  const t = useT();
  const { data: diag, isLoading, error } = useQuery({
    queryKey: ["system-diagnostics"],
    queryFn: async () => (await api.get("/settings/diagnostics")).data,
    refetchInterval: 15000,
  });

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message={t("diagnostics.loadFailed")} />;
  if (!diag) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <PageHeader
        title={t("diagnostics.title")}
        subtitle={t("diagnostics.subtitle")}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Version Information */}
        <Card className="p-0 overflow-hidden bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="bg-indigo-500/10 px-5 py-4 border-b border-indigo-500/20 flex items-center gap-2">
            <Info className="text-indigo-500" size={18} />
            <h3 className="font-bold text-zinc-800 dark:text-zinc-100">{t("diagnostics.versionInfo")}</h3>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                <td className="px-5 py-3 text-zinc-500">{t("diagnostics.installedVersion")}</td>
                <td className="px-5 py-3 font-semibold text-zinc-800 dark:text-zinc-200">{diag.version.currentVersion}</td>
              </tr>
              <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                <td className="px-5 py-3 text-zinc-500">{t("diagnostics.runningImageTag")}</td>
                <td className="px-5 py-3 font-semibold text-zinc-800 dark:text-zinc-200">{diag.container.tag}</td>
              </tr>
              <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                <td className="px-5 py-3 text-zinc-500">{t("diagnostics.latestRelease")}</td>
                <td className="px-5 py-3 font-semibold text-zinc-800 dark:text-zinc-200">{diag.version.latestVersion}</td>
              </tr>
            </tbody>
          </table>
        </Card>

        {/* Host Information */}
        <Card className="p-0 overflow-hidden bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="bg-emerald-500/10 px-5 py-4 border-b border-emerald-500/20 flex items-center gap-2">
            <Server className="text-emerald-500" size={18} />
            <h3 className="font-bold text-zinc-800 dark:text-zinc-100">{t("diagnostics.hostInfo")}</h3>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                <td className="px-5 py-3 text-zinc-500">{t("diagnostics.os")}</td>
                <td className="px-5 py-3 font-semibold text-zinc-800 dark:text-zinc-200">{diag.host.os}</td>
              </tr>
              <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                <td className="px-5 py-3 text-zinc-500">{t("diagnostics.architecture")}</td>
                <td className="px-5 py-3 font-semibold text-zinc-800 dark:text-zinc-200">{diag.host.arch}</td>
              </tr>
              <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                <td className="px-5 py-3 text-zinc-500">{t("diagnostics.cpu")}</td>
                <td className="px-5 py-3 font-semibold text-zinc-800 dark:text-zinc-200 max-w-[200px] truncate" title={diag.host.cpu}>{diag.host.cpu}</td>
              </tr>
              <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                <td className="px-5 py-3 text-zinc-500">{t("diagnostics.memory")}</td>
                <td className="px-5 py-3 font-semibold text-zinc-800 dark:text-zinc-200">{diag.host.freeRam} / {diag.host.ram}</td>
              </tr>
            </tbody>
          </table>
        </Card>

        {/* Docker & Container Info */}
        <Card className="p-0 overflow-hidden bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm lg:col-span-2">
          <div className="bg-blue-500/10 px-5 py-4 border-b border-blue-500/20 flex items-center gap-2">
            <HardDrive className="text-blue-500" size={18} />
            <h3 className="font-bold text-zinc-800 dark:text-zinc-100">{t("diagnostics.dockerEnv")}</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <td className="px-5 py-3 text-zinc-500">{t("diagnostics.dockerEngine")}</td>
                  <td className="px-5 py-3 font-semibold text-zinc-800 dark:text-zinc-200">{diag.docker.version}</td>
                </tr>
                <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <td className="px-5 py-3 text-zinc-500">{t("diagnostics.dockerCompose")}</td>
                  <td className="px-5 py-3 font-semibold text-zinc-800 dark:text-zinc-200">{diag.docker.composeVersion}</td>
                </tr>
                <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <td className="px-5 py-3 text-zinc-500">{t("diagnostics.socketAccess")}</td>
                  <td className="px-5 py-3">
                    {diag.docker.socketAccess ? <Badge tone="green">{t("common.available")}</Badge> : <Badge tone="amber">{t("common.notMounted")}</Badge>}
                  </td>
                </tr>
              </tbody>
            </table>
            <table className="w-full text-sm border-t md:border-t-0 md:border-l border-zinc-200 dark:border-zinc-800">
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <td className="px-5 py-3 text-zinc-500">{t("diagnostics.containerId")}</td>
                  <td className="px-5 py-3 font-mono text-xs text-zinc-800 dark:text-zinc-200">{diag.container.id}</td>
                </tr>
                <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <td className="px-5 py-3 text-zinc-500">{t("diagnostics.installPath")}</td>
                  <td className="px-5 py-3 font-mono text-xs text-zinc-800 dark:text-zinc-200 truncate max-w-[200px]" title={diag.installation.path}>{diag.installation.path}</td>
                </tr>
                <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <td className="px-5 py-3 text-zinc-500">{t("diagnostics.updaterScript")}</td>
                  <td className="px-5 py-3">
                    <Badge tone="green">{diag.installation.updateScript}</Badge>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>

        {/* Services & Connectivity */}
        <Card className="p-0 overflow-hidden bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm lg:col-span-2">
          <div className="bg-amber-500/10 px-5 py-4 border-b border-amber-500/20 flex items-center gap-2">
            <Cpu className="text-amber-500" size={18} />
            <h3 className="font-bold text-zinc-800 dark:text-zinc-100">{t("diagnostics.servicesSecurity")}</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <td className="px-5 py-3 text-zinc-500">{t("diagnostics.postgres")}</td>
                  <td className="px-5 py-3">{diag.services.postgres === 'Online' ? <Badge tone="green">{t("common.online")}</Badge> : <Badge tone="red">{t("common.offline")}</Badge>}</td>
                </tr>
                <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <td className="px-5 py-3 text-zinc-500">{t("diagnostics.redis")}</td>
                  <td className="px-5 py-3">{diag.services.redis === 'Online' ? <Badge tone="green">{t("common.online")}</Badge> : <Badge tone="red">{t("common.offline")}</Badge>}</td>
                </tr>
                <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <td className="px-5 py-3 text-zinc-500">{t("diagnostics.githubApi")}</td>
                  <td className="px-5 py-3">{diag.connectivity.github === 'Reachable' ? <Badge tone="green">{t("common.reachable")}</Badge> : <Badge tone="red">{t("common.unreachable")}</Badge>}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {!diag.docker.socketAccess && (
        <div className="mt-4 p-4 rounded-lg bg-zinc-100 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 flex items-start gap-3 text-zinc-600 dark:text-zinc-400">
          <Info className="shrink-0 mt-0.5" size={18} />
          <div className="text-sm">
            <strong className="text-zinc-700 dark:text-zinc-300">{t("diagnostics.hostMgmtTitle")}</strong>
            <p className="mt-1 opacity-90">
              {t("diagnostics.hostMgmtHint")}
            </p>
          </div>
        </div>
      )}

      {/* Capability Matrix */}
      <Card className="mt-6 p-0 overflow-hidden bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div className="bg-indigo-500/10 px-5 py-4 border-b border-indigo-500/20 flex items-center gap-2">
          <Activity className="text-indigo-500" size={18} />
          <h3 className="font-bold text-zinc-800 dark:text-zinc-100">{t("diagnostics.capabilityMatrix")}</h3>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex flex-col gap-1 p-3 rounded bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
            <span className="text-xs text-zinc-500">{t("diagnostics.sslDetection")}</span>
            <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><Badge tone="green">{t("common.available")}</Badge></span>
          </div>
          <div className="flex flex-col gap-1 p-3 rounded bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
            <span className="text-xs text-zinc-500">{t("diagnostics.certAnalysis")}</span>
            <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><Badge tone="green">{t("common.available")}</Badge></span>
          </div>
          <div className="flex flex-col gap-1 p-3 rounded bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
            <span className="text-xs text-zinc-500">{t("diagnostics.hostDiagnostics")}</span>
            <span className="text-sm font-semibold flex items-center gap-1">
              {diag.docker.socketAccess ? <Badge tone="green">{t("common.available")}</Badge> : <Badge tone="amber">{t("common.unavailable")}</Badge>}
            </span>
          </div>
          <div className="flex flex-col gap-1 p-3 rounded bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
            <span className="text-xs text-zinc-500">{t("diagnostics.autoUpdate")}</span>
            <span className="text-sm font-semibold flex items-center gap-1">
              {diag.docker.socketAccess ? <Badge tone="green">{t("common.available")}</Badge> : <Badge tone="amber">{t("common.unavailable")}</Badge>}
            </span>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
