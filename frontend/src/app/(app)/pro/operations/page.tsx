"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Card, Spinner } from "@/components/ui";
import { RefreshCw, Play, Square, DatabaseBackup, ShieldAlert } from "lucide-react";
import { useToast } from "@/components/toast";

export default function ProOperationsPage() {
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);

  const { data: overview, isLoading } = useQuery({
    queryKey: ["proOverview"],
    queryFn: async () => (await api.get("/pro/overview")).data,
  });

  const exec = useMutation({
    mutationFn: async (payload: { action: string, targetPanelId: string | null }) => 
      (await api.post("/pro/operations/execute", payload)).data,
    onSuccess: () => {
      toast("Operation executed successfully. Audit log created.");
      qc.invalidateQueries({ queryKey: ["proOverview"] });
    },
    onError: (e: any) => toast(e.response?.data?.message || "Operation failed", "error")
  });

  if (isLoading) return <Spinner />;

  const executeSafe = (action: string, panelId: string | null, confirmMsg: string) => {
    if (confirm(confirmMsg)) {
      exec.mutate({ action, targetPanelId: panelId });
    }
  };

  return (
    <div className="space-y-6">
      <div className="p-4 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/30 rounded-xl flex items-start gap-3">
        <ShieldAlert className="text-amber-500 shrink-0 mt-0.5" />
        <div>
          <h4 className="font-bold text-amber-800 dark:text-amber-300">Safe Operations Center</h4>
          <p className="text-sm text-amber-700/80 dark:text-amber-400/80 mt-1">
            These operations bypass normal UI restrictions to forcibly correct node states. 
            Every action taken here is recorded in the immutable Audit Log. No arbitrary shell commands are permitted.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card className="p-6">
          <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><RefreshCw size={20}/> Global Operations</h3>
          <div className="space-y-3">
            <button 
              onClick={() => executeSafe('RUN_SYNC', null, 'Force global sync on all connected panels?')}
              disabled={exec.isPending}
              className="w-full py-3 px-4 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl font-medium text-sm flex items-center justify-between transition-colors"
            >
              <span>Force Synchronize All Panels</span>
              <RefreshCw size={16} className="text-zinc-500" />
            </button>
            <button 
              onClick={() => executeSafe('CREATE_BACKUP', null, 'Trigger manual global backup?')}
              disabled={exec.isPending}
              className="w-full py-3 px-4 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded-xl font-medium text-sm flex items-center justify-between transition-colors"
            >
              <span>Trigger Global Backup Now</span>
              <DatabaseBackup size={16} className="text-zinc-500" />
            </button>
          </div>
        </Card>

        {overview?.panels?.map((p: any) => (
          <Card key={p.id} className="p-6">
            <div className="flex justify-between items-start mb-4">
              <h3 className="font-bold text-lg">{p.name}</h3>
              <div className="text-xs text-zinc-500 font-mono">{p.panelStatus}</div>
            </div>
            
            <div className="grid grid-cols-2 gap-3">
              <button 
                onClick={() => executeSafe('RESTART_XRAY', p.id, `Restart Xray Core on ${p.name}?`)}
                disabled={exec.isPending || p.panelStatus === 'offline'}
                className="py-2.5 px-3 bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-500/20 rounded-lg font-medium text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                <RefreshCw size={14} /> Restart Xray
              </button>
              
              <button 
                onClick={() => executeSafe('STOP_XRAY', p.id, `DANGER: Stop Xray Core on ${p.name}? All connections will drop.`)}
                disabled={exec.isPending || p.panelStatus === 'offline'}
                className="py-2.5 px-3 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20 rounded-lg font-medium text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
              >
                <Square size={14} /> Stop Xray
              </button>

              <button 
                onClick={() => executeSafe('RESTART_PANEL', p.id, `Restart 3x-ui Panel on ${p.name}? Note: Panel will be temporarily unreachable.`)}
                disabled={exec.isPending || p.panelStatus === 'offline'}
                className="py-2.5 px-3 bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-100 dark:hover:bg-amber-500/20 rounded-lg font-medium text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-50 col-span-2"
              >
                <RefreshCw size={14} /> Restart Panel Process
              </button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
