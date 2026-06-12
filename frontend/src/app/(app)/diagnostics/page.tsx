"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { PageHeader, Card, Spinner, ErrorBox, Badge } from "@/components/ui";
import { Database, Server, Clock, Activity, HardDrive, Wifi, Cpu, ShieldAlert, CheckCircle2, XCircle } from "lucide-react";
import { motion } from "framer-motion";
import { formatDate } from "@/lib/format";

interface DiagnosticsData {
  database: { status: "online" | "offline"; latencyMs: number };
  redis: { status: "online" | "offline"; latencyMs: number };
  panels: {
    name: string;
    version: string;
    status: string;
    lastSync: string | null;
    lastLatency: number;
    syncResult: string;
    errorLogs: string | null;
  }[];
  stats: {
    connectedPanels: number;
    importedInbounds: number;
    importedClients: number;
  };
}

export default function DiagnosticsPage() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["diagnostics"],
    queryFn: async () => (await api.get<DiagnosticsData>("/stats/diagnostics")).data,
    refetchInterval: 10000, // Poll every 10 seconds for real-time diagnostics
  });

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message="Failed to fetch real-time system diagnostics." />;

  const diag = data;
  if (!diag) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
      <PageHeader
        title="System Diagnostics"
        subtitle="100% genuine real-time infrastructure telemetry."
      />

      {/* Core Infrastructure Check */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <Card className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
          <div className={`p-4 rounded-xl shrink-0 ${diag.database.status === 'online' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'}`}>
            <Database size={24} />
          </div>
          <div className="flex-1 w-full">
            <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
              PostgreSQL Database
              {diag.database.status === 'online' ? <CheckCircle2 size={16} className="text-emerald-500" /> : <XCircle size={16} className="text-red-500" />}
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Primary transactional datastore</p>
          </div>
          <div className="text-left sm:text-right w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-t-0 border-zinc-200 dark:border-zinc-800 mt-2 sm:mt-0">
            <div className="text-2xl font-black text-zinc-800 dark:text-zinc-100">{diag.database.latencyMs} <span className="text-sm font-medium text-zinc-500">ms</span></div>
            <div className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mt-1">Raw Ping</div>
          </div>
        </Card>

        <Card className="flex flex-col sm:flex-row items-start sm:items-center gap-4 bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800">
          <div className={`p-4 rounded-xl shrink-0 ${diag.redis.status === 'online' ? 'bg-rose-500/10 text-rose-400' : 'bg-zinc-500/10 text-zinc-500 dark:text-zinc-400'}`}>
            <Server size={24} />
          </div>
          <div className="flex-1 w-full">
            <h3 className="text-lg font-bold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
              Redis Broker
              {diag.redis.status === 'online' ? <CheckCircle2 size={16} className="text-rose-500" /> : <ShieldAlert size={16} className="text-zinc-500" />}
            </h3>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Background job orchestrator</p>
          </div>
          <div className="text-left sm:text-right w-full sm:w-auto pt-3 sm:pt-0 border-t sm:border-t-0 border-zinc-200 dark:border-zinc-800 mt-2 sm:mt-0">
            {diag.redis.status === 'online' ? (
              <>
                <div className="text-2xl font-black text-zinc-800 dark:text-zinc-100">{diag.redis.latencyMs} <span className="text-sm font-medium text-zinc-500">ms</span></div>
                <div className="text-xs font-semibold text-zinc-500 uppercase tracking-widest mt-1">TCP Ping</div>
              </>
            ) : (
              <div className="text-sm font-semibold text-zinc-500">Not Configured</div>
            )}
          </div>
        </Card>
      </div>

      {/* Database Record Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 py-6">
          <div className="text-sm font-semibold text-blue-400 uppercase tracking-widest mb-2 flex items-center gap-2"><Wifi size={16} /> Connected Panels</div>
          <div className="text-4xl font-black text-zinc-800 dark:text-zinc-100">{diag.stats.connectedPanels}</div>
          <div className="text-xs text-zinc-500 mt-2 font-medium">Nodes actively synced to the database.</div>
        </Card>
        <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 py-6">
          <div className="text-sm font-semibold text-purple-400 uppercase tracking-widest mb-2 flex items-center gap-2"><HardDrive size={16} /> Imported Inbounds</div>
          <div className="text-4xl font-black text-zinc-800 dark:text-zinc-100">{diag.stats.importedInbounds}</div>
          <div className="text-xs text-zinc-500 mt-2 font-medium">Distinct listening ports written to DB.</div>
        </Card>
        <Card className="bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 py-6">
          <div className="text-sm font-semibold text-amber-400 uppercase tracking-widest mb-2 flex items-center gap-2"><Activity size={16} /> Imported Clients</div>
          <div className="text-4xl font-black text-zinc-800 dark:text-zinc-100">{diag.stats.importedClients}</div>
          <div className="text-xs text-zinc-500 mt-2 font-medium">Unique v2ray clients synchronized.</div>
        </Card>
      </div>

      {/* Detailed Panel Telemetry */}
      <h3 className="text-xl font-bold text-zinc-800 dark:text-zinc-100 mb-4 flex items-center gap-2 mt-8">
        <Cpu size={20} className="text-emerald-500" />
        Xray Panel Telemetry
      </h3>
      <Card className="p-0 overflow-x-auto bg-white dark:bg-zinc-900 border-zinc-200 dark:border-zinc-800 shadow-xl">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 text-left text-xs uppercase tracking-widest text-zinc-500">
              <th className="px-5 py-4 font-semibold">Panel</th>
              <th className="px-5 py-4 font-semibold">Version</th>
              <th className="px-5 py-4 font-semibold">Status</th>
              <th className="px-5 py-4 font-semibold">Last API Sync</th>
              <th className="px-5 py-4 font-semibold">API Latency</th>
              <th className="px-5 py-4 font-semibold">Sync Result</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-800/50">
            {diag.panels.map((p, i) => (
              <motion.tr 
                key={p.name + i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: i * 0.05 }}
                className="hover:bg-zinc-100 dark:bg-zinc-800/30 transition-colors"
              >
                <td className="px-5 py-4 font-semibold text-zinc-800 dark:text-zinc-100">{p.name}</td>
                <td className="px-5 py-4 text-zinc-500 dark:text-zinc-400">{p.version}</td>
                <td className="px-5 py-4">
                  <Badge tone={p.status === 'online' ? 'green' : 'red'}>{p.status}</Badge>
                </td>
                <td className="px-5 py-4 text-zinc-500 dark:text-zinc-400 whitespace-nowrap flex items-center gap-2">
                  <Clock size={14} className="text-zinc-600" />
                  {p.lastSync ? formatDate(p.lastSync) : 'Never'}
                </td>
                <td className="px-5 py-4 font-mono text-zinc-600 dark:text-zinc-300">
                  {p.lastLatency > 0 ? `${p.lastLatency}ms` : '—'}
                </td>
                <td className="px-5 py-4">
                  <div className="flex flex-col">
                    <span className={`font-medium ${p.syncResult === 'success' ? 'text-emerald-400' : p.syncResult === 'failure' ? 'text-red-400' : 'text-zinc-500'}`}>
                      {p.syncResult.toUpperCase()}
                    </span>
                    {p.errorLogs && <span className="text-xs text-red-500/80 mt-1 max-w-[200px] truncate" title={p.errorLogs}>{p.errorLogs}</span>}
                  </div>
                </td>
              </motion.tr>
            ))}
            {diag.panels.length === 0 && (
              <tr>
                <td colSpan={6} className="px-5 py-12 text-center text-zinc-500 font-medium">No panels registered in the database.</td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      {/* Developer Debug Console */}
      <h3 className="text-xl font-bold text-zinc-800 dark:text-zinc-100 mb-4 flex items-center gap-2 mt-8">
        <Activity size={20} className="text-blue-500" />
        Developer Debug Console
      </h3>
      <Card className="bg-black border-zinc-200 dark:border-zinc-800 p-0 overflow-hidden relative group">
        <div className="absolute top-0 left-0 right-0 h-8 bg-white dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 flex items-center px-4 gap-2">
          <div className="w-3 h-3 rounded-full bg-red-500/80"></div>
          <div className="w-3 h-3 rounded-full bg-amber-500/80"></div>
          <div className="w-3 h-3 rounded-full bg-emerald-500/80"></div>
          <span className="text-[10px] font-mono text-zinc-500 ml-2">/var/log/syslog</span>
        </div>
        <div className="p-4 pt-10 h-64 overflow-y-auto font-mono text-xs text-zinc-500 dark:text-zinc-400">
          {diag.panels.map((p, i) => (
            <div key={i} className="mb-2">
              <span className="text-emerald-500">[{formatDate(p.lastSync || new Date().toISOString())}]</span> 
              <span className="text-blue-400"> [Panel:{p.name}]</span> 
              <span className="text-zinc-500"> Ping: {p.lastLatency}ms</span>
              <br />
              <span className={p.syncResult === 'success' ? 'text-zinc-600 dark:text-zinc-300' : 'text-red-400'}>
                &gt; {p.errorLogs ? p.errorLogs : `Sync completed successfully with status ${p.syncResult}.`}
              </span>
            </div>
          ))}
          {diag.panels.length === 0 && <div className="text-zinc-600">No telemetry data streaming...</div>}
        </div>
      </Card>
    </motion.div>
  );
}
