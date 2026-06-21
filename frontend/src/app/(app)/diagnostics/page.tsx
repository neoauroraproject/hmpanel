"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader, Card, Spinner, ErrorBox, Badge } from "@/components/ui";
import { Server, HardDrive, Cpu, ShieldAlert, CheckCircle2, XCircle, Info, Lock, Activity } from "lucide-react";
import { motion } from "framer-motion";

export default function DiagnosticsPage() {
  const { data: diag, isLoading, error } = useQuery({
    queryKey: ["system-diagnostics"],
    queryFn: async () => (await api.get("/settings/diagnostics")).data,
    refetchInterval: 15000,
  });

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message="Failed to fetch system diagnostics." />;
  if (!diag) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <PageHeader
        title="System Diagnostics"
        subtitle="Read-only hardware, docker, and installation telemetry."
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        {/* Version Information */}
        <Card className="p-0 overflow-hidden bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="bg-indigo-500/10 px-5 py-4 border-b border-indigo-500/20 flex items-center gap-2">
            <Info className="text-indigo-500" size={18} />
            <h3 className="font-bold text-zinc-800 dark:text-zinc-100">Version Information</h3>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                <td className="px-5 py-3 text-zinc-500">Installed Version</td>
                <td className="px-5 py-3 font-semibold text-zinc-800 dark:text-zinc-200">{diag.version.currentVersion}</td>
              </tr>
              <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                <td className="px-5 py-3 text-zinc-500">Running Image Tag</td>
                <td className="px-5 py-3 font-semibold text-zinc-800 dark:text-zinc-200">{diag.container.tag}</td>
              </tr>
              <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                <td className="px-5 py-3 text-zinc-500">Latest Release</td>
                <td className="px-5 py-3 font-semibold text-zinc-800 dark:text-zinc-200">{diag.version.latestVersion}</td>
              </tr>
            </tbody>
          </table>
        </Card>

        {/* Host Information */}
        <Card className="p-0 overflow-hidden bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm">
          <div className="bg-emerald-500/10 px-5 py-4 border-b border-emerald-500/20 flex items-center gap-2">
            <Server className="text-emerald-500" size={18} />
            <h3 className="font-bold text-zinc-800 dark:text-zinc-100">Host Information</h3>
          </div>
          <table className="w-full text-sm">
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                <td className="px-5 py-3 text-zinc-500">OS</td>
                <td className="px-5 py-3 font-semibold text-zinc-800 dark:text-zinc-200">{diag.host.os}</td>
              </tr>
              <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                <td className="px-5 py-3 text-zinc-500">Architecture</td>
                <td className="px-5 py-3 font-semibold text-zinc-800 dark:text-zinc-200">{diag.host.arch}</td>
              </tr>
              <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                <td className="px-5 py-3 text-zinc-500">CPU</td>
                <td className="px-5 py-3 font-semibold text-zinc-800 dark:text-zinc-200 max-w-[200px] truncate" title={diag.host.cpu}>{diag.host.cpu}</td>
              </tr>
              <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                <td className="px-5 py-3 text-zinc-500">Memory (Free / Total)</td>
                <td className="px-5 py-3 font-semibold text-zinc-800 dark:text-zinc-200">{diag.host.freeRam} / {diag.host.ram}</td>
              </tr>
            </tbody>
          </table>
        </Card>

        {/* Docker & Container Info */}
        <Card className="p-0 overflow-hidden bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm lg:col-span-2">
          <div className="bg-blue-500/10 px-5 py-4 border-b border-blue-500/20 flex items-center gap-2">
            <HardDrive className="text-blue-500" size={18} />
            <h3 className="font-bold text-zinc-800 dark:text-zinc-100">Docker & Environment</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <td className="px-5 py-3 text-zinc-500">Docker Engine</td>
                  <td className="px-5 py-3 font-semibold text-zinc-800 dark:text-zinc-200">{diag.docker.version}</td>
                </tr>
                <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <td className="px-5 py-3 text-zinc-500">Docker Compose</td>
                  <td className="px-5 py-3 font-semibold text-zinc-800 dark:text-zinc-200">{diag.docker.composeVersion}</td>
                </tr>
                <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <td className="px-5 py-3 text-zinc-500">Socket Access</td>
                  <td className="px-5 py-3">
                    {diag.docker.socketAccess ? <Badge tone="green">Available</Badge> : <Badge tone="amber">Not Mounted</Badge>}
                  </td>
                </tr>
              </tbody>
            </table>
            <table className="w-full text-sm border-t md:border-t-0 md:border-l border-zinc-200 dark:border-zinc-800">
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <td className="px-5 py-3 text-zinc-500">Container ID</td>
                  <td className="px-5 py-3 font-mono text-xs text-zinc-800 dark:text-zinc-200">{diag.container.id}</td>
                </tr>
                <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <td className="px-5 py-3 text-zinc-500">Install Path</td>
                  <td className="px-5 py-3 font-mono text-xs text-zinc-800 dark:text-zinc-200 truncate max-w-[200px]" title={diag.installation.path}>{diag.installation.path}</td>
                </tr>
                <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <td className="px-5 py-3 text-zinc-500">Updater Script</td>
                  <td className="px-5 py-3">
                    {diag.installation.updateScript === 'Found' ? <Badge tone="green">Found</Badge> : <Badge tone="amber">Not Mounted</Badge>}
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
            <h3 className="font-bold text-zinc-800 dark:text-zinc-100">Services & Security</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2">
            <table className="w-full text-sm">
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <td className="px-5 py-3 text-zinc-500">PostgreSQL</td>
                  <td className="px-5 py-3">{diag.services.postgres === 'Online' ? <Badge tone="green">Online</Badge> : <Badge tone="red">Offline</Badge>}</td>
                </tr>
                <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <td className="px-5 py-3 text-zinc-500">Redis</td>
                  <td className="px-5 py-3">{diag.services.redis === 'Online' ? <Badge tone="green">Online</Badge> : <Badge tone="red">Offline</Badge>}</td>
                </tr>
                <tr className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                  <td className="px-5 py-3 text-zinc-500">GitHub API</td>
                  <td className="px-5 py-3">{diag.connectivity.github === 'Reachable' ? <Badge tone="green">Reachable</Badge> : <Badge tone="red">Unreachable</Badge>}</td>
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
            <strong className="text-zinc-700 dark:text-zinc-300">Host Management Unavailable</strong>
            <p className="mt-1 opacity-90">
              Advanced host management features, auto-updates, and precise installation tracking are disabled because <code className="bg-zinc-200 dark:bg-zinc-700 px-1 rounded text-zinc-800 dark:text-zinc-200">/var/run/docker.sock</code> is not mounted into the panel container or lacks permissions.
              This is expected in strict security configurations.
            </p>
          </div>
        </div>
      )}

      {/* Capability Matrix */}
      <Card className="mt-6 p-0 overflow-hidden bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-sm">
        <div className="bg-indigo-500/10 px-5 py-4 border-b border-indigo-500/20 flex items-center gap-2">
          <Activity className="text-indigo-500" size={18} />
          <h3 className="font-bold text-zinc-800 dark:text-zinc-100">Capability Matrix</h3>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
          <div className="flex flex-col gap-1 p-3 rounded bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
            <span className="text-xs text-zinc-500">SSL Detection</span>
            <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><Badge tone="green">Available</Badge></span>
          </div>
          <div className="flex flex-col gap-1 p-3 rounded bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
            <span className="text-xs text-zinc-500">Certificate Analysis</span>
            <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1"><Badge tone="green">Available</Badge></span>
          </div>
          <div className="flex flex-col gap-1 p-3 rounded bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
            <span className="text-xs text-zinc-500">Host Diagnostics</span>
            <span className="text-sm font-semibold">
              {diag.docker.socketAccess ? <Badge tone="green">Available</Badge> : <Badge tone="red">Unavailable</Badge>}
            </span>
          </div>
          <div className="flex flex-col gap-1 p-3 rounded bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-100 dark:border-zinc-800">
            <span className="text-xs text-zinc-500">Auto Update</span>
            <span className="text-sm font-semibold">
              {diag.docker.socketAccess ? <Badge tone="green">Available</Badge> : <Badge tone="red">Unavailable</Badge>}
            </span>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
