"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, Spinner } from "@/components/ui";
import { Server, Cpu, HardDrive, Users, CheckCircle, XCircle, AlertCircle } from "lucide-react";
import { formatBytes } from "@/lib/format";

export default function ProOverviewPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["proOverview"],
    queryFn: async () => (await api.get("/pro/overview")).data,
    refetchInterval: 10000,
  });

  if (isLoading) return <Spinner />;

  const { global, panels } = data;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 flex items-center gap-4 border-l-4 border-l-blue-500">
          <div className="p-3 bg-blue-500/10 text-blue-500 rounded-lg">
            <Server size={24} />
          </div>
          <div>
            <div className="text-2xl font-bold">{global.activePanels} / {global.totalPanels}</div>
            <div className="text-sm text-zinc-500">Panels Online</div>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4 border-l-4 border-l-emerald-500">
          <div className="p-3 bg-emerald-500/10 text-emerald-500 rounded-lg">
            <Users size={24} />
          </div>
          <div>
            <div className="text-2xl font-bold">{global.totalOnline}</div>
            <div className="text-sm text-zinc-500">Global Online Users</div>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4 border-l-4 border-l-amber-500">
          <div className="p-3 bg-amber-500/10 text-amber-500 rounded-lg">
            <Cpu size={24} />
          </div>
          <div>
            <div className="text-2xl font-bold">{global.avgCpu.toFixed(1)}%</div>
            <div className="text-sm text-zinc-500">Avg CPU Usage</div>
          </div>
        </Card>
        <Card className="p-4 flex items-center gap-4 border-l-4 border-l-purple-500">
          <div className="p-3 bg-purple-500/10 text-purple-500 rounded-lg">
            <HardDrive size={24} />
          </div>
          <div>
            <div className="text-2xl font-bold">{global.avgRam.toFixed(1)}%</div>
            <div className="text-sm text-zinc-500">Avg RAM Usage</div>
          </div>
        </Card>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 uppercase tracking-wider text-xs">
              <tr>
                <th className="px-6 py-3 font-medium">Panel</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium">Xray State</th>
                <th className="px-6 py-3 font-medium">Uptime</th>
                <th className="px-6 py-3 font-medium">Version</th>
                <th className="px-6 py-3 font-medium">Resources</th>
                <th className="px-6 py-3 font-medium text-right">Online</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {panels.map((p: any) => (
                <tr key={p.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                  <td className="px-6 py-4 font-semibold">{p.name}</td>
                  <td className="px-6 py-4">
                    {p.panelStatus === 'online' ? (
                      <span className="flex items-center gap-1.5 text-emerald-500"><CheckCircle size={16}/> Online</span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-red-500"><XCircle size={16}/> Offline</span>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {p.xrayStatus === 'running' ? (
                      <span className="text-emerald-500">Running</span>
                    ) : (
                      <span className="text-amber-500 flex items-center gap-1"><AlertCircle size={14}/> {p.xrayStatus}</span>
                    )}
                  </td>
                  <td className="px-6 py-4 text-zinc-500">{p.uptime}</td>
                  <td className="px-6 py-4 text-zinc-500 font-mono text-xs">{p.version}</td>
                  <td className="px-6 py-4">
                    <div className="flex gap-3 text-xs text-zinc-500">
                      <span>CPU: {p.cpu.toFixed(0)}%</span>
                      <span>RAM: {p.ram.toFixed(0)}%</span>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right font-medium">
                    {p.onlineUsers}
                  </td>
                </tr>
              ))}
              {panels.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-6 py-8 text-center text-zinc-500">No panels connected.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
