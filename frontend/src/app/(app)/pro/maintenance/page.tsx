"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, Spinner, Badge } from "@/components/ui";
import { Wrench, ArrowUpCircle, CheckCircle2 } from "lucide-react";

export default function ProMaintenancePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["proMaintenance"],
    queryFn: async () => (await api.get("/pro/maintenance")).data,
  });

  if (isLoading) return <Spinner />;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-3 bg-zinc-100 dark:bg-zinc-800 rounded-lg text-zinc-500">
            <Wrench size={24} />
          </div>
          <div>
            <h3 className="font-bold text-lg">System Maintenance</h3>
            <p className="text-sm text-zinc-500">Track node versions and updates</p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left whitespace-nowrap">
            <thead className="bg-zinc-50 dark:bg-zinc-900 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 uppercase tracking-wider text-xs">
              <tr>
                <th className="px-6 py-3 font-medium">Panel Name</th>
                <th className="px-6 py-3 font-medium">Current Version</th>
                <th className="px-6 py-3 font-medium">Latest Version</th>
                <th className="px-6 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {data?.map((p: any) => (
                <tr key={p.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                  <td className="px-6 py-4 font-semibold">{p.name}</td>
                  <td className="px-6 py-4 font-mono text-xs">{p.currentVersion}</td>
                  <td className="px-6 py-4 font-mono text-xs">{p.latestVersion}</td>
                  <td className="px-6 py-4">
                    {p.needsUpdate ? (
                      <span className="flex items-center gap-1.5 text-blue-500 font-medium">
                        <ArrowUpCircle size={16} /> Update Available
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-emerald-500 font-medium">
                        <CheckCircle2 size={16} /> Up to date
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {data?.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-6 py-8 text-center text-zinc-500">No panels connected.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
