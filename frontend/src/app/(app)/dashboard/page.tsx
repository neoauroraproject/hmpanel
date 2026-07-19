"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
import { EditClientModal } from "../clients/page";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AreaChart, Area, BarChart, Bar,
  PieChart, Pie, Cell, Legend,
  XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
} from "recharts";
import {
  Server, UserCog, Users, HardDrive, CalendarDays, DollarSign,
  Activity, Wifi, Bell, AlertTriangle, DatabaseBackup, ArchiveX
} from "lucide-react";

import type { Overview, SeriesPoint, Trends, Monitoring } from "@/lib/types";
import { formatBytes, formatDateTime } from "@/lib/format";
import { Card, Spinner, ErrorBox, Badge } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useAuth } from "@/store/auth";
import { useT } from "@/i18n";
import { io } from "socket.io-client";

const GB = 1024 ** 3;
const tip = {
  contentStyle: { background: "#18181b", border: "1px solid #3f3f46", borderRadius: 8, color: "#fafafa", fontSize: 12 },
  labelStyle: { color: "#a1a1aa" },
};

function Kpi({
  icon: Icon, tone, label, value, parts,
}: {
  icon: typeof Server; tone: string; label: string; value: React.ReactNode;
  parts?: { label: string; value: React.ReactNode; tone?: string }[];
}) {
  return (
    <Card>
      <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        <Icon size={16} className={tone} /> {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{value}</div>
      {parts && (
        <div className="mt-3 flex gap-4 text-xs">
          {parts.map((p) => (
            <span key={p.label} className={p.tone ?? "text-zinc-500 dark:text-zinc-400"}>
              <span className="font-medium text-zinc-700 dark:text-zinc-200">{p.value}</span> {p.label}
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}

function MetricBar({ label, pct }: { label: string; pct: number }) {
  const color = pct > 85 ? "bg-red-500" : pct > 65 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div>
      <div className="mb-1 flex justify-between text-xs">
        <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
        <span className="text-zinc-600 dark:text-zinc-300">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function AlertsSection({ monData }: { monData: Monitoring | undefined }) {
  const t = useT();
  const offlinePanels = (monData?.xray ?? []).filter((x) => x.status !== "running");
  const failedJobs = monData?.failedJobs ?? 0;
  const hasAlerts = offlinePanels.length > 0 || failedJobs > 0;

  return (
    <Card>
      <div className="flex items-center gap-2">
        <Bell size={18} className={hasAlerts ? "text-red-400 animate-pulse" : "text-zinc-500 dark:text-zinc-400"} />
        <h2 className="font-medium text-zinc-800 dark:text-zinc-100">{t("dashboard.alertsTitle")}</h2>
      </div>
      <div className="mt-4 space-y-3">
        {offlinePanels.map((p) => (
          <div key={p.panel} className="flex items-center justify-between rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-200">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-400" />
              <span>{t("dashboard.panelOffline", { panel: p.panel })}</span>
            </div>
            <Badge tone="red">{t("common.offline")}</Badge>
          </div>
        ))}
        {failedJobs > 0 && (
          <div className="flex items-center justify-between rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-sm text-amber-200">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-400" />
              <span>{t("dashboard.failedSyncJobs", { count: failedJobs })}</span>
            </div>
            <Badge tone="red">{t("dashboard.failedCount", { count: failedJobs })}</Badge>
          </div>
        )}
        {!hasAlerts && (
          <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 p-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            {t("dashboard.allSystemsNormal")}
          </div>
        )}
      </div>
    </Card>
  );
}

export default function DashboardPage() {
  const admin = useAuth((s) => s.admin);
  const isSuper = admin?.role === "SUPER_ADMIN";
  if (!isSuper) return <ResellerDashboard />;
  return <SuperDashboard />;
}

function SuperDashboard() {
  const t = useT();
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);
  const [range, setRange] = useState<"24h" | "7d" | "30d">("24h");
  const [pieRange, setPieRange] = useState<"allTime" | "24h">("allTime");

  const overview = useQuery({ queryKey: ["overview"], queryFn: async () => (await api.get<any>("/stats/overview")).data });
  const series = useQuery({ queryKey: ["series", range], queryFn: async () => (await api.get<SeriesPoint[]>(`/stats/traffic-series?range=${range}`)).data });
  const trends = useQuery({ queryKey: ["trends"], queryFn: async () => (await api.get<Trends>("/stats/trends")).data });
  const mon = useQuery({ queryKey: ["monitoring"], queryFn: async () => (await api.get<Monitoring>("/stats/monitoring")).data, refetchInterval: 15000 });
  const sysQuery = useQuery({ queryKey: ["system"], queryFn: async () => (await api.get<any>("/stats/system")).data, refetchInterval: 5000 });

  const [livePanels, setLivePanels] = useState<any[]>([]);

  useEffect(() => {
    const socket = io({ transports: ["websocket"], path: "/socket.io/" });
    socket.on("live-speed", (data) => {
      if (Array.isArray(data)) {
        // Stable sort by panelName to prevent reordering on each broadcast
        setLivePanels([...data].sort((a, b) =>
          String(a.panelName).localeCompare(String(b.panelName))
        ));
      }
    });
    return () => { socket.disconnect(); };
  }, []);

  if (overview.isLoading) return <Spinner />;
  if (overview.error) return <ErrorBox message={t("dashboard.loadFailed")} />;
  const o = overview.data!;

  const seriesData = (series.data ?? []).map((p) => ({ label: p.label, bytes: p.bytes }));
  
  const processPieData = (data: any[], max: number = 5) => {
    const raw = data.map((d: any) => ({ name: d.name.replace("inbound-", ""), bytes: d.bytes })).sort((a, b) => b.bytes - a.bytes);
    if (raw.length <= max) return raw;
    const top = raw.slice(0, max);
    const other = raw.slice(max).reduce((sum, d) => sum + d.bytes, 0);
    return [...top, { name: t("dashboard.other"), bytes: other }];
  };

  const trendsData = trends.data?.[pieRange === "24h" ? "last24h" : "allTime"];
  const adminData = processPieData(trendsData?.byAdmin ?? []);
  const inboundData = processPieData(trendsData?.byInbound ?? []);
  const modeData = processPieData(trendsData?.byTrafficMode ?? []);
  
  const sys = sysQuery.data;

  const totalRangeTraffic = seriesData.reduce((sum, p) => sum + p.bytes, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{t("dashboard.title")}</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">{t("dashboard.superSubtitle")}</p>
        </div>
        
        {sys && (
          <div className="flex gap-5 items-center rounded-xl bg-white dark:bg-zinc-950/50 border border-zinc-200 dark:border-zinc-800/80 p-3.5 shadow-sm max-w-max">
            <div className="flex items-center gap-2 text-zinc-500 dark:text-zinc-400 border-r border-zinc-200 dark:border-zinc-800 pr-5">
              <Server size={18} />
              <span className="hidden sm:inline text-xs font-semibold uppercase tracking-wider text-zinc-700 dark:text-zinc-300">{t("dashboard.hostNode")}</span>
            </div>
            <div className="flex items-center gap-6">
              <div className="flex flex-col gap-1.5 w-[72px]">
                <div className="flex justify-between text-[10px] text-zinc-500 font-medium"><span>{t("dashboard.cpu")}</span><span>{sys.cpu.toFixed(0)}%</span></div>
                <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-900 rounded-full overflow-hidden"><div className="h-full bg-blue-500" style={{ width: `${sys.cpu}%` }} /></div>
              </div>
              <div className="flex flex-col gap-1.5 w-[72px]">
                <div className="flex justify-between text-[10px] text-zinc-500 font-medium"><span>{t("dashboard.ram")}</span><span>{sys.ram.toFixed(0)}%</span></div>
                <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-900 rounded-full overflow-hidden"><div className="h-full bg-purple-500" style={{ width: `${sys.ram}%` }} /></div>
              </div>
              <div className="flex flex-col gap-1.5 w-[72px]">
                <div className="flex justify-between text-[10px] text-zinc-500 font-medium"><span>{t("dashboard.disk")}</span><span>{sys.disk.toFixed(0)}%</span></div>
                <div className="h-1.5 w-full bg-zinc-100 dark:bg-zinc-900 rounded-full overflow-hidden"><div className="h-full bg-amber-500" style={{ width: `${sys.disk}%` }} /></div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* System Alerts */}
      <AlertsSection monData={mon.data} />

      <div className="pt-6">
        <div className="mb-4 border-b border-zinc-200 dark:border-zinc-800 pb-2">
          <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
            <DollarSign size={18} className="text-blue-400" />
            {t("dashboard.businessAnalytics")}
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{t("dashboard.businessAnalyticsHint")}</p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={Server} tone="text-amber-400" label={t("nav.panels")} value={o.panels.total}
          parts={[{ label: t("common.online"), value: o.panels.online, tone: "text-emerald-400" }, { label: t("common.offline"), value: o.panels.offline, tone: "text-red-400" }]} />
        <Kpi icon={UserCog} tone="text-emerald-400" label={t("nav.admins")} value={o.admins.total}
          parts={[{ label: t("common.active"), value: o.admins.active, tone: "text-emerald-400" }, { label: t("dashboard.suspended"), value: o.admins.suspended, tone: "text-red-400" }]} />
        <Kpi icon={Users} tone="text-blue-400" label={t("nav.clients")} value={o.clients.total}
          parts={[{ label: t("common.active"), value: o.clients.active, tone: "text-emerald-400" }, { label: t("common.expired"), value: o.clients.expired, tone: "text-red-400" }]} />
        <Kpi icon={Activity} tone="text-cyan-400" label={t("dashboard.todaysUsage")} value={o.usage?.today != null ? formatBytes(Number(o.usage.today)) : t("dashboard.unknown")} />
        <Kpi icon={CalendarDays} tone="text-purple-400" label={t("dashboard.monthlyUsage")} value={o.usage?.monthly != null ? formatBytes(Number(o.usage.monthly)) : t("dashboard.unknown")} />

        <Card className="border-red-500/30 bg-red-500/5">
          <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <ArchiveX size={16} className="text-red-400" /> {t("dashboard.cleanupReady")}
          </div>
          <div className="mt-2 flex items-end justify-between">
            <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{o.clients.cleanupCandidates ?? 0}</div>
            <button onClick={() => router.push('/cleanup')} className="text-xs font-semibold text-red-500 hover:text-red-400 hover:underline">{t("dashboard.cleanUp")}</button>
          </div>
        </Card>
      </div>

      {/* Traffic chart with range toggle */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-medium text-zinc-800 dark:text-zinc-100">{t("dashboard.trafficVolume")}</h2>
            <div className="mt-1 flex items-center gap-2">
              <span className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{formatBytes(totalRangeTraffic)}</span>
              <span className="text-xs text-zinc-500 dark:text-zinc-400">{t("dashboard.totalInPeriod")}</span>
            </div>
          </div>
          <div className="flex gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5">
            {(["24h", "7d", "30d"] as const).map((r) => (
              <button key={r} onClick={() => setRange(r)}
                className={`rounded-md px-3 py-1 text-xs ${range === r ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100" : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"}`}>
                {r === "24h" ? t("dashboard.last24hLong") : r === "7d" ? t("dashboard.last7Days") : t("dashboard.last30Days")}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={seriesData} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="colorBytes" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#27272a" strokeOpacity={0.4} />
            <XAxis dataKey="label" tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} dy={10} minTickGap={30} />
            <YAxis tickFormatter={(v) => formatBytes(Number(v))} tick={{ fill: "#71717a", fontSize: 11 }} axisLine={false} tickLine={false} dx={-10} width={80} />
            <Tooltip 
              formatter={(val: any) => [formatBytes(Number(val)), t("dashboard.traffic")]} 
              contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a", borderRadius: "8px", boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1)", padding: "8px 12px" }}
              itemStyle={{ color: "#e4e4e7", fontWeight: 500 }}
              labelStyle={{ color: "#a1a1aa", marginBottom: "4px" }}
              cursor={{ stroke: '#3f3f46', strokeWidth: 1, strokeDasharray: '4 4' }}
            />
            <Area type="monotone" dataKey="bytes" stroke="#3b82f6" strokeWidth={3} fill="url(#colorBytes)" activeDot={{ r: 6, fill: "#3b82f6", stroke: "#fff", strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      {/* Trends row */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 mb-8">
        <Card className="border-zinc-200 dark:border-zinc-800/60 shadow-sm">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="font-semibold text-zinc-800 dark:text-zinc-100">{t("dashboard.newClients30d")}</h2>
            <div className="h-8 w-8 rounded-full bg-purple-500/10 flex items-center justify-center"><Users size={16} className="text-purple-500"/></div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={trends.data?.allTime?.newClients ?? []} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#27272a" strokeOpacity={0.3} />
              <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} dy={8} />
              <YAxis tick={{ fill: "#71717a", fontSize: 10 }} allowDecimals={false} axisLine={false} tickLine={false} />
              <Tooltip 
                cursor={{ fill: "#a855f7", opacity: 0.1 }} 
                contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a", borderRadius: "8px", padding: "8px 12px" }}
                itemStyle={{ color: "#e4e4e7", fontWeight: 500 }}
              />
              <Bar dataKey="count" name={t("nav.clients")} fill="#a855f7" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800/60 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
              {t("dashboard.usageByAdmin")}
            </h2>
            <div className="flex gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5">
              {(["allTime", "24h"] as const).map((r) => (
                <button key={r} onClick={() => setPieRange(r)}
                  className={`rounded-md px-2 py-0.5 text-[10px] ${pieRange === r ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100" : "text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"}`}>
                  {r === "allTime" ? t("dashboard.allTime") : t("dashboard.last24h")}
                </button>
              ))}
            </div>
          </div>
          {adminData.length === 0 ? (
            <div className="h-[280px] flex items-center justify-center text-zinc-500 text-sm">{t("dashboard.noData")}</div>
          ) : (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <Pie data={adminData} dataKey="bytes" nameKey="name" cx="50%" cy="45%" innerRadius={60} outerRadius={85} paddingAngle={2} stroke="none">
                {adminData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899'][index % 6]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(val: any, name: any) => [formatBytes(Number(val)), name]}
                contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a", borderRadius: "8px", padding: "8px 12px" }}
                itemStyle={{ color: "#e4e4e7", fontWeight: 500 }}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(value) => <span style={{ color: '#a1a1aa', fontSize: 11 }}>{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
          )}
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800/60 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold text-zinc-800 dark:text-zinc-100">{t("dashboard.usageByInbound")}</h2>
            <div className="h-8 w-8 rounded-full bg-amber-500/10 flex items-center justify-center"><Server size={16} className="text-amber-500"/></div>
          </div>
          {inboundData.length === 0 ? (
            <div className="h-[280px] flex items-center justify-center text-zinc-500 text-sm">{t("dashboard.noData")}</div>
          ) : (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <Pie data={inboundData} dataKey="bytes" nameKey="name" cx="50%" cy="45%" innerRadius={60} outerRadius={85} paddingAngle={2} stroke="none">
                {inboundData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={['#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#8b5cf6', '#06b6d4'][index % 6]} />
                ))}
              </Pie>
              <Tooltip
                formatter={(val: any, name: any) => [formatBytes(Number(val)), name]}
                contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a", borderRadius: "8px", padding: "8px 12px" }}
                itemStyle={{ color: "#e4e4e7", fontWeight: 500 }}
              />
              <Legend
                iconType="circle"
                iconSize={8}
                formatter={(value) => <span style={{ color: '#a1a1aa', fontSize: 11 }}>{value}</span>}
              />
            </PieChart>
          </ResponsiveContainer>
          )}
        </Card>
      </div>

      {/* Live monitoring directly from API via WebSockets */}
      <div className="pt-6">
        <div className="mb-4 border-b border-zinc-200 dark:border-zinc-800 pb-2">
          <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
            <Server size={18} className="text-emerald-400" />
            {t("dashboard.infraMonitoring")}
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">{t("dashboard.infraMonitoringHint")}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity size={18} className="text-emerald-400 animate-pulse" />
              <h2 className="font-medium text-zinc-800 dark:text-zinc-100">{t("dashboard.liveNodes")}</h2>
            </div>
            <span className="text-xs text-zinc-500">{t("dashboard.liveStreamHint")}</span>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {livePanels.map((p) => (
              <div key={p.panelId} className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-900/40 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition-colors shadow-lg shadow-black/20">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                     <Server size={16} className={p.online ? "text-emerald-400" : "text-red-400"} />
                     <span className="font-semibold text-zinc-700 dark:text-zinc-200">{p.panelName}</span>
                     {p.latencyMs > 0 && <span className="text-[10px] text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 rounded-full ml-1">{p.latencyMs}ms</span>}
                  </div>
                  <Badge tone={p.online ? "green" : "red"}>{p.online ? t("common.online") : t("common.offline")}</Badge>
                </div>
                
                {p.online ? (
                  <>
                    <div className="space-y-3 mb-5">
                      <MetricBar label={t("dashboard.cpu")} pct={p.cpu} />
                      <MetricBar label={t("dashboard.ram")} pct={p.ram} />
                      <MetricBar label={t("dashboard.disk")} pct={p.disk} />
                    </div>
                    
                    <div className="flex flex-col gap-1.5 text-xs font-mono mb-4">
                      <div className="flex justify-between items-center bg-white dark:bg-zinc-900/50 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800/80">
                        <span className="text-zinc-500 dark:text-zinc-400">↑ {t("common.upload")}</span>
                        <span className="text-emerald-400 font-semibold">{(p.up / (1024 * 1024)).toFixed(2)} MB/s</span>
                      </div>
                      <div className="flex justify-between items-center bg-white dark:bg-zinc-900/50 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800/80">
                        <span className="text-zinc-500 dark:text-zinc-400">↓ {t("common.download")}</span>
                        <span className="text-blue-400 font-semibold">{(p.down / (1024 * 1024)).toFixed(2)} MB/s</span>
                      </div>
                    </div>

                    <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400 pt-3 border-t border-zinc-200 dark:border-zinc-800/50">
                      <div className="flex gap-1.5 items-center">
                        <span>{t("dashboard.xray")}</span> 
                        <span className={p.xrayStatus === 'running' ? "text-emerald-400 font-medium" : "text-red-400 font-medium"}>{p.xrayStatus}</span>
                      </div>
                      <div>v{p.panelVersion}</div>
                    </div>
                  </>
                ) : (
                  <div className="py-12 text-center text-zinc-600 text-sm flex flex-col items-center gap-3">
                    <Wifi size={24} className="text-zinc-700/50" />
                    {t("dashboard.panelUnreachable")}
                  </div>
                )}
              </div>
            ))}
            {livePanels.length === 0 && (
              <div className="col-span-full py-16 text-center text-zinc-500 text-sm">
                <Spinner size={18} className="mx-auto mb-3" />
                {t("dashboard.connectingStream")}
              </div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}

/* Resellers Dashboard */
function ResellerDashboard() {
  const t = useT();
  const admin = useAuth((s) => s.admin);
  const router = useRouter();
  const [editing, setEditing] = useState<any>(null);

  const inboundsQuery = useQuery({
    queryKey: ["inbounds-list"],
    queryFn: async () => (await api.get<any[]>("/inbounds")).data,
  });

  const overview = useQuery({
    queryKey: ["reseller-overview"],
    queryFn: async () => (await api.get<any>("/stats/reseller-overview")).data,
  });

  if (overview.isLoading) return <Spinner />;
  if (overview.error) return <ErrorBox message={t("dashboard.resellerLoadFailed")} />;

  const { admin: a, usage, attention, priorityClients } = overview.data;

  const getAttentionColor = (label: string) => {
    switch (label) {
      case 'trafficLow': return 'bg-amber-500/10 text-amber-500 border-amber-500/20';
      case 'expiringSoon': return 'bg-orange-500/10 text-orange-500 border-orange-500/20';
      case 'disabled': return 'bg-zinc-500/10 text-zinc-500 dark:text-zinc-400 border-zinc-500/20';
      case 'depleted': return 'bg-red-500/10 text-red-500 border-red-500/20';
      default: return 'bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300';
    }
  };

  const cleanupCandidates = attention.cleanupCandidates || 0;
  const totalAttentionCount = attention.trafficLow + attention.expiringSoon + attention.disabled + attention.depleted + cleanupCandidates;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-500 dark:from-blue-400 dark:to-indigo-300">{t("dashboard.welcomeBack", { username: admin?.username ?? "" })}</h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400 font-medium">{t("dashboard.resellerSubtitle")}</p>
        </div>

      </div>

      {a?.gracePeriodStart && !a?.unlimitedTraffic && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 p-4 rounded-xl flex items-start gap-3">
          <AlertTriangle className="shrink-0 mt-0.5" size={20} />
          <div>
            <h3 className="font-semibold text-sm">{t("dashboard.gracePeriodTitle")}</h3>
            <p className="text-xs mt-1 opacity-90">
              {t("dashboard.gracePeriodBody", { startedAt: new Date(a.gracePeriodStart).toLocaleString() })}
            </p>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">


        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="w-full">
          <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group border-b-4 border-b-blue-500">
            <div className="absolute -right-6 -top-6 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-all"></div>
            <HardDrive size={80} className="absolute -bottom-4 -right-4 text-blue-500/5 group-hover:text-blue-500/10 transition-all transform group-hover:scale-110" />
            <div className="flex items-center gap-3 text-sm font-semibold text-blue-600 dark:text-blue-400 mb-4 relative z-10">
              <div className="p-2.5 bg-blue-500/10 rounded-xl shadow-inner"><HardDrive size={20} /></div> {t("clients.availableTraffic")}
            </div>
            <div className="text-4xl font-extrabold text-zinc-900 dark:text-white relative z-10">
              {a.unlimitedTraffic ? <span className="text-emerald-500">∞</span> : formatBytes(a.availableTraffic)}
            </div>
            <div className="mt-3 text-sm text-zinc-500 dark:text-zinc-400 font-medium relative z-10">
              {a.unlimitedTraffic ? t("dashboard.unlimitedTrafficNote") : t("clients.outOf", { total: formatBytes(a.allTimeTraffic) })}
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="w-full">
          <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group border-b-4 border-b-amber-500">
            <div className="absolute -right-6 -top-6 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl group-hover:bg-amber-500/20 transition-all"></div>
            <Activity size={80} className="absolute -bottom-4 -right-4 text-amber-500/5 group-hover:text-amber-500/10 transition-all transform group-hover:scale-110" />
            <div className="flex items-center gap-3 text-sm font-semibold text-amber-600 dark:text-amber-400 mb-4 relative z-10">
              <div className="p-2.5 bg-amber-500/10 rounded-xl shadow-inner"><Activity size={20} /></div> {t("dashboard.usedTraffic")}
            </div>
            <div className="text-4xl font-extrabold text-zinc-900 dark:text-white relative z-10">
              {a.unlimitedTraffic ? <span className="text-emerald-500">—</span> : formatBytes(a.usedTraffic || 0)}
            </div>
            <div className="mt-3 text-sm text-zinc-500 dark:text-zinc-400 font-medium relative z-10">
              {a.unlimitedTraffic ? t("dashboard.notTracked") : t("dashboard.consumedFromAllocation")}
            </div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="w-full">
          <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group border-b-4 border-b-purple-500">
            <div className="absolute -right-6 -top-6 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl group-hover:bg-purple-500/20 transition-all"></div>
            <Users size={80} className="absolute -bottom-4 -right-4 text-purple-500/5 group-hover:text-purple-500/10 transition-all transform group-hover:scale-110" />
            <div className="flex items-center gap-3 text-sm font-semibold text-purple-600 dark:text-purple-400 mb-4 relative z-10">
              <div className="p-2.5 bg-purple-500/10 rounded-xl shadow-inner"><Users size={20} /></div> {t("clients.clientCapacity")}
            </div>
            <div className="text-4xl font-extrabold text-zinc-900 dark:text-white relative z-10">{overview.data.clientEmails?.length || 0} / {a.clientCapacity === 0 ? "∞" : a.clientCapacity}</div>
            <div className="mt-3 text-sm text-zinc-500 dark:text-zinc-400 font-medium relative z-10">{t("dashboard.totalAllowedClients")}</div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="w-full">
          <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group border-b-4 border-b-amber-500">
            <div className="absolute -right-6 -top-6 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl group-hover:bg-amber-500/20 transition-all"></div>
            <CalendarDays size={80} className="absolute -bottom-4 -right-4 text-amber-500/5 group-hover:text-amber-500/10 transition-all transform group-hover:scale-110" />
            <div className="flex items-center gap-3 text-sm font-semibold text-amber-600 dark:text-amber-400 mb-4 relative z-10">
              <div className="p-2.5 bg-amber-500/10 rounded-xl shadow-inner"><CalendarDays size={20} /></div> {t("clients.subscriptionExpiry")}
            </div>
            <div className="text-4xl font-extrabold text-zinc-900 dark:text-white relative z-10">
              {a.expiryTime > 0 ? t("common.days", { count: Math.max(0, Math.ceil((a.expiryTime - Date.now()) / (1000 * 60 * 60 * 24))) }) : t("common.never")}
            </div>
            <div className="mt-3 text-sm text-zinc-500 dark:text-zinc-400 font-medium relative z-10">{t("dashboard.untilAccountExpiration")}</div>
          </div>
        </motion.div>
      </div>

      <div className="pt-6">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle size={20} className={totalAttentionCount > 0 ? "text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]" : "text-zinc-500"} />
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">{t("dashboard.attentionRequired")}</h2>
        </div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => router.push('/clients?filter=traffic-low')} className="flex flex-col items-start p-5 rounded-2xl bg-gradient-to-br from-amber-500/5 to-amber-600/10 border border-amber-500/20 hover:border-amber-500/40 transition-colors relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><HardDrive size={48} /></div>
            <span className="text-3xl font-extrabold text-amber-600 dark:text-amber-400">{attention.trafficLow}</span>
            <span className="mt-1 font-semibold text-zinc-700 dark:text-zinc-200">{t("dashboard.trafficLow")}</span>
          </motion.button>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => router.push('/clients?filter=expiring-soon')} className="flex flex-col items-start p-5 rounded-2xl bg-gradient-to-br from-orange-500/5 to-orange-600/10 border border-orange-500/20 hover:border-orange-500/40 transition-colors relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><CalendarDays size={48} /></div>
            <span className="text-3xl font-extrabold text-orange-600 dark:text-orange-400">{attention.expiringSoon}</span>
            <span className="mt-1 font-semibold text-zinc-700 dark:text-zinc-200">{t("clients.filterExpiringSoon")}</span>
          </motion.button>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => router.push('/clients?filter=disabled')} className="flex flex-col items-start p-5 rounded-2xl bg-gradient-to-br from-zinc-500/5 to-zinc-600/10 border border-zinc-500/20 hover:border-zinc-500/40 transition-colors relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><UserCog size={48} /></div>
            <span className="text-3xl font-extrabold text-zinc-600 dark:text-zinc-400">{attention.disabled}</span>
            <span className="mt-1 font-semibold text-zinc-700 dark:text-zinc-200">{t("common.disabled")}</span>
          </motion.button>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => router.push('/clients?filter=depleted')} className="flex flex-col items-start p-5 rounded-2xl bg-gradient-to-br from-red-500/5 to-red-600/10 border border-red-500/20 hover:border-red-500/40 transition-colors relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><AlertTriangle size={48} /></div>
            <span className="text-3xl font-extrabold text-red-600 dark:text-red-400">{attention.depleted}</span>
            <span className="mt-1 font-semibold text-zinc-700 dark:text-zinc-200">{t("dashboard.trafficFinished")}</span>
          </motion.button>
          {cleanupCandidates > 0 && (
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => router.push('/cleanup')} className="flex items-center justify-between p-4 rounded-2xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors col-span-full lg:col-span-2">
              <span className="font-semibold text-red-500 flex items-center gap-2"><ArchiveX size={18} /> {t("dashboard.cleanupCandidates")}</span>
              <span className="text-xl font-bold text-red-400">{cleanupCandidates}</span>
            </motion.button>
          )}
        </motion.div>

        {priorityClients.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
              <h3 className="font-semibold text-zinc-700 dark:text-zinc-200">{t("dashboard.highestPriorityClients")}</h3>
              {totalAttentionCount > 5 && (
                <button onClick={() => router.push('/clients')} className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
                  {t("dashboard.moreCount", { count: totalAttentionCount - 5 })}
                </button>
              )}
            </div>
            <div className="divide-y divide-zinc-800">
              {priorityClients.map((c: any) => (
                <div key={c.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors">
                  <div>
                    <div className="font-semibold text-zinc-900 dark:text-white">{c.remark || c.email}</div>
                    <div className="flex gap-2 mt-1 flex-wrap">
                      {c.reasons.depleted && <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-red-500/10 text-red-400">{t("dashboard.depleted")}</span>}
                      {c.reasons.expired && <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-red-500/10 text-red-400">{t("common.expired")}</span>}
                      {c.reasons.trafficLow && <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-amber-500/10 text-amber-400">{t("dashboard.lowTraffic")}</span>}
                      {c.reasons.expiringSoon && <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-orange-500/10 text-orange-400">{t("clients.filterExpiringSoon")}</span>}
                      {c.reasons.disabled && <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-zinc-500/10 text-zinc-500 dark:text-zinc-400">{t("common.disabled")}</span>}
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="text-sm font-mono text-zinc-600 dark:text-zinc-300">{formatBytes(c.used)} / {c.total === 0 ? "∞" : formatBytes(c.total)}</div>
                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => setEditing(c)} className="mt-2 sm:mt-2 text-xs font-semibold text-blue-400 hover:bg-blue-400/10 px-3 py-1 rounded-full transition-colors border border-blue-400/20 sm:border-0">
                      {t("dashboard.manageClient")}
                    </motion.button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {editing && inboundsQuery.data && (
          <EditClientModal
            client={editing}
            inboundsList={inboundsQuery.data}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              overview.refetch();
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
