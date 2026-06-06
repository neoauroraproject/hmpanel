"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, Spinner, Badge } from "@/components/ui";
import { AlertTriangle, Info, ShieldAlert, CheckCircle2 } from "lucide-react";
import { formatDateTime } from "@/lib/format";

export default function ProIncidentsPage() {
  const { data: incidents, isLoading } = useQuery({
    queryKey: ["proIncidents"],
    queryFn: async () => (await api.get("/pro/incidents")).data,
    refetchInterval: 10000,
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="space-y-6">
      <Card className="p-0 overflow-hidden">
        <div className="p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50/50 dark:bg-zinc-900/50 flex justify-between items-center">
          <h3 className="font-bold">Incident Timeline</h3>
          <span className="text-sm text-zinc-500">Last 100 incidents</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 uppercase tracking-wider text-xs">
              <tr>
                <th className="px-6 py-3 font-medium">Time Detected</th>
                <th className="px-6 py-3 font-medium">Severity</th>
                <th className="px-6 py-3 font-medium">Panel</th>
                <th className="px-6 py-3 font-medium">Type</th>
                <th className="px-6 py-3 font-medium">Status</th>
                <th className="px-6 py-3 font-medium text-right">Resolved At</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {incidents?.map((inc: any) => (
                <tr key={inc.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                  <td className="px-6 py-4 text-zinc-500 whitespace-nowrap">
                    {formatDateTime(inc.detectedAt)}
                  </td>
                  <td className="px-6 py-4">
                    {inc.severity === 'CRITICAL' ? (
                      <span className="flex items-center gap-1 text-red-500 font-medium"><ShieldAlert size={14}/> Critical</span>
                    ) : inc.severity === 'WARNING' ? (
                      <span className="flex items-center gap-1 text-amber-500 font-medium"><AlertTriangle size={14}/> Warning</span>
                    ) : (
                      <span className="flex items-center gap-1 text-blue-500 font-medium"><Info size={14}/> Info</span>
                    )}
                  </td>
                  <td className="px-6 py-4 font-medium">
                    {inc.panel?.name || 'GLOBAL SYSTEM'}
                  </td>
                  <td className="px-6 py-4 font-mono text-xs">
                    {inc.type}
                  </td>
                  <td className="px-6 py-4">
                    {inc.status === 'ACTIVE' ? (
                      <Badge tone="red">Active</Badge>
                    ) : (
                      <Badge tone="green">Resolved</Badge>
                    )}
                  </td>
                  <td className="px-6 py-4 text-right text-zinc-500 whitespace-nowrap">
                    {inc.resolvedAt ? formatDateTime(inc.resolvedAt) : '-'}
                  </td>
                </tr>
              ))}
              {incidents?.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-zinc-500 flex flex-col items-center justify-center gap-2">
                    <CheckCircle2 size={32} className="text-emerald-500" />
                    <span>No incidents recorded. System is perfectly healthy!</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
