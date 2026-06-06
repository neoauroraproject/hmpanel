"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useLicense } from "@/hooks/useLicense";
import { Globe, Plus, Trash2, ShieldCheck, ShieldAlert, Loader2, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui";
import { useToast } from "@/components/toast";

interface Domain {
  id: string;
  domain: string;
  type: string;
  status: string;
  sslMethod: string | null;
  admin?: { username: string };
  createdAt: string;
}

export default function DomainsPage() {
  const { hasFeature, isLoading: licLoading } = useLicense();
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);
  const [newDomain, setNewDomain] = useState("");
  const [newType, setNewType] = useState("PORTAL");

  const { data: domains = [], isLoading } = useQuery({
    queryKey: ["domains"],
    queryFn: async () => (await api.get<Domain[]>("/domains")).data,
    enabled: hasFeature("CUSTOM_DOMAINS"),
  });

  const addM = useMutation({
    mutationFn: async () => await api.post("/domains", { domain: newDomain, type: newType }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domains"] });
      setNewDomain("");
      toast("Domain added successfully", "success");
    },
    onError: (e: any) => toast(e.response?.data?.message || "Failed to add domain", "error"),
  });

  const delM = useMutation({
    mutationFn: async (id: string) => await api.delete(`/domains/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domains"] });
      toast("Domain deleted", "success");
    },
    onError: () => toast("Failed to delete domain", "error"),
  });

  const verifyM = useMutation({
    mutationFn: async (id: string) => await api.post(`/domains/${id}/verify`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["domains"] });
      toast("SSL Verification completed", "success");
    },
    onError: () => toast("SSL Verification failed", "error"),
  });

  if (licLoading || isLoading) return <div className="p-8 flex justify-center"><Loader2 className="animate-spin text-zinc-400" /></div>;

  if (!hasFeature("CUSTOM_DOMAINS")) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-zinc-500">
        <Globe size={48} className="mb-4 opacity-50" />
        <h2 className="text-xl font-semibold mb-2 text-zinc-800 dark:text-zinc-200">Feature Not Available</h2>
        <p>Custom Domains require a Premium License.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
          <Globe className="text-blue-500" />
          Custom Domains
        </h1>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">Manage portal and subscription domains with automated SSL.</p>
      </div>

      <Card className="p-6">
        <h2 className="text-lg font-medium mb-4 text-zinc-800 dark:text-zinc-100">Add New Domain</h2>
        <div className="flex flex-col sm:flex-row gap-4 items-end">
          <div className="flex-1 space-y-2">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Domain Name</label>
            <input 
              placeholder="e.g. portal.example.com" 
              value={newDomain} 
              onChange={(e) => setNewDomain(e.target.value)} 
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors"
            />
          </div>
          <div className="w-full sm:w-48 space-y-2">
            <label className="text-sm font-medium text-zinc-700 dark:text-zinc-300">Type</label>
            <select 
              value={newType} 
              onChange={(e) => setNewType(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors"
            >
              <option value="PORTAL">Portal</option>
              <option value="SUBSCRIPTION">Subscription</option>
              <option value="BRAND">Brand</option>
            </select>
          </div>
          <button 
            onClick={() => addM.mutate()} 
            disabled={addM.isPending || !newDomain}
            className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors"
          >
            {addM.isPending ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
            Add Domain
          </button>
        </div>
      </Card>

      <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-xl overflow-hidden">
        <table className="w-full text-sm text-left">
          <thead className="bg-zinc-50 dark:bg-zinc-950 border-b border-zinc-200 dark:border-zinc-800 text-zinc-500 dark:text-zinc-400">
            <tr>
              <th className="px-6 py-4 font-medium">Domain</th>
              <th className="px-6 py-4 font-medium">Type</th>
              <th className="px-6 py-4 font-medium">Status</th>
              <th className="px-6 py-4 font-medium">Admin</th>
              <th className="px-6 py-4 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
            {domains.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-6 py-8 text-center text-zinc-500">No domains configured</td>
              </tr>
            ) : domains.map((d) => (
              <tr key={d.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors">
                <td className="px-6 py-4 font-medium text-zinc-900 dark:text-zinc-100">{d.domain}</td>
                <td className="px-6 py-4 text-zinc-500">{d.type}</td>
                <td className="px-6 py-4">
                  <div className="flex items-center gap-1.5">
                    {d.status === 'SSL_ACTIVE' ? (
                      <span className="flex items-center gap-1 text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded-md text-xs font-medium">
                        <ShieldCheck size={14} /> SSL Active
                      </span>
                    ) : d.status === 'SSL_FAILED' ? (
                      <span className="flex items-center gap-1 text-red-500 bg-red-500/10 px-2 py-1 rounded-md text-xs font-medium">
                        <ShieldAlert size={14} /> Failed
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-amber-500 bg-amber-500/10 px-2 py-1 rounded-md text-xs font-medium">
                        <Loader2 size={14} className="animate-spin" /> Pending
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-6 py-4 text-zinc-500">{d.admin?.username || 'Global'}</td>
                <td className="px-6 py-4 text-right space-x-2">
                  <button 
                    onClick={() => verifyM.mutate(d.id)}
                    disabled={verifyM.isPending || d.status === 'SSL_ACTIVE'}
                    className="inline-flex items-center justify-center p-2 rounded-md text-blue-500 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-500/10 disabled:opacity-50 transition-colors"
                  >
                    <RefreshCw size={16} className={verifyM.isPending && verifyM.variables === d.id ? "animate-spin" : ""} />
                  </button>
                  <button 
                    onClick={() => {
                      if(confirm('Are you sure you want to delete this domain?')) {
                        delM.mutate(d.id);
                      }
                    }}
                    className="inline-flex items-center justify-center p-2 rounded-md text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10 disabled:opacity-50 transition-colors"
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
