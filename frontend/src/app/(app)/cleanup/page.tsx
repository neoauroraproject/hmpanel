"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArchiveX, Search, Trash2, AlertTriangle, ShieldAlert } from "lucide-react";
import { api } from "@/lib/api";
import { Card, PageHeader, Spinner, ErrorBox, Badge } from "@/components/ui";
import { useToast } from "@/components/toast";
import { formatBytes } from "@/lib/format";
import { motion } from "framer-motion";

export default function CleanupPage() {
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isWarningOpen, setIsWarningOpen] = useState(false);

  const { data: clients, isLoading, error } = useQuery({
    queryKey: ["cleanup-candidates"],
    queryFn: async () => (await api.get<any[]>("/clients/cleanup-candidates")).data,
  });

  const cleanupMutation = useMutation({
    mutationFn: async (ids: string[]) => (await api.post("/clients/bulk", { ids, action: "cleanup" })).data,
    onSuccess: (data) => {
      toast(`Successfully cleaned up ${data.affected} clients.`);
      setSelectedIds([]);
      setIsWarningOpen(false);
      qc.invalidateQueries({ queryKey: ["cleanup-candidates"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
      qc.invalidateQueries({ queryKey: ["reseller-overview"] });
    },
    onError: () => {
      toast("Failed to cleanup clients", "error");
      setIsWarningOpen(false);
    },
  });

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message="Failed to load cleanup candidates" />;

  const filtered = (clients || []).filter((c) =>
    c.email.toLowerCase().includes(search.toLowerCase()) ||
    c.remark?.toLowerCase().includes(search.toLowerCase())
  );

  const toggleAll = () => {
    if (selectedIds.length === filtered.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filtered.map((c) => c.id));
    }
  };

  const toggleOne = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter((x) => x !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
      <PageHeader
        title="Cleanup Candidates"
        subtitle="Manage long-expired clients eligible for permanent archival"
      />

      <div className="mb-6 rounded-xl border border-red-500/20 bg-red-500/5 p-4 flex gap-4">
        <div className="mt-1">
          <ShieldAlert className="text-red-500" size={24} />
        </div>
        <div>
          <h3 className="font-bold text-red-600 dark:text-red-400">Strict Archival Policy</h3>
          <p className="mt-1 text-sm text-red-600/80 dark:text-red-400/80">
            Deleting clients from this page is a <strong>permanent archival action</strong>. It will remove the client from the 3x-ui Panel API and the local database. 
            <br />
            <strong>No traffic refunds will be issued</strong> to the Reseller's balance. This feature strictly targets abandoned clients.
          </p>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 p-4 border-b border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
            <input
              type="text"
              placeholder="Search username or remark..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 py-2 pl-9 pr-4 text-sm text-zinc-900 dark:text-zinc-100 outline-none transition-colors focus:border-blue-500"
            />
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {selectedIds.length > 0 && (
              <button
                onClick={() => setIsWarningOpen(true)}
                className="flex flex-1 sm:flex-none items-center justify-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 transition-colors"
              >
                <Trash2 size={16} />
                Cleanup Selected ({selectedIds.length})
              </button>
            )}
          </div>
        </div>

        <div className="w-full overflow-x-auto">
          <table className="w-full text-left text-sm text-zinc-600 dark:text-zinc-300 min-w-[800px]">
            <thead className="bg-zinc-50 dark:bg-zinc-900/50 text-xs uppercase text-zinc-500 dark:text-zinc-400 border-b border-zinc-200 dark:border-zinc-800">
              <tr>
                <th className="px-4 py-3 w-10">
                  <input
                    type="checkbox"
                    checked={filtered.length > 0 && selectedIds.length === filtered.length}
                    onChange={toggleAll}
                    className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </th>
                <th className="px-4 py-3">Client</th>
                <th className="px-4 py-3">Owner</th>
                <th className="px-4 py-3">Panel & Inbound</th>
                <th className="px-4 py-3">Traffic (Used / Total)</th>
                <th className="px-4 py-3">Expired Since</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800 bg-white dark:bg-zinc-950">
              {filtered.map((c) => {
                const used = Number(c.up) + Number(c.down);
                const expiredDays = Math.floor((Date.now() - Number(c.expiryTime)) / (1000 * 60 * 60 * 24));
                
                return (
                  <tr key={c.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-900/50 transition-colors">
                    <td className="px-4 py-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(c.id)}
                        onChange={() => toggleOne(c.id)}
                        className="rounded border-zinc-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                      />
                    </td>
                    <td className="px-4 py-4">
                      <div className="font-medium text-zinc-900 dark:text-zinc-100">{c.email}</div>
                      {c.remark && <div className="text-xs text-zinc-500 mt-0.5">{c.remark}</div>}
                    </td>
                    <td className="px-4 py-4">
                      <Badge tone={c.admin ? "blue" : "zinc"}>{c.admin ? c.admin.username : "Orphaned"}</Badge>
                    </td>
                    <td className="px-4 py-4 text-xs">
                      <div className="font-medium text-zinc-700 dark:text-zinc-300">{c.inbound?.panel?.name}</div>
                      <div className="text-zinc-500 mt-0.5">{c.inbound?.tag}</div>
                    </td>
                    <td className="px-4 py-4 text-xs font-mono">
                      <span className="text-zinc-800 dark:text-zinc-200">{formatBytes(used)}</span>
                      <span className="text-zinc-400 mx-1">/</span>
                      <span className="text-zinc-500">{c.total == 0 ? "∞" : formatBytes(Number(c.total))}</span>
                    </td>
                    <td className="px-4 py-4">
                      <Badge tone="red">{expiredDays} Days Ago</Badge>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-zinc-500">
                    <div className="flex flex-col items-center justify-center">
                      <ArchiveX size={32} className="mb-3 text-zinc-400 dark:text-zinc-600" />
                      <p>No cleanup candidates found.</p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {isWarningOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-zinc-900 p-6 shadow-2xl border border-zinc-200 dark:border-zinc-800"
          >
            <div className="flex items-center gap-3 text-red-500 mb-4">
              <AlertTriangle size={24} />
              <h2 className="text-xl font-bold">Confirm Archival Cleanup</h2>
            </div>
            
            <p className="text-zinc-600 dark:text-zinc-300 mb-4 text-sm leading-relaxed">
              You are about to permanently delete <strong>{selectedIds.length}</strong> client(s).
              <br /><br />
              This action will completely remove them from the target panels and local database. <strong>No traffic refunds will be returned</strong> to the owning resellers.
            </p>

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => setIsWarningOpen(false)}
                disabled={cleanupMutation.isPending}
                className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => cleanupMutation.mutate(selectedIds)}
                disabled={cleanupMutation.isPending}
                className="flex items-center gap-2 rounded-lg bg-red-500 px-4 py-2 text-sm font-medium text-white hover:bg-red-600 transition-colors disabled:opacity-50"
              >
                {cleanupMutation.isPending ? <Spinner className="w-4 h-4" /> : <Trash2 size={16} />}
                Confirm Deletion
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
