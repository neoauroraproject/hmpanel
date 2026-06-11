"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";
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
  const offlinePanels = (monData?.xray ?? []).filter((x) => x.status !== "running");
  const failedJobs = monData?.failedJobs ?? 0;
  const hasAlerts = offlinePanels.length > 0 || failedJobs > 0;

  return (
    <Card>
      <div className="flex items-center gap-2">
        <Bell size={18} className={hasAlerts ? "text-red-400 animate-pulse" : "text-zinc-500 dark:text-zinc-400"} />
        <h2 className="font-medium text-zinc-800 dark:text-zinc-100">System Alerts</h2>
      </div>
      <div className="mt-4 space-y-3">
        {offlinePanels.map((p) => (
          <div key={p.panel} className="flex items-center justify-between rounded-lg bg-red-500/10 border border-red-500/20 p-3 text-sm text-red-200">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-red-400" />
              <span>Panel <strong>{p.panel}</strong> is offline or Xray service is stopped.</span>
            </div>
            <Badge tone="red">offline</Badge>
          </div>
        ))}
        {failedJobs > 0 && (
          <div className="flex items-center justify-between rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-sm text-amber-200">
            <div className="flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-400" />
              <span>System has <strong>{failedJobs}</strong> failed sync job(s) requiring attention.</span>
            </div>
            <Badge tone="red">{failedJobs} failed</Badge>
          </div>
        )}
        {!hasAlerts && (
          <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400 p-1">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            All panels and sync systems are operating normally.
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
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);
  const [range, setRange] = useState<"24h" | "7d" | "30d">("24h");

  const overview = useQuery({ queryKey: ["overview"], queryFn: async () => (await api.get<any>("/stats/overview")).data });
  const series = useQuery({ queryKey: ["series", range], queryFn: async () => (await api.get<SeriesPoint[]>(`/stats/traffic-series?range=${range}`)).data });
  const trends = useQuery({ queryKey: ["trends"], queryFn: async () => (await api.get<Trends>("/stats/trends")).data });
  const mon = useQuery({ queryKey: ["monitoring"], queryFn: async () => (await api.get<Monitoring>("/stats/monitoring")).data, refetchInterval: 15000 });

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
  if (overview.error) return <ErrorBox message="Failed to load dashboard" />;
  const o = overview.data!;

  const seriesData = (series.data ?? []).map((p) => ({ label: p.label, bytes: p.bytes }));
  const adminData = (trends.data?.byAdmin ?? []).map((d) => ({ name: d.name, bytes: d.bytes }));
  const inboundData = (trends.data?.byInbound ?? []).map((d) => ({ name: d.name.replace("inbound-", ""), bytes: d.bytes }));

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Platform-wide overview across all panels, resellers and clients.</p>
        </div>
      </div>

      {/* System Alerts */}
      <AlertsSection monData={mon.data} />

      <div className="pt-6">
        <div className="mb-4 border-b border-zinc-200 dark:border-zinc-800 pb-2">
          <h2 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
            <DollarSign size={18} className="text-blue-400" />
            Business & Usage Analytics
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Platform statistics derived from the local database</p>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <Kpi icon={Server} tone="text-amber-400" label="Panels" value={o.panels.total}
          parts={[{ label: "online", value: o.panels.online, tone: "text-emerald-400" }, { label: "offline", value: o.panels.offline, tone: "text-red-400" }]} />
        <Kpi icon={UserCog} tone="text-emerald-400" label="Admins" value={o.admins.total}
          parts={[{ label: "active", value: o.admins.active, tone: "text-emerald-400" }, { label: "susp.", value: o.admins.suspended, tone: "text-red-400" }]} />
        <Kpi icon={Users} tone="text-blue-400" label="Clients" value={o.clients.total}
          parts={[{ label: "active", value: o.clients.active, tone: "text-emerald-400" }, { label: "expired", value: o.clients.expired, tone: "text-red-400" }]} />
        <Kpi icon={Activity} tone="text-cyan-400" label="Today's Usage" value={o.usage?.today != null ? formatBytes(Number(o.usage.today)) : "Unknown"} />
        <Kpi icon={CalendarDays} tone="text-purple-400" label="Monthly Usage" value={o.usage?.monthly != null ? formatBytes(Number(o.usage.monthly)) : "Unknown"} />

        <Card className="border-red-500/30 bg-red-500/5">
          <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <ArchiveX size={16} className="text-red-400" /> Cleanup Ready
          </div>
          <div className="mt-2 flex items-end justify-between">
            <div className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">{o.clients.cleanupCandidates ?? 0}</div>
            <button onClick={() => router.push('/cleanup')} className="text-xs font-semibold text-red-500 hover:text-red-400 hover:underline">Clean up</button>
          </div>
        </Card>
      </div>

      {/* Traffic chart with range toggle */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-medium text-zinc-800 dark:text-zinc-100">Traffic volume</h2>
          <div className="flex gap-1 rounded-lg border border-zinc-200 dark:border-zinc-800 p-0.5">
            {(["24h", "7d", "30d"] as const).map((r) => (
              <button key={r} onClick={() => setRange(r)}
                className={`rounded-md px-3 py-1 text-xs ${range === r ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100" : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:text-zinc-200"}`}>
                {r === "24h" ? "Last 24h" : r === "7d" ? "Last 7 days" : "Last 30 days"}
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
              formatter={(val: any) => [formatBytes(Number(val)), "Traffic"]} 
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
            <h2 className="font-semibold text-zinc-800 dark:text-zinc-100">New clients (30d)</h2>
            <div className="h-8 w-8 rounded-full bg-purple-500/10 flex items-center justify-center"><Users size={16} className="text-purple-500"/></div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={trends.data?.newClients ?? []} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#27272a" strokeOpacity={0.3} />
              <XAxis dataKey="date" tick={{ fill: "#71717a", fontSize: 10 }} axisLine={false} tickLine={false} dy={8} />
              <YAxis tick={{ fill: "#71717a", fontSize: 10 }} allowDecimals={false} axisLine={false} tickLine={false} />
              <Tooltip 
                cursor={{ fill: "#a855f7", opacity: 0.1 }} 
                contentStyle={{ backgroundColor: "#18181b", borderColor: "#27272a", borderRadius: "8px", padding: "8px 12px" }}
                itemStyle={{ color: "#e4e4e7", fontWeight: 500 }}
              />
              <Bar dataKey="count" name="Clients" fill="#a855f7" radius={[4, 4, 0, 0]} maxBarSize={40} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="border-zinc-200 dark:border-zinc-800/60 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-semibold text-zinc-800 dark:text-zinc-100">Usage by Admin</h2>
            <div className="h-8 w-8 rounded-full bg-emerald-500/10 flex items-center justify-center"><UserCog size={16} className="text-emerald-500"/></div>
          </div>
          {adminData.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-zinc-500 text-sm">No data available</div>
          ) : (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <Pie data={adminData} dataKey="bytes" nameKey="name" cx="50%" cy="45%" innerRadius={45} outerRadius={65} paddingAngle={2} stroke="none">
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
            <h2 className="font-semibold text-zinc-800 dark:text-zinc-100">Usage by Inbound</h2>
            <div className="h-8 w-8 rounded-full bg-amber-500/10 flex items-center justify-center"><Server size={16} className="text-amber-500"/></div>
          </div>
          {inboundData.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center text-zinc-500 text-sm">No data available</div>
          ) : (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
              <Pie data={inboundData} dataKey="bytes" nameKey="name" cx="50%" cy="45%" innerRadius={45} outerRadius={65} paddingAngle={2} stroke="none">
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
            Infrastructure Monitoring
          </h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-1">Real-time node statistics from 3x-ui APIs (Live WebSockets)</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <Card>
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity size={18} className="text-emerald-400 animate-pulse" />
              <h2 className="font-medium text-zinc-800 dark:text-zinc-100">Live Nodes</h2>
            </div>
            <span className="text-xs text-zinc-500">Live Direct API WebSocket Stream</span>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {livePanels.map((p) => (
              <div key={p.panelId} className="rounded-xl border border-zinc-200 dark:border-zinc-800 p-5 bg-white dark:bg-zinc-900/40 hover:bg-white dark:bg-zinc-900/60 transition-colors shadow-lg shadow-black/20">
                <div className="mb-4 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                     <Server size={16} className={p.online ? "text-emerald-400" : "text-red-400"} />
                     <span className="font-semibold text-zinc-700 dark:text-zinc-200">{p.panelName}</span>
                     {p.latencyMs > 0 && <span className="text-[10px] text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 rounded-full ml-1">{p.latencyMs}ms</span>}
                  </div>
                  <Badge tone={p.online ? "green" : "red"}>{p.online ? "Online" : "Offline"}</Badge>
                </div>
                
                {p.online ? (
                  <>
                    <div className="space-y-3 mb-5">
                      <MetricBar label="CPU" pct={p.cpu} />
                      <MetricBar label="RAM" pct={p.ram} />
                      <MetricBar label="Disk" pct={p.disk} />
                    </div>
                    
                    <div className="flex flex-col gap-1.5 text-xs font-mono mb-4">
                      <div className="flex justify-between items-center bg-white dark:bg-zinc-900/50 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800/80">
                        <span className="text-zinc-500 dark:text-zinc-400">↑ Upload</span>
                        <span className="text-emerald-400 font-semibold">{(p.up / (1024 * 1024)).toFixed(2)} MB/s</span>
                      </div>
                      <div className="flex justify-between items-center bg-white dark:bg-zinc-900/50 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800/80">
                        <span className="text-zinc-500 dark:text-zinc-400">↓ Download</span>
                        <span className="text-blue-400 font-semibold">{(p.down / (1024 * 1024)).toFixed(2)} MB/s</span>
                      </div>
                    </div>

                    <div className="flex justify-between text-xs text-zinc-500 dark:text-zinc-400 pt-3 border-t border-zinc-200 dark:border-zinc-800/50">
                      <div className="flex gap-1.5 items-center">
                        <span>Xray:</span> 
                        <span className={p.xrayStatus === 'running' ? "text-emerald-400 font-medium" : "text-red-400 font-medium"}>{p.xrayStatus}</span>
                      </div>
                      <div>v{p.panelVersion}</div>
                    </div>
                  </>
                ) : (
                  <div className="py-12 text-center text-zinc-600 text-sm flex flex-col items-center gap-3">
                    <Wifi size={24} className="text-zinc-700/50" />
                    Panel API is Unreachable
                  </div>
                )}
              </div>
            ))}
            {livePanels.length === 0 && (
              <div className="col-span-full py-16 text-center text-zinc-500 text-sm">
                <Spinner size={18} className="mx-auto mb-3" />
                Connecting to live stream...
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
  const admin = useAuth((s) => s.admin);
  const router = useRouter();

  const onlinesQuery = useQuery({
    queryKey: ["live-onlines"],
    queryFn: async () => (await api.get<{ onlines: string[] }>("/stats/onlines")).data,
    refetchInterval: 10000,
    refetchOnWindowFocus: true
  });
  const onlineClients = onlinesQuery.data?.onlines ?? [];

  const overview = useQuery({
    queryKey: ["reseller-overview"],
    queryFn: async () => (await api.get<any>("/stats/reseller-overview")).data,
  });

  if (overview.isLoading) return <Spinner />;
  if (overview.error) return <ErrorBox message="Failed to load dashboard data" />;

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

  const resellerOnlineClients = overview.data.clientEmails 
    ? onlineClients.filter(email => email && overview.data.clientEmails.includes(email))
    : [];

  const cleanupCandidates = attention.cleanupCandidates || 0;
  const totalAttentionCount = attention.trafficLow + attention.expiringSoon + attention.disabled + attention.depleted + cleanupCandidates;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-500 dark:from-blue-400 dark:to-indigo-300">Welcome back, {admin?.username}</h1>
          <p className="mt-2 text-sm text-zinc-500 dark:text-zinc-400 font-medium">Actionable overview of your clients and traffic performance.</p>
        </div>
        {process.env.NEXT_PUBLIC_RELEASE_MODE !== 'COMMUNITY' && (
        <motion.button 
          whileHover={{ scale: 1.02 }} 
          whileTap={{ scale: 0.98 }} 
          onClick={() => router.push("/settings/portal")}
          className="flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-semibold transition-all shadow-lg shadow-blue-500/30 hover:shadow-blue-500/50"
        >
          <UserCog size={16} /> Customize Portal
        </motion.button>
        )}
      </div>

      {a?.gracePeriodStart && (
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="bg-red-500/10 border border-red-500/20 text-red-600 dark:text-red-400 p-4 rounded-xl flex items-start gap-3">
          <AlertTriangle className="shrink-0 mt-0.5" size={20} />
          <div>
            <h3 className="font-semibold text-sm">Traffic Exhausted - Grace Period Active</h3>
            <p className="text-xs mt-1 opacity-90">
              Your balance has reached zero. You have a 24-hour grace period (started at {new Date(a.gracePeriodStart).toLocaleString()}) to recharge your account. 
              New client creation is blocked. If your balance is not recharged within 24 hours, your clients will be suspended.
            </p>
          </div>
        </motion.div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }} className="w-full">
          <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group border-b-4 border-b-emerald-500">
            <div className="absolute -right-6 -top-6 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl group-hover:bg-emerald-500/20 transition-all"></div>
            <Activity size={80} className="absolute -bottom-4 -right-4 text-emerald-500/5 group-hover:text-emerald-500/10 transition-all transform group-hover:scale-110" />
            <div className="flex items-center gap-3 text-sm font-semibold text-emerald-600 dark:text-emerald-400 mb-4 relative z-10">
              <div className="p-2.5 bg-emerald-500/10 rounded-xl shadow-inner"><Activity size={20} className="animate-pulse" /></div> Online Now
            </div>
            <div className="text-4xl font-extrabold text-zinc-900 dark:text-white relative z-10">{resellerOnlineClients.length}</div>
            <div className="mt-3 text-sm text-zinc-500 dark:text-zinc-400 font-medium relative z-10">Live Active Connections</div>
          </div>
        </motion.div>

        {a.trafficMode === 'USAGE' ? (
          <>
            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="w-full">
              <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group border-b-4 border-b-purple-500">
                <div className="absolute -right-6 -top-6 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl group-hover:bg-purple-500/20 transition-all"></div>
                <HardDrive size={80} className="absolute -bottom-4 -right-4 text-purple-500/5 group-hover:text-purple-500/10 transition-all transform group-hover:scale-110" />
                <div className="flex items-center gap-3 text-sm font-semibold text-purple-600 dark:text-purple-400 mb-4 relative z-10">
                  <div className="p-2.5 bg-purple-500/10 rounded-xl shadow-inner"><HardDrive size={20} /></div> Purchased Traffic
                </div>
                <div className="text-4xl font-extrabold text-zinc-900 dark:text-white relative z-10">{formatBytes(a.allTimeTraffic)}</div>
                <div className="mt-3 text-sm text-zinc-500 dark:text-zinc-400 font-medium relative z-10">All-time Allocation</div>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }} className="w-full">
              <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group border-b-4 border-b-amber-500">
                <div className="absolute -right-6 -top-6 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl group-hover:bg-amber-500/20 transition-all"></div>
                <Activity size={80} className="absolute -bottom-4 -right-4 text-amber-500/5 group-hover:text-amber-500/10 transition-all transform group-hover:scale-110" />
                <div className="flex items-center gap-3 text-sm font-semibold text-amber-600 dark:text-amber-400 mb-4 relative z-10">
                  <div className="p-2.5 bg-amber-500/10 rounded-xl shadow-inner"><Activity size={20} /></div> Consumed Traffic
                </div>
                <div className="text-4xl font-extrabold text-zinc-900 dark:text-white relative z-10">{formatBytes(a.usedTraffic || 0)}</div>
                <div className="mt-3 text-sm text-zinc-500 dark:text-zinc-400 font-medium relative z-10">Across all clients</div>
              </div>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.14 }} className="w-full">
              <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group border-b-4 border-b-blue-500">
                <div className="absolute -right-6 -top-6 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-all"></div>
                <HardDrive size={80} className="absolute -bottom-4 -right-4 text-blue-500/5 group-hover:text-blue-500/10 transition-all transform group-hover:scale-110" />
                <div className="flex items-center gap-3 text-sm font-semibold text-blue-600 dark:text-blue-400 mb-4 relative z-10">
                  <div className="p-2.5 bg-blue-500/10 rounded-xl shadow-inner"><HardDrive size={20} /></div> Remaining Traffic
                </div>
                <div className="text-4xl font-extrabold text-zinc-900 dark:text-white relative z-10">{formatBytes(a.availableTraffic)}</div>
                <div className="mt-3 text-sm text-zinc-500 dark:text-zinc-400 font-medium relative z-10">Available balance</div>
              </div>
            </motion.div>
          </>
        ) : (
          <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="w-full">
            <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group border-b-4 border-b-blue-500">
              <div className="absolute -right-6 -top-6 w-32 h-32 bg-blue-500/10 rounded-full blur-3xl group-hover:bg-blue-500/20 transition-all"></div>
              <HardDrive size={80} className="absolute -bottom-4 -right-4 text-blue-500/5 group-hover:text-blue-500/10 transition-all transform group-hover:scale-110" />
              <div className="flex items-center gap-3 text-sm font-semibold text-blue-600 dark:text-blue-400 mb-4 relative z-10">
                <div className="p-2.5 bg-blue-500/10 rounded-xl shadow-inner"><HardDrive size={20} /></div> Available Traffic
              </div>
              <div className="text-4xl font-extrabold text-zinc-900 dark:text-white relative z-10">{formatBytes(a.availableTraffic)}</div>
              <div className="mt-3 text-sm text-zinc-500 dark:text-zinc-400 font-medium relative z-10">Out of {formatBytes(a.allTimeTraffic)}</div>
            </div>
          </motion.div>
        )}

        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }} className="w-full">
          <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group border-b-4 border-b-purple-500">
            <div className="absolute -right-6 -top-6 w-32 h-32 bg-purple-500/10 rounded-full blur-3xl group-hover:bg-purple-500/20 transition-all"></div>
            <Users size={80} className="absolute -bottom-4 -right-4 text-purple-500/5 group-hover:text-purple-500/10 transition-all transform group-hover:scale-110" />
            <div className="flex items-center gap-3 text-sm font-semibold text-purple-600 dark:text-purple-400 mb-4 relative z-10">
              <div className="p-2.5 bg-purple-500/10 rounded-xl shadow-inner"><Users size={20} /></div> Client Capacity
            </div>
            <div className="text-4xl font-extrabold text-zinc-900 dark:text-white relative z-10">{overview.data.clientEmails?.length || 0} / {a.clientCapacity === 0 ? "∞" : a.clientCapacity}</div>
            <div className="mt-3 text-sm text-zinc-500 dark:text-zinc-400 font-medium relative z-10">Total allowed clients</div>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="w-full">
          <div className="relative overflow-hidden rounded-2xl bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 p-6 shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-300 group border-b-4 border-b-amber-500">
            <div className="absolute -right-6 -top-6 w-32 h-32 bg-amber-500/10 rounded-full blur-3xl group-hover:bg-amber-500/20 transition-all"></div>
            <CalendarDays size={80} className="absolute -bottom-4 -right-4 text-amber-500/5 group-hover:text-amber-500/10 transition-all transform group-hover:scale-110" />
            <div className="flex items-center gap-3 text-sm font-semibold text-amber-600 dark:text-amber-400 mb-4 relative z-10">
              <div className="p-2.5 bg-amber-500/10 rounded-xl shadow-inner"><CalendarDays size={20} /></div> Subscription Expiry
            </div>
            <div className="text-4xl font-extrabold text-zinc-900 dark:text-white relative z-10">
              {a.expiryTime > 0 ? (Math.max(0, Math.ceil((a.expiryTime - Date.now()) / (1000 * 60 * 60 * 24))) + " Days") : "Never"}
            </div>
            <div className="mt-3 text-sm text-zinc-500 dark:text-zinc-400 font-medium relative z-10">Until account expiration</div>
          </div>
        </motion.div>
      </div>

      <div className="pt-6">
        <div className="flex items-center gap-2 mb-4">
          <AlertTriangle size={20} className={totalAttentionCount > 0 ? "text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.5)]" : "text-zinc-500"} />
          <h2 className="text-lg font-bold text-zinc-900 dark:text-white">Attention Required</h2>
        </div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }} className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => router.push('/clients?filter=traffic-low')} className="flex flex-col items-start p-5 rounded-2xl bg-gradient-to-br from-amber-500/5 to-amber-600/10 border border-amber-500/20 hover:border-amber-500/40 transition-colors relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><HardDrive size={48} /></div>
            <span className="text-3xl font-extrabold text-amber-600 dark:text-amber-400">{attention.trafficLow}</span>
            <span className="mt-1 font-semibold text-zinc-700 dark:text-zinc-200">Traffic Low</span>
          </motion.button>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => router.push('/clients?filter=expiring-soon')} className="flex flex-col items-start p-5 rounded-2xl bg-gradient-to-br from-orange-500/5 to-orange-600/10 border border-orange-500/20 hover:border-orange-500/40 transition-colors relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><CalendarDays size={48} /></div>
            <span className="text-3xl font-extrabold text-orange-600 dark:text-orange-400">{attention.expiringSoon}</span>
            <span className="mt-1 font-semibold text-zinc-700 dark:text-zinc-200">Expiring Soon</span>
          </motion.button>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => router.push('/clients?filter=disabled')} className="flex flex-col items-start p-5 rounded-2xl bg-gradient-to-br from-zinc-500/5 to-zinc-600/10 border border-zinc-500/20 hover:border-zinc-500/40 transition-colors relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><UserCog size={48} /></div>
            <span className="text-3xl font-extrabold text-zinc-600 dark:text-zinc-400">{attention.disabled}</span>
            <span className="mt-1 font-semibold text-zinc-700 dark:text-zinc-200">Disabled</span>
          </motion.button>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => router.push('/clients?filter=depleted')} className="flex flex-col items-start p-5 rounded-2xl bg-gradient-to-br from-red-500/5 to-red-600/10 border border-red-500/20 hover:border-red-500/40 transition-colors relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10"><AlertTriangle size={48} /></div>
            <span className="text-3xl font-extrabold text-red-600 dark:text-red-400">{attention.depleted}</span>
            <span className="mt-1 font-semibold text-zinc-700 dark:text-zinc-200">Traffic Finished</span>
          </motion.button>
          {cleanupCandidates > 0 && (
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => router.push('/cleanup')} className="flex items-center justify-between p-4 rounded-2xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors col-span-full lg:col-span-2">
              <span className="font-semibold text-red-500 flex items-center gap-2"><ArchiveX size={18} /> Cleanup Candidates</span>
              <span className="text-xl font-bold text-red-400">{cleanupCandidates}</span>
            </motion.button>
          )}
        </motion.div>

        {priorityClients.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} className="bg-white dark:bg-zinc-900 rounded-2xl border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 flex justify-between items-center">
              <h3 className="font-semibold text-zinc-700 dark:text-zinc-200">Highest Priority Clients</h3>
              {totalAttentionCount > 5 && (
                <button onClick={() => router.push('/clients')} className="text-sm text-blue-400 hover:text-blue-300 transition-colors">
                  +{totalAttentionCount - 5} More
                </button>
              )}
            </div>
            <div className="divide-y divide-zinc-800">
              {priorityClients.map((c: any) => (
                <div key={c.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-zinc-100 dark:bg-zinc-800/50 transition-colors">
                  <div>
                    <div className="font-semibold text-zinc-900 dark:text-white">{c.remark || c.email}</div>
                    <div className="flex gap-2 mt-1 flex-wrap">
                      {c.reasons.depleted && <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-red-500/10 text-red-400">Depleted</span>}
                      {c.reasons.expired && <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-red-500/10 text-red-400">Expired</span>}
                      {c.reasons.trafficLow && <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-amber-500/10 text-amber-400">Low Traffic</span>}
                      {c.reasons.expiringSoon && <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-orange-500/10 text-orange-400">Expiring Soon</span>}
                      {c.reasons.disabled && <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold bg-zinc-500/10 text-zinc-500 dark:text-zinc-400">Disabled</span>}
                    </div>
                  </div>
                  <div className="text-left sm:text-right">
                    <div className="text-sm font-mono text-zinc-600 dark:text-zinc-300">{formatBytes(c.used)} / {c.total === 0 ? "∞" : formatBytes(c.total)}</div>
                    <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={() => router.push(`/clients?search=${c.email}`)} className="mt-2 sm:mt-2 text-xs font-semibold text-blue-400 hover:bg-blue-400/10 px-3 py-1 rounded-full transition-colors border border-blue-400/20 sm:border-0">
                      Manage Client
                    </motion.button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
