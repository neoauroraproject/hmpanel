"use client";

import React, { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatBytes, formatDate } from "@/lib/format";
import { Card, PageHeader, Badge, Spinner, ErrorBox } from "@/components/ui";
import { useToast } from "@/components/toast";
import { Plus, Power, Edit2, Shield, Activity, HardDrive, Cpu, CreditCard, ChevronDown, Check, X, ShieldCheck, Download, Upload, Trash2, Eye, EyeOff, Server, Database, Save, ArrowRight, Store, Users, Clock, Settings2, Zap, Lock, AlertCircle } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface Admin {
  id: string;
  username: string;
  email: string;
  role: string;
  status: string;
  balance: number; // Bytes. 0 = No Traffic Available
  trafficMode: string;
  expiryTime: number; // ms. 0 = Unlimited
  maxClients: number; // 0 = Unlimited
  permissions: string[];
  totalAssigned?: number;
  usedTraffic: number;
  remainingBalance?: number;
  createdAt: string;
  _count: { clients: number };
  adminInbounds?: { inbound: any }[];
  storeEnabled?: boolean;
}

interface InboundRow {
  id: string;
  tag: string;
  port: number;
  protocol: string;
  panel: { id: string; name: string };
}

interface PanelRow {
  id: string;
  name: string;
  url: string;
  version: string;
  status: string;
}

const MOTION_CONFIG = {
  page: { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.2, ease: "easeOut" as any } },
  modalOverlay: { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.15 } },
  modalContent: { initial: { opacity: 0, scale: 0.95, y: 10 }, animate: { opacity: 1, scale: 1, y: 0 }, exit: { opacity: 0, scale: 0.95, y: 10 }, transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] as any } },
  row: { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.2 } },
};

export default function AdminsPage() {
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);
  const [addOpen, setAddOpen] = useState(false);
  const [editAdmin, setEditAdmin] = useState<Admin | null>(null);
  
  const [activeTab, setActiveTab] = useState<'active' | 'disabled'>('active');
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, error } = useQuery({
    queryKey: ["admins", activeTab, debouncedSearch],
    queryFn: async () => {
      const q = new URLSearchParams({
        limit: "100",
        status: activeTab,
        ...(debouncedSearch ? { search: debouncedSearch } : {})
      });
      return (await api.get<{ data: Admin[] }>(`/admins?${q.toString()}`)).data;
    },
  });

  const quickAction = useMutation({
    mutationFn: async ({ id, payload }: { id: string, payload: any }) => {
      if (payload.delete) {
        return (await api.delete(`/admins/${id}`)).data;
      }
      return (await api.patch(`/admins/${id}`, payload)).data;
    },
    onSuccess: () => {
      toast("Admin action successful");
      qc.invalidateQueries({ queryKey: ["admins"] });
    },
    onError: () => toast("Action failed", "error"),
  });

  const handleQuickAction = (admin: Admin, type: 'traffic' | 'expiry' | 'clients', amount: number) => {
    const payload: any = {};
    if (type === 'traffic') {
      payload.balance = admin.balance + Math.round(amount * 1024 * 1024 * 1024);
    } else if (type === 'expiry') {
      const currentExp = admin.expiryTime === 0 ? Date.now() : admin.expiryTime;
      payload.expiryTime = currentExp + amount * 24 * 60 * 60 * 1000;
    } else if (type === 'clients') {
      payload.maxClients = admin.maxClients + amount;
    }
    quickAction.mutate({ id: admin.id, payload });
  };

  const [expandedAdminId, setExpandedAdminId] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("add") === "1") {
      setAddOpen(true);
    }
  }, []);

  const toggleStatus = (admin: Admin) => {
    quickAction.mutate({ id: admin.id, payload: { status: admin.status === 'active' ? 'disabled' : 'active' } });
  };

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message="Failed to load admins" />;

  const admins = data?.data ?? [];

  return (
    <motion.div {...MOTION_CONFIG.page}>
      <PageHeader
        title="Admins"
        subtitle="Platform operators and resellers with quick operation actions"
        action={
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 shadow-sm"
          >
            <Plus size={16} /> Add Admin
          </motion.button>
        }
      />

      <div className="mb-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex bg-white dark:bg-zinc-900/50 p-1 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'active' ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:text-zinc-200'
            }`}
          >
            Active Admins
          </button>
          <button
            onClick={() => setActiveTab('disabled')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'disabled' ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:text-zinc-200'
            }`}
          >
            Disabled Admins
          </button>
        </div>

        <div className="w-full sm:w-64 relative">
          <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none">
            <svg className="h-4 w-4 text-zinc-500 dark:text-zinc-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search admins..."
            className="w-full bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-lg pl-9 pr-4 py-2 text-sm text-zinc-800 dark:text-zinc-100 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      <Card className="overflow-x-auto p-0 shadow-lg border-transparent md:border-zinc-200 dark:border-zinc-800/50 bg-transparent md:bg-zinc-50 dark:bg-zinc-950">
        <table className="w-full text-sm block md:table">
          <thead className="hidden md:table-header-group">
            <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-xs uppercase tracking-wide text-zinc-500 bg-white dark:bg-zinc-900/50">
              <th className="px-4 py-3 font-medium">Admin</th>
              <th className="px-4 py-3 font-medium">Status</th>
              <th className="px-4 py-3 font-medium">Traffic (Left / Total)</th>
              <th className="px-4 py-3 font-medium">Clients (Left / Total)</th>
              <th className="px-4 py-3 font-medium">Expiry</th>
              <th className="px-4 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="block md:table-row-group space-y-3 md:space-y-0 md:divide-y md:divide-zinc-800/50">
            {admins.map((a, i) => {
              const isExpanded = expandedAdminId === a.id;
              return (
              <React.Fragment key={a.id}>
              <motion.tr 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: i * 0.03 }}
                className={`block md:table-row group border border-zinc-200 dark:border-zinc-800 md:border-none rounded-xl md:rounded-none bg-zinc-50 dark:bg-zinc-950 md:bg-transparent last:border-0 hover:bg-white dark:bg-zinc-900/30 transition-colors cursor-pointer ${
                  isExpanded ? "bg-white dark:bg-zinc-900/20" : ""
                }`}
                onClick={() => setExpandedAdminId(isExpanded ? null : a.id)}
              >
                <td className="block md:table-cell px-4 py-3">
                  <div className="flex justify-between items-center md:block">
                    <div>
                      <div className="font-semibold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
                        {a.username}
                      </div>
                      <div className="text-xs text-zinc-500">{a.role === "SUPER_ADMIN" ? "Super Admin" : "Reseller"}</div>
                    </div>
                    <div className="md:hidden">
                      <Badge tone={a.status === "active" ? "green" : a.status === "suspended" ? "amber" : "red"}>
                        {a.status}
                      </Badge>
                    </div>
                  </div>
                </td>
                <td className="hidden md:table-cell px-4 py-3">
                  <Badge tone={a.status === "active" ? "green" : a.status === "suspended" ? "amber" : "red"}>
                    {a.status}
                  </Badge>
                </td>
                <td className="block md:table-cell px-4 py-2 md:py-3 border-t border-zinc-200 dark:border-zinc-800/50 md:border-0 mt-2 md:mt-0">
                  <div className="md:hidden text-[10px] uppercase text-zinc-500 font-semibold mb-1 tracking-wider">Traffic Status</div>
                  {a.role === "SUPER_ADMIN" ? <span className="text-zinc-600">—</span> : (
                    <div className="text-xs">
                      {a.trafficMode === 'USAGE' ? (
                        <>
                          <div className="font-medium text-blue-400">
                            {a.balance > 0 ? `${formatBytes(a.balance)} left` : <span className="text-red-400">Exhausted</span>}
                          </div>
                          <div className="text-zinc-500">Used: {formatBytes(a.usedTraffic || 0)} (Usage mode)</div>
                        </>
                      ) : (
                        <>
                          <div className="font-medium text-blue-400">
                            {a.balance === 0 ? "Unlimited" : `${formatBytes(Math.max(0, a.balance - (a.usedTraffic || 0)))} left`}
                          </div>
                          <div className="text-zinc-500">out of {a.balance === 0 ? "∞" : formatBytes(a.balance)}</div>
                        </>
                      )}
                    </div>
                  )}
                </td>
                <td className="block md:table-cell px-4 py-2 md:py-3 text-zinc-600 dark:text-zinc-300">
                  <div className="md:hidden text-[10px] uppercase text-zinc-500 font-semibold mb-1 tracking-wider">Clients Limit</div>
                  {a.role === "SUPER_ADMIN" ? <span className="text-zinc-600">—</span> : (
                    <div className="text-xs">
                      <div className="font-medium text-purple-400">
                        {a.maxClients === 0 ? "Unlimited" : `${Math.max(0, a.maxClients - (a._count?.clients ?? 0))} left`}
                      </div>
                      <div className="text-zinc-500">out of {a.maxClients === 0 ? "∞" : a.maxClients}</div>
                    </div>
                  )}
                </td>
                <td className="block md:table-cell px-4 py-2 md:py-3 text-zinc-600 dark:text-zinc-300">
                  <div className="md:hidden text-[10px] uppercase text-zinc-500 font-semibold mb-1 tracking-wider">Expiry</div>
                  {a.role === "SUPER_ADMIN" ? <span className="text-zinc-600">—</span> : (
                    <div className="text-xs">
                      <div className={`font-medium ${a.expiryTime === 0 ? 'text-emerald-400' : a.expiryTime > Date.now() ? 'text-emerald-400' : 'text-red-400'}`}>
                        {a.expiryTime === 0 
                          ? "Never" 
                          : a.expiryTime > Date.now() 
                            ? `${Math.ceil((a.expiryTime - Date.now()) / (1000 * 60 * 60 * 24))} Days Remaining` 
                            : `Expired ${Math.floor((Date.now() - a.expiryTime) / (1000 * 60 * 60 * 24))} days ago`}
                      </div>
                      <div className="text-zinc-500">{a.expiryTime === 0 ? "Unlimited" : formatDate(new Date(a.expiryTime).toISOString())}</div>
                    </div>
                  )}
                </td>

                <td className="block md:table-cell px-4 py-3 border-t border-zinc-200 dark:border-zinc-800/50 md:border-0 mt-2 md:mt-0 transition-all duration-300 text-right" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-start md:justify-end gap-1.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex-wrap w-full">
                    {a.role !== "SUPER_ADMIN" && (
                      <motion.button 
                        whileHover={{ scale: 1.05 }} 
                        whileTap={{ scale: 0.95 }} 
                        onClick={() => toggleStatus(a)} 
                        className={`p-2 rounded-lg transition-colors ${a.status === 'active' ? 'text-emerald-400 hover:bg-emerald-400/10' : 'text-zinc-500 hover:bg-zinc-100 dark:bg-zinc-800'}`}
                        title={a.status === 'active' ? "Disable Admin" : "Enable Admin"}
                      >
                        <Power size={16} />
                      </motion.button>
                    )}
                    
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setEditAdmin(a)}
                      className="p-2 text-amber-400 hover:bg-amber-400/10 rounded-lg transition-colors"
                      title="Edit Admin"
                    >
                      <Edit2 size={16} />
                    </motion.button>

                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      disabled={(a._count?.clients ?? 0) > 0}
                      onClick={() => {
                        if (confirm(`Delete admin ${a.username}?`)) {
                          quickAction.mutate({ id: a.id, payload: { delete: true } }); 
                        }
                      }}
                      className={`p-2 rounded-lg transition-colors ${(a._count?.clients ?? 0) > 0 ? "text-zinc-600 cursor-not-allowed" : "text-red-400 hover:bg-red-400/10"}`}
                      title={(a._count?.clients ?? 0) > 0 ? "Cannot delete admin with active clients" : "Delete Admin"}
                    >
                      <Trash2 size={16} />
                    </motion.button>
                  </div>
                </td>
              </motion.tr>
              </React.Fragment>
            );
            })}
            {admins.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-zinc-500">No admins found.</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <AnimatePresence>
        {addOpen && (
          <AddAdminModal
            onClose={() => setAddOpen(false)}
            onSaved={() => {
              setAddOpen(false);
              qc.invalidateQueries({ queryKey: ["admins"] });
            }}
          />
        )}

        {editAdmin && (
          <EditAdminModal
            adminId={editAdmin.id}
            onClose={() => setEditAdmin(null)}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["admins"] });
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function AddAdminModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const toast = useToast((s) => s.push);
  const [openSection, setOpenSection] = useState("basic");
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    username: "",
    password: "",
    status: "active",
    trafficMode: "ALLOCATION",
    balanceGb: "",
    expiryDays: "",
    maxClients: "",
    selectedPanel: "",
    selectedInbounds: [] as string[],
    canCustomizeBranding: true,
    storeEnabled: false,
    storePanelId: "",
  });

  const { data: inbounds, isLoading: inboundsLoading } = useQuery<InboundRow[]>({
    queryKey: ["inbounds", form.selectedPanel],
    queryFn: async () => form.selectedPanel ? (await api.get<InboundRow[]>(`/panels/${form.selectedPanel}/inbounds`)).data : [],
    enabled: !!form.selectedPanel,
  });

  const { data: panels } = useQuery<PanelRow[]>({
    queryKey: ["panels"],
    queryFn: async () => (await api.get<PanelRow[]>("/panels")).data,
  });

  const create = useMutation({
    mutationFn: async () => {
      const payload: any = {
        username: form.username,
        email: form.username + "@panel.local",
        password: form.password,
        role: "RESELLER",
        status: form.status,
        trafficMode: form.trafficMode,
        balance: form.balanceGb ? Math.round(Number(form.balanceGb) * 1024 * 1024 * 1024) : 0,
        expiryTime: form.expiryDays ? Date.now() + Number(form.expiryDays) * 24 * 60 * 60 * 1000 : 0,
        maxClients: form.maxClients ? Number(form.maxClients) : 0,
        inboundIds: form.selectedInbounds,
        permissions: [],
        storeEnabled: form.storeEnabled,
        storePanelId: form.storePanelId,
      };
      return (await api.post("/admins", payload)).data;
    },
    onSuccess: () => {
      toast("Admin created successfully");
      onSaved();
    },
    onError: () => toast("Failed to create admin", "error"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.username || !form.password) return toast("Username and Password are required", "error");
    if (form.password.length < 8) return toast("Password must be at least 8 characters", "error");
    if (!form.selectedPanel) return toast("Panel selection is required", "error");
    create.mutate();
  };

  const filteredInbounds = (inbounds ?? []).filter(i => i.panel.id === form.selectedPanel);

  return (
    <motion.div {...MOTION_CONFIG.modalOverlay} className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-black/60 pt-[10dvh] px-4 sm:pt-0 sm:p-4 backdrop-blur-sm">
      <motion.div {...MOTION_CONFIG.modalContent} className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-950/30">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <Shield size={20} className="text-blue-500" /> Add Admin (Reseller)
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-600 dark:text-zinc-300 transition-colors"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto flex-1">

        <form onSubmit={handleSubmit} className="p-6">
          <motion.div layout className="space-y-4">
            
            {/* Section A: Basic Info */}
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 overflow-hidden">
              <button type="button" onClick={() => setOpenSection(openSection === 'basic' ? '' : 'basic')} className="w-full flex items-center justify-between p-4 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:bg-zinc-800/80 transition-colors">
                <div className="flex items-center gap-2 font-medium text-zinc-800 dark:text-zinc-100"><Shield size={16} className="text-blue-400"/> Basic Information</div>
                <ChevronDown size={18} className={`text-zinc-500 transition-transform ${openSection === 'basic' ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence initial={false}>
                {openSection === 'basic' && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="p-4 grid grid-cols-2 gap-4 border-t border-zinc-200 dark:border-zinc-800">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">Username</label>
                        <input type="text" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/50 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors" />
                      </div>
                      <div className="relative">
                        <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">Password</label>
                        <input type={showPassword ? "text" : "password"} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/50 pl-3 pr-10 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors" />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-[28px] text-zinc-500 hover:text-zinc-600 dark:text-zinc-300">
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      <div className="col-span-2">
                        <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">Select Panel Node</label>
                        <select required value={form.selectedPanel} onChange={(e) => setForm({ ...form, selectedPanel: e.target.value, selectedInbounds: [] })} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/50 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors">
                          <option value="" disabled>Choose a panel...</option>
                          {(panels ?? []).map(p => (
                            <option key={p.id} value={p.id} disabled={p.status !== 'online'}>
                              {p.name} ({p.status === 'online' ? `v${p.version}` : 'Offline'})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Section B: Permissions */}
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 overflow-hidden">
              <button type="button" onClick={() => setOpenSection(openSection === 'permissions' ? '' : 'permissions')} className="w-full flex items-center justify-between p-4 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:bg-zinc-800/80 transition-colors">
                <div className="flex items-center gap-2 font-medium text-zinc-800 dark:text-zinc-100"><Server size={16} className="text-purple-400"/> Permissions</div>
                <ChevronDown size={18} className={`text-zinc-500 transition-transform ${openSection === 'permissions' ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence initial={false}>
                {openSection === 'permissions' && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 space-y-4">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">Max Clients <span className="text-zinc-500 text-xs">(0 = Unlimited)</span></label>
                        <input type="number" min={0} placeholder="0" value={form.maxClients} onChange={(e) => setForm({ ...form, maxClients: e.target.value })} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/50 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors" />
                      </div>
                        {form.selectedPanel ? (
                          <div className="mt-4">
                            <label className="mb-2 flex text-sm font-medium text-zinc-800 dark:text-zinc-100 justify-between">
                              <span>Allowed Inbounds</span>
                              <button type="button" onClick={() => setForm(f => ({...f, selectedInbounds: inbounds?.map((i: any) => i.id) || []}))} className="text-xs text-blue-500 hover:underline">Select All</button>
                            </label>
                            {inboundsLoading ? <div className="text-xs text-zinc-500">Loading inbounds...</div> : (
                              <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                                {(inbounds ?? []).map((i: any) => (
                                  <label key={i.id} className="flex items-center gap-3 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer">
                                    <input type="checkbox" checked={form.selectedInbounds.includes(i.id)} 
                                      onChange={(e) => {
                                        if (e.target.checked) setForm(f => ({ ...f, selectedInbounds: [...f.selectedInbounds, i.id] }));
                                        else setForm(f => ({ ...f, selectedInbounds: f.selectedInbounds.filter(id => id !== i.id) }));
                                      }}
                                      className="w-4 h-4 rounded text-blue-600 bg-zinc-100 border-zinc-300 dark:bg-zinc-700 dark:border-zinc-600 focus:ring-blue-500" />
                                    <div className="flex flex-col">
                                      <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{i.remark || i.tag}</span>
                                      <span className="text-xs text-zinc-500">{i.protocol} - Port {i.port}</span>
                                    </div>
                                  </label>
                                ))}
                                {inbounds?.length === 0 && <div className="text-xs text-zinc-500 p-2 text-center border rounded-lg border-dashed border-zinc-300 dark:border-zinc-700">No inbounds found on this panel.</div>}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="mt-4 p-3 rounded-lg border border-amber-500/20 bg-amber-500/10 text-sm text-amber-600 dark:text-amber-400 flex items-start gap-2">
                            <AlertCircle size={18} className="shrink-0 mt-0.5" />
                            <div>
                              <strong>No Panel Selected</strong>
                              <p className="text-xs opacity-80 mt-1">Please select a panel from the Basic Information section to view and select allowed inbounds.</p>
                            </div>
                          </div>
                        )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Section C: Limits */}
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 overflow-hidden">
              <button type="button" onClick={() => setOpenSection(openSection === 'limits' ? '' : 'limits')} className="w-full flex items-center justify-between p-4 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:bg-zinc-800/80 transition-colors">
                <div className="flex items-center gap-2 font-medium text-zinc-800 dark:text-zinc-100"><Database size={16} className="text-emerald-400"/> Limits</div>
                <ChevronDown size={18} className={`text-zinc-500 transition-transform ${openSection === 'limits' ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence initial={false}>
                {openSection === 'limits' && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="p-4 grid grid-cols-2 gap-4 border-t border-zinc-200 dark:border-zinc-800">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">Traffic Limit (GB) <span className="text-zinc-500 text-xs">0 = None</span></label>
                        <input type="number" min={0} placeholder="0" value={form.balanceGb} onChange={(e) => setForm({ ...form, balanceGb: e.target.value })} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/50 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors" />
                      </div>
                      <div>
                        <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">Expiry Days <span className="text-zinc-500 text-xs">0 = Unlimited</span></label>
                        <input type="number" min={0} placeholder="0" value={form.expiryDays} onChange={(e) => setForm({ ...form, expiryDays: e.target.value })} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/50 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors" />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Section D: Status */}
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 overflow-hidden">
              <button type="button" onClick={() => setOpenSection(openSection === 'status' ? '' : 'status')} className="w-full flex items-center justify-between p-4 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:bg-zinc-800/80 transition-colors">
                <div className="flex items-center gap-2 font-medium text-zinc-800 dark:text-zinc-100"><Activity size={16} className="text-rose-400"/> Status</div>
                <ChevronDown size={18} className={`text-zinc-500 transition-transform ${openSection === 'status' ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence initial={false}>
                {openSection === 'status' && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="p-4 border-t border-zinc-200 dark:border-zinc-800">
                      <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">Account Status</label>
                      <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/50 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors mb-4">
                        <option value="active">Active</option>
                        <option value="disabled">Disabled</option>
                      </select>
                      <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">Traffic Accounting Mode</label>
                      <select value={form.trafficMode} onChange={(e) => setForm({ ...form, trafficMode: e.target.value })} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/50 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors">
                        <option value="ALLOCATION">Allocation Based (Deduct on Creation)</option>
                        <option value="USAGE">Usage Based (Charge Real Consumption)</option>
                      </select>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>


          </motion.div>

          <div className="flex justify-end gap-3 pt-6 mt-6 border-t border-zinc-200 dark:border-zinc-800">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:bg-zinc-800 transition-colors">Cancel</button>
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" disabled={create.isPending || !form.selectedPanel} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors shadow-lg shadow-blue-900/20">
              {create.isPending ? "Creating…" : "Create Admin"}
            </motion.button>
          </div>
        </form>
        </div>
      </motion.div>
    </motion.div>
  );
}

function EditAdminModal({ adminId, onClose, onSaved }: { adminId: string; onClose: () => void; onSaved: () => void }) {
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);

  const { data: admin, isLoading } = useQuery({
    queryKey: ["admin", adminId],
    queryFn: async () => (await api.get<Admin>(`/admins/${adminId}`)).data,
  });

  const [openSection, setOpenSection] = useState("limits");
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    status: "active",
    trafficMode: "ALLOCATION",
    balanceGb: "",
    maxClients: "",
    password: "",
    expiryDays: "",
    customTrafficDelta: "",
    customExpiryDelta: "",
    customClientsDelta: "",
    selectedPanel: "",
    selectedInbounds: [] as string[],
    canCustomizeBranding: true,
    storeEnabled: false,
  });

  const { data: panels } = useQuery<PanelRow[]>({
    queryKey: ["panels"],
    queryFn: async () => (await api.get<PanelRow[]>("/panels")).data,
  });

  const { data: inbounds, isLoading: inboundsLoading } = useQuery<InboundRow[]>({
    queryKey: ["inbounds", form.selectedPanel],
    queryFn: async () => form.selectedPanel ? (await api.get<InboundRow[]>(`/panels/${form.selectedPanel}/inbounds`)).data : [],
    enabled: !!form.selectedPanel,
  });

  useEffect(() => {
    if (admin) {
      setForm((prev) => ({
        ...prev,
        status: admin.status || "active",
        trafficMode: admin.trafficMode || "ALLOCATION",
        balanceGb: admin.balance ? (admin.balance / (1024 * 1024 * 1024)).toFixed(2) : "",
        maxClients: admin.maxClients ? String(admin.maxClients) : "",
        selectedInbounds: admin.adminInbounds?.map((ai: any) => ai.inbound.id) || [],
        selectedPanel: admin.adminInbounds?.[0]?.inbound?.panel?.id || "",
        canCustomizeBranding: admin.permissions ? admin.permissions.includes("canCustomizeBranding") : true,
        storeEnabled: admin.storeEnabled || false,
      }));
    }
  }, [admin]);

  const directEdit = useMutation({
    mutationFn: async () => {
      const payload: any = {
        status: form.status,
        trafficMode: form.trafficMode,
        inboundIds: form.selectedInbounds,
        permissions: [],
      };
      if (form.balanceGb) payload.balance = Math.round(Number(form.balanceGb) * 1024 * 1024 * 1024);
      if (form.maxClients) payload.maxClients = Number(form.maxClients);
      if (form.password.trim()) payload.password = form.password;
      if (form.expiryDays) payload.expiryTime = Date.now() + Number(form.expiryDays) * 24 * 60 * 60 * 1000;
      
      const res = await api.patch(`/admins/${adminId}`, payload);



      return res.data;
    },
    onSuccess: () => {
      toast("Admin updated");
      qc.invalidateQueries({ queryKey: ["admin", adminId] });
      onSaved();
    },
    onError: () => toast("Failed to update admin", "error"),
  });

  const fixMigration = useMutation({
    mutationFn: async () => (
      await api.post(`/admins/${adminId}/fix-migration`, {
        inboundIds: inbounds ? inbounds.map((i: any) => i.id) : undefined,
      })
    ).data,
    onSuccess: () => {
      toast("Migration fix applied — balance synced from pool");
      qc.invalidateQueries({ queryKey: ["admin", adminId] });
      qc.invalidateQueries({ queryKey: ["admins"] });
    },
    onError: () => toast("Failed to apply migration fix", "error"),
  });

  if (isLoading) return (
    <motion.div {...MOTION_CONFIG.modalOverlay} className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-black/60 pt-[10dvh] px-4 sm:pt-0 sm:p-4">
      <motion.div {...MOTION_CONFIG.modalContent} className="w-full max-w-4xl rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-12 flex justify-center">
        <Spinner />
      </motion.div>
    </motion.div>
  );

  if (!admin) return null;

  const remaining = admin.balance > 0
    ? formatBytes(Math.max(0, admin.balance - (admin.usedTraffic || 0)))
    : admin.trafficMode === 'USAGE' ? formatBytes(0) : "No Limit / Unlimited";
  const expiryDate = admin.expiryTime === 0 ? "Unlimited" : formatDate(new Date(admin.expiryTime).toISOString());
  // Detect migrated admins: have no adminInbounds set
  const isMigrated = !admin.adminInbounds || admin.adminInbounds.length === 0;

  return (
    <motion.div {...MOTION_CONFIG.modalOverlay} className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-black/60 pt-[10dvh] px-4 sm:pt-0 sm:p-4 backdrop-blur-sm">
      <motion.div {...MOTION_CONFIG.modalContent} className="w-full max-w-5xl rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col-reverse md:flex-row overflow-y-auto md:overflow-hidden max-h-[90vh]">
        {/* Admin Statistics (Sidebar) */}
        <div className="w-full md:w-1/3 shrink-0 bg-zinc-50 dark:bg-zinc-950/50 p-6 border-t md:border-t-0 md:border-r border-zinc-200 dark:border-zinc-800/50 flex flex-col">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-xl font-bold text-zinc-800 dark:text-zinc-100">{admin.username}</h2>
              <div className="text-sm text-zinc-500 mt-1">Status: {admin.status}</div>
            </div>
            <Badge tone={admin.status === "active" ? "green" : "red"}>{admin.status}</Badge>
          </div>

          <div className="space-y-4 flex-1">
            <SummaryStat icon={<Users size={16} />} label="Current Clients" value={`${admin._count?.clients ?? 0}`} />
            <SummaryStat icon={<Activity size={16} />} label="Used Traffic" value={formatBytes(admin.usedTraffic || 0)} />
            <SummaryStat icon={<Database size={16} />} label="Remaining Traffic" value={remaining} highlight={admin.balance === 0 && admin.trafficMode !== 'USAGE'} />
            <SummaryStat icon={<Shield size={16} />} label="Assigned Inbounds" value={admin.adminInbounds?.length?.toString() ?? "0"} />
            <SummaryStat icon={<Clock size={16} />} label="Expiry Date" value={expiryDate} highlight={admin.expiryTime > 0 && admin.expiryTime < Date.now()} />
            {isMigrated && (
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-400">
                ⚠️ This admin was migrated. Please set a Panel Node and Inbound to complete configuration.
              </div>
            )}
          </div>
          
          <div className="mt-6 pt-6 border-t border-zinc-200 dark:border-zinc-800/50 space-y-3">
            <div className="text-xs text-zinc-500">Created At: {formatDate(admin.createdAt)}</div>
            {isMigrated && (
              <motion.button
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={() => fixMigration.mutate()}
                disabled={fixMigration.isPending}
                className="w-full rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 px-3 py-2 text-xs font-medium transition-colors"
              >
                {fixMigration.isPending ? "Fixing..." : "🔧 Fix Migration (Sync Balance)"}
              </motion.button>
            )}
          </div>
        </div>

        {/* Edit Actions */}
        <div className="w-full md:w-2/3 p-6 overflow-y-visible md:overflow-y-auto space-y-8">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
              <Settings2 size={18} className="text-zinc-500 dark:text-zinc-400" /> Edit Admin
            </h3>
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-600 dark:text-zinc-300 transition-colors"><X size={20} /></button>
          </div>

          <div className="space-y-4">
              {/* Section A: Limits & Status */}
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 overflow-hidden">
                <button type="button" onClick={() => setOpenSection(openSection === 'limits' ? '' : 'limits')} className="w-full flex items-center justify-between p-4 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:bg-zinc-800/80 transition-colors">
                  <div className="flex items-center gap-2 font-medium text-zinc-800 dark:text-zinc-100"><Database size={16} className="text-emerald-400"/> Limits & Status</div>
                  <ChevronDown size={18} className={`text-zinc-500 transition-transform ${openSection === 'limits' ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence initial={false}>
                  {openSection === 'limits' && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="p-4 border-t border-zinc-200 dark:border-zinc-800">
                        <div className="space-y-4">
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">Add Traffic (GB)</label>
                              <input type="number" placeholder="Leave empty for no change" value={form.balanceGb} onChange={(e) => setForm({ ...form, balanceGb: e.target.value })} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors placeholder:text-zinc-600" />
                            </div>
                            <div>
                              <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">Add Expiry (Days)</label>
                              <input type="number" placeholder="Leave empty for no change" value={form.expiryDays} onChange={(e) => setForm({ ...form, expiryDays: e.target.value })} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors placeholder:text-zinc-600" />
                            </div>
                          </div>
                          
                          {admin && (
                            <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 mt-2">
                              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">Current Traffic Allocation</h3>
                              <div className="flex items-center justify-between">
                                <div className="flex flex-col">
                                  <span className="text-[10px] text-zinc-500 mb-0.5">Total Allocated</span>
                                  <span className="text-sm font-medium text-emerald-400">{admin.balance ? (admin.balance / (1024 * 1024 * 1024)).toFixed(2) : "0"} GB</span>
                                </div>
                                <div className="flex flex-col text-right">
                                  <span className="text-[10px] text-zinc-500 mb-0.5">Total Used</span>
                                  <span className="text-sm font-medium text-amber-400">{admin.usedTraffic ? (admin.usedTraffic / (1024 * 1024 * 1024)).toFixed(2) : "0"} GB</span>
                                </div>
                              </div>
                            </div>
                          )}
                          
                          <div>
                            <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">Status</label>
                            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/50 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors mb-4">
                              <option value="active">Active</option>
                              <option value="suspended">Suspended</option>
                              <option value="disabled">Disabled</option>
                            </select>
                            
                            <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">Traffic Accounting Mode</label>
                            <select value={form.trafficMode} onChange={(e) => setForm({ ...form, trafficMode: e.target.value })} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/50 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors">
                              <option value="ALLOCATION">Allocation Based (Deduct on Creation)</option>
                              <option value="USAGE">Usage Based (Charge Real Consumption)</option>
                            </select>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Section B: Basic Info */}
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 overflow-hidden">
                <button type="button" onClick={() => setOpenSection(openSection === 'basic' ? '' : 'basic')} className="w-full flex items-center justify-between p-4 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:bg-zinc-800/80 transition-colors">
                  <div className="flex items-center gap-2 font-medium text-zinc-800 dark:text-zinc-100"><Shield size={16} className="text-blue-400"/> Basic Information</div>
                  <ChevronDown size={18} className={`text-zinc-500 transition-transform ${openSection === 'basic' ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence initial={false}>
                  {openSection === 'basic' && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="p-4 grid grid-cols-2 gap-4 border-t border-zinc-200 dark:border-zinc-800">
                        <div>
                          <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">Username</label>
                          <input type="text" readOnly value={admin.username} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/30 px-3 py-2 text-sm text-zinc-500 outline-none opacity-60 cursor-not-allowed" />
                        </div>
                        <div className="relative">
                          <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">Password</label>
                          <input type={showPassword ? "text" : "password"} placeholder="Leave blank to keep unchanged" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/50 pl-3 pr-10 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors" />
                          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-[28px] text-zinc-500 hover:text-zinc-600 dark:text-zinc-300">
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                        <div className="col-span-2">
                          <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">Active Panel Node</label>
                          {isMigrated && !form.selectedPanel && (
                            <div className="mb-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2">
                              ⚠️ No panel assigned yet. Select a panel below to configure inbounds.
                            </div>
                          )}
                          <select value={form.selectedPanel} onChange={(e) => setForm({ ...form, selectedPanel: e.target.value, selectedInbounds: [] })} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/50 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors">
                            <option value="">Choose a panel...</option>
                            {(panels ?? []).map(p => (
                              <option key={p.id} value={p.id}>
                                {p.name} ({p.status === 'online' ? `v${p.version}` : 'Offline'})
                              </option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Section B: Permissions */}
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 overflow-hidden">
                <button type="button" onClick={() => setOpenSection(openSection === 'permissions' ? '' : 'permissions')} className="w-full flex items-center justify-between p-4 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:bg-zinc-800/80 transition-colors">
                  <div className="flex items-center gap-2 font-medium text-zinc-800 dark:text-zinc-100"><Server size={16} className="text-purple-400"/> Permissions</div>
                  <ChevronDown size={18} className={`text-zinc-500 transition-transform ${openSection === 'permissions' ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence initial={false}>
                  {openSection === 'permissions' && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 space-y-4">
                        <div>
                          <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">Max Clients <span className="text-zinc-500 text-xs">(0 = Unlimited)</span></label>
                          <input type="number" min={0} value={form.maxClients} onChange={(e) => setForm({ ...form, maxClients: e.target.value })} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/50 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors" />
                        </div>
                          {form.selectedPanel ? (
                            <div className="mt-4">
                              <label className="mb-2 flex text-sm font-medium text-zinc-800 dark:text-zinc-100 justify-between">
                                <span>Allowed Inbounds</span>
                                <button type="button" onClick={() => setForm(f => ({...f, selectedInbounds: inbounds?.map((i: any) => i.id) || []}))} className="text-xs text-blue-500 hover:underline">Select All</button>
                              </label>
                              {inboundsLoading ? <div className="text-xs text-zinc-500">Loading inbounds...</div> : (
                                <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                                  {(inbounds ?? []).map((i: any) => (
                                    <label key={i.id} className="flex items-center gap-3 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer">
                                      <input type="checkbox" checked={form.selectedInbounds.includes(i.id)} 
                                        onChange={(e) => {
                                          if (e.target.checked) setForm(f => ({ ...f, selectedInbounds: [...f.selectedInbounds, i.id] }));
                                          else setForm(f => ({ ...f, selectedInbounds: f.selectedInbounds.filter(id => id !== i.id) }));
                                        }}
                                        className="w-4 h-4 rounded text-blue-600 bg-zinc-100 border-zinc-300 dark:bg-zinc-700 dark:border-zinc-600 focus:ring-blue-500" />
                                      <div className="flex flex-col">
                                        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{i.remark || i.tag}</span>
                                        <span className="text-xs text-zinc-500">{i.protocol} - Port {i.port}</span>
                                      </div>
                                    </label>
                                  ))}
                                  {inbounds?.length === 0 && <div className="text-xs text-zinc-500 p-2 text-center border rounded-lg border-dashed border-zinc-300 dark:border-zinc-700">No inbounds found on this panel.</div>}
                                </div>
                              )}
                            </div>
                          ) : (
                            <div className="mt-4 p-3 rounded-lg border border-amber-500/20 bg-amber-500/10 text-sm text-amber-600 dark:text-amber-400 flex items-start gap-2">
                              <AlertCircle size={18} className="shrink-0 mt-0.5" />
                              <div>
                                <strong>No Panel Selected</strong>
                                <p className="text-xs opacity-80 mt-1">Please select a panel from the Basic Information section to view and select allowed inbounds.</p>
                              </div>
                            </div>
                          )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex justify-end pt-4">
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => directEdit.mutate()} disabled={directEdit.isPending} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors shadow-lg shadow-blue-900/20">
                  {directEdit.isPending ? "Saving..." : "Save Changes"}
                </motion.button>
              </div>
            </div>
          </div>

      </motion.div>
    </motion.div>
  );
}

function SummaryStat({ icon, label, value, highlight }: { icon: React.ReactNode, label: string, value: string | React.ReactNode, highlight?: boolean }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/50">
      <div className={`p-2 rounded-md ${highlight ? "bg-red-500/10 text-red-400" : "bg-blue-500/10 text-blue-400"}`}>
        {icon}
      </div>
      <div>
        <div className="text-xs text-zinc-500 mb-0.5">{label}</div>
        <div className={`text-sm font-medium ${highlight ? "text-red-400" : "text-zinc-800 dark:text-zinc-100"}`}>{value}</div>
      </div>
    </div>
  );
}
