"use client";

import React, { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatBytes, formatDate } from "@/lib/format";
import { Card, PageHeader, Badge, Spinner, ErrorBox } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useT } from "@/i18n";
import { Plus, Power, Edit2, Shield, Activity, HardDrive, Cpu, CreditCard, ChevronDown, Check, X, ShieldCheck, Download, Upload, Trash2, Eye, EyeOff, Server, Database, Save, ArrowRight, Store, Users, Clock, Settings2, Zap, Lock, AlertCircle, Infinity } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { MOTION_CONFIG } from "@/lib/motion";
import { NodeInboundBadge } from "@/components/NodeInboundBadge";
import { PluginSlot } from "@/components/PluginSlot";

interface AdminPanelQuotaRow {
  panelId: string;
  panelName?: string;
  balance: number;
  totalAssigned?: number;
}

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
  unlimitedTraffic?: boolean;
  refundOnDelete?: boolean;
  refundOnEdit?: boolean;
  quotaMode?: "GLOBAL" | "PER_PANEL";
  panelQuotas?: AdminPanelQuotaRow[];
  panelQuotaSummary?: string | null;
}

interface InboundRow {
  id: string;
  tag: string;
  port: number;
  protocol: string;
  nodeId?: number | null;
  nodeName?: string | null;
  originNodeGuid?: string | null;
  panel: { id: string; name: string };
}

interface PanelRow {
  id: string;
  name: string;
  url: string;
  version: string;
  status: string;
}

function adminStatusLabel(status: string, t: (key: string, params?: Record<string, string | number>) => string) {
  if (status === "active") return t("admins.statusActive");
  if (status === "disabled" || status === "suspended") return t("admins.statusDisabled");
  return status;
}

export default function AdminsPage() {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);
  const [addOpen, setAddOpen] = useState(false);
  const [editAdmin, setEditAdmin] = useState<Admin | null>(null);
  
  const [activeTab, setActiveTab] = useState<'active' | 'disabled'>('active');
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
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
      toast(t("admins.actionSuccess"));
      qc.invalidateQueries({ queryKey: ["admins"] });
    },
    onError: () => toast(t("admins.actionFailed"), "error"),
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
  if (error) return <ErrorBox message={t("admins.loadFailed")} />;

  const admins = data?.data ?? [];

  return (
    <motion.div {...MOTION_CONFIG.page}>
      <PageHeader
        title={t("admins.title")}
        subtitle={t("admins.subtitle")}
        action={
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 shadow-sm"
          >
            <Plus size={16} /> {t("admins.addAdmin")}
          </motion.button>
        }
      />

      <div className="mb-4 flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex bg-white dark:bg-zinc-900/50 p-1 rounded-lg border border-zinc-200 dark:border-zinc-800">
          <button
            onClick={() => setActiveTab('active')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'active' ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
            }`}
          >
            {t("admins.activeAdmins")}
          </button>
          <button
            onClick={() => setActiveTab('disabled')}
            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
              activeTab === 'disabled' ? 'bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100' : 'text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200'
            }`}
          >
            {t("admins.disabledAdmins")}
          </button>
        </div>

        <div className="w-full sm:w-64 relative">
          <div className="absolute inset-y-0 start-3 flex items-center pointer-events-none">
            <svg className="h-4 w-4 text-zinc-500 dark:text-zinc-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("admins.searchPlaceholder")}
            className="w-full bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-lg ps-9 pe-4 py-2 text-sm text-zinc-800 dark:text-zinc-100 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      <Card className="overflow-x-auto p-0 shadow-lg border-transparent md:border-zinc-200 dark:border-zinc-800/50 bg-transparent md:bg-zinc-50 dark:bg-zinc-950">
        <table className="w-full text-sm block md:table">
          <thead className="hidden md:table-header-group">
            <tr className="border-b border-zinc-200 dark:border-zinc-800 text-start text-xs uppercase tracking-wide text-zinc-500 bg-white dark:bg-zinc-900/50">
              <th className="px-4 py-3 font-medium">{t("admins.colAdmin")}</th>
              <th className="px-4 py-3 font-medium">{t("common.status")}</th>
              <th className="px-4 py-3 font-medium">{t("admins.colTraffic")}</th>
              <th className="px-4 py-3 font-medium">{t("admins.colClients")}</th>
              <th className="px-4 py-3 font-medium">{t("admins.colExpiry")}</th>
              <th className="px-4 py-3 font-medium text-end">{t("common.actions")}</th>
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
                className={`block md:table-row group border border-zinc-200 dark:border-zinc-800 md:border-none rounded-xl md:rounded-none bg-zinc-50 dark:bg-zinc-950 md:bg-transparent last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-900/30 transition-colors cursor-pointer ${
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
                      <div className="text-xs text-zinc-500">{a.role === "SUPER_ADMIN" ? t("nav.superAdmin") : t("nav.reseller")}</div>
                    </div>
                    <div className="md:hidden">
                      <Badge tone={a.status === "active" ? "green" : "red"}>
                        {adminStatusLabel(a.status, t)}
                      </Badge>
                    </div>
                  </div>
                </td>
                <td className="hidden md:table-cell px-4 py-3">
                  <Badge tone={a.status === "active" ? "green" : "red"}>
                    {adminStatusLabel(a.status, t)}
                  </Badge>
                </td>
                <td className="block md:table-cell px-4 py-2 md:py-3 border-t border-zinc-200 dark:border-zinc-800/50 md:border-0 mt-2 md:mt-0">
                  <div className="md:hidden text-[10px] uppercase text-zinc-500 font-semibold mb-1 tracking-wider">{t("admins.trafficStatus")}</div>
                  {a.role === "SUPER_ADMIN" ? <span className="text-zinc-600">—</span> : a.unlimitedTraffic ? (
                    <div className="text-xs">
                      <div className="font-medium text-emerald-400">{t("admins.unlimitedTrafficLabel")}</div>
                      <div className="text-zinc-500 mt-0.5">{t("admins.noTrafficLimits")}</div>
                    </div>
                  ) : a.quotaMode === "PER_PANEL" ? (
                    <div className="text-xs">
                      <div className="font-medium text-violet-400">{t("admins.quotaModePerPanel")}</div>
                      {a.panelQuotaSummary ? (
                        <div className="text-zinc-500 mt-0.5">{a.panelQuotaSummary}</div>
                      ) : (
                        <div className="text-zinc-500 mt-0.5">{t("admins.perPanelQuotaSummary", { panels: 0, total: "0 GB" })}</div>
                      )}
                      <div className="text-zinc-500 mt-0.5">{t("admins.usedTraffic", { amount: formatBytes(a.usedTraffic || 0) })}</div>
                    </div>
                  ) : (
                    <div className="text-xs">
                      {a.balance === 0 ? (
                        <>
                          <div className="font-medium text-red-400">{t("admins.exhausted")}</div>
                          <div className="text-zinc-500">{t("admins.outOfTraffic", { total: formatBytes(a.totalAssigned || 0) })}</div>
                          <div className="text-zinc-500 mt-0.5">{t("admins.usedTraffic", { amount: formatBytes(a.usedTraffic || 0) })}</div>
                        </>
                      ) : (
                        <>
                          <div className="font-medium text-blue-400">
                            {t("admins.leftTraffic", { amount: formatBytes(a.balance) })}
                          </div>
                          <div className="text-zinc-500">{t("admins.outOfTraffic", { total: formatBytes(a.totalAssigned || 0) })}</div>
                          <div className="text-zinc-500 mt-0.5">{t("admins.usedTraffic", { amount: formatBytes(a.usedTraffic || 0) })}</div>
                        </>
                      )}
                    </div>
                  )}
                </td>
                <td className="block md:table-cell px-4 py-2 md:py-3 text-zinc-600 dark:text-zinc-300">
                  <div className="md:hidden text-[10px] uppercase text-zinc-500 font-semibold mb-1 tracking-wider">{t("admins.clientsLimit")}</div>
                  {a.role === "SUPER_ADMIN" ? <span className="text-zinc-600">—</span> : (
                    <div className="text-xs">
                      <div className="font-medium text-purple-400">
                        {a.maxClients === 0 ? t("common.unlimited") : t("admins.leftCount", { count: Math.max(0, a.maxClients - (a._count?.clients ?? 0)) })}
                      </div>
                      <div className="text-zinc-500">{t("admins.outOfTraffic", { total: a.maxClients === 0 ? "∞" : a.maxClients })}</div>
                    </div>
                  )}
                </td>
                <td className="block md:table-cell px-4 py-2 md:py-3 text-zinc-600 dark:text-zinc-300">
                  <div className="md:hidden text-[10px] uppercase text-zinc-500 font-semibold mb-1 tracking-wider">{t("admins.colExpiry")}</div>
                  {a.role === "SUPER_ADMIN" ? <span className="text-zinc-600">—</span> : (
                    <div className="text-xs">
                      <div className={`font-medium ${a.expiryTime === 0 ? 'text-emerald-400' : a.expiryTime > Date.now() ? 'text-emerald-400' : 'text-red-400'}`}>
                        {a.expiryTime === 0 
                          ? t("common.never") 
                          : a.expiryTime > Date.now() 
                            ? t("admins.daysRemaining", { count: Math.ceil((a.expiryTime - Date.now()) / (1000 * 60 * 60 * 24)) }) 
                            : t("admins.expiredDaysAgo", { count: Math.floor((Date.now() - a.expiryTime) / (1000 * 60 * 60 * 24)) })}
                      </div>
                      <div className="text-zinc-500">{a.expiryTime === 0 ? t("common.unlimited") : formatDate(new Date(a.expiryTime).toISOString())}</div>
                    </div>
                  )}
                </td>

                <td className="block md:table-cell px-4 py-3 border-t border-zinc-200 dark:border-zinc-800/50 md:border-0 mt-2 md:mt-0 transition-all duration-300 text-end" onClick={(e) => e.stopPropagation()}>
                  <div className="flex items-center justify-start md:justify-end gap-1.5 md:opacity-0 md:group-hover:opacity-100 transition-opacity flex-wrap w-full">
                    {a.role !== "SUPER_ADMIN" && (
                      <motion.button 
                        whileHover={{ scale: 1.05 }} 
                        whileTap={{ scale: 0.95 }} 
                        onClick={() => toggleStatus(a)} 
                        className={`p-2 rounded-lg transition-colors ${a.status === 'active' ? 'text-emerald-400 hover:bg-emerald-400/10' : 'text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800'}`}
                        title={a.status === 'active' ? t("admins.disableAdmin") : t("admins.enableAdmin")}
                      >
                        <Power size={16} />
                      </motion.button>
                    )}
                    
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setEditAdmin(a)}
                      className="p-2 text-amber-400 hover:bg-amber-400/10 rounded-lg transition-colors"
                      title={t("admins.editAdminTitle")}
                    >
                      <Edit2 size={16} />
                    </motion.button>

                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      disabled={(a._count?.clients ?? 0) > 0}
                      onClick={() => {
                        if (confirm(t("admins.deleteConfirm", { username: a.username }))) {
                          quickAction.mutate({ id: a.id, payload: { delete: true } }); 
                        }
                      }}
                      className={`p-2 rounded-lg transition-colors ${(a._count?.clients ?? 0) > 0 ? "text-zinc-600 cursor-not-allowed" : "text-red-400 hover:bg-red-400/10"}`}
                      title={(a._count?.clients ?? 0) > 0 ? t("admins.cannotDeleteWithClients") : t("admins.deleteAdmin")}
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
              <tr><td colSpan={7} className="px-4 py-10 text-center text-zinc-500">{t("admins.noAdmins")}</td></tr>
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

/**
 * Multi-panel inbound assignment. A reseller may be granted inbounds on several
 * panels at once; every checked inbound is saved through the flat `inboundIds`
 * list (AdminInbound already bridges admin ↔ inbound across panels).
 */
function PanelInboundPicker({
  panels,
  inbounds,
  isLoading,
  enabledPanels,
  selectedInbounds,
  onChange,
}: {
  panels: PanelRow[];
  inbounds: InboundRow[];
  isLoading?: boolean;
  enabledPanels: string[];
  selectedInbounds: string[];
  onChange: (next: { enabledPanels: string[]; selectedInbounds: string[] }) => void;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState<string[]>([]);

  const inboundsByPanel = React.useMemo(() => {
    const map = new Map<string, InboundRow[]>();
    inbounds.forEach((i) => {
      const panelId = i.panel?.id;
      if (!panelId) return;
      if (!map.has(panelId)) map.set(panelId, []);
      map.get(panelId)!.push(i);
    });
    return map;
  }, [inbounds]);

  const togglePanel = (panelId: string) => {
    const panelInboundIds = (inboundsByPanel.get(panelId) ?? []).map((i) => i.id);
    if (enabledPanels.includes(panelId)) {
      onChange({
        enabledPanels: enabledPanels.filter((id) => id !== panelId),
        selectedInbounds: selectedInbounds.filter((id) => !panelInboundIds.includes(id)),
      });
    } else {
      setExpanded((prev) => (prev.includes(panelId) ? prev : [...prev, panelId]));
      onChange({
        enabledPanels: [...enabledPanels, panelId],
        selectedInbounds: Array.from(new Set([...selectedInbounds, ...panelInboundIds])),
      });
    }
  };

  const toggleInbound = (inboundId: string) => {
    onChange({
      enabledPanels,
      selectedInbounds: selectedInbounds.includes(inboundId)
        ? selectedInbounds.filter((id) => id !== inboundId)
        : [...selectedInbounds, inboundId],
    });
  };

  if (isLoading) {
    return <div className="text-xs text-zinc-500">{t("common.loadingInbounds")}</div>;
  }

  if (panels.length === 0) {
    return (
      <div className="text-xs text-zinc-500 p-2 text-center border rounded-lg border-dashed border-zinc-300 dark:border-zinc-700">
        {t("common.noInboundsAvailable")}
      </div>
    );
  }

  return (
    <div className="space-y-2 max-h-72 overflow-y-auto pe-2 custom-scrollbar">
      {panels.map((p) => {
        const panelInbounds = inboundsByPanel.get(p.id) ?? [];
        const isEnabled = enabledPanels.includes(p.id);
        const isExpanded = expanded.includes(p.id);
        const checkedCount = panelInbounds.filter((i) => selectedInbounds.includes(i.id)).length;

        return (
          <div key={p.id} className="rounded-lg border border-zinc-200 dark:border-zinc-800 overflow-hidden">
            <div className="flex items-center gap-3 p-3 bg-zinc-50 dark:bg-zinc-950/50">
              <input
                type="checkbox"
                checked={isEnabled}
                onChange={() => togglePanel(p.id)}
                className="w-4 h-4 rounded text-blue-600 bg-zinc-100 border-zinc-300 dark:bg-zinc-700 dark:border-zinc-600 focus:ring-blue-500"
              />
              <button
                type="button"
                onClick={() => setExpanded((prev) => (isExpanded ? prev.filter((id) => id !== p.id) : [...prev, p.id]))}
                className="flex flex-1 items-center justify-between gap-2 text-start"
              >
                <span className="flex flex-col">
                  <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 inline-flex items-center gap-2">
                    <Server size={14} className="text-blue-400" /> {p.name}
                  </span>
                  <span className="text-xs text-zinc-500">
                    {t("admins.panelInboundCount", { selected: checkedCount, total: panelInbounds.length })}
                  </span>
                </span>
                <ChevronDown size={16} className={`text-zinc-500 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
              </button>
            </div>

            {isEnabled && isExpanded && (
              <div className="p-2 space-y-2 border-t border-zinc-200 dark:border-zinc-800">
                {panelInbounds.length === 0 ? (
                  <div className="text-xs text-zinc-500 p-2 text-center border rounded-lg border-dashed border-zinc-300 dark:border-zinc-700">
                    {t("common.noInboundsOnPanel")}
                  </div>
                ) : (
                  <>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() =>
                          onChange({
                            enabledPanels,
                            selectedInbounds: Array.from(
                              new Set([...selectedInbounds, ...panelInbounds.map((i) => i.id)]),
                            ),
                          })
                        }
                        className="text-xs text-blue-500 hover:underline"
                      >
                        {t("common.selectAll")}
                      </button>
                    </div>
                    {panelInbounds.map((i) => (
                      <label
                        key={i.id}
                        className="flex items-center gap-3 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={selectedInbounds.includes(i.id)}
                          onChange={() => toggleInbound(i.id)}
                          className="w-4 h-4 rounded text-blue-600 bg-zinc-100 border-zinc-300 dark:bg-zinc-700 dark:border-zinc-600 focus:ring-blue-500"
                        />
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 inline-flex items-center gap-1.5">
                            <span>{(i as any).remark || i.tag}</span>
                            <NodeInboundBadge inbound={i} />
                          </span>
                          <span className="text-xs text-zinc-500">
                            {t("admins.inboundProtocolLine", { protocol: i.protocol, port: i.port })}
                          </span>
                        </div>
                      </label>
                    ))}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

type QuotaMode = "GLOBAL" | "PER_PANEL";

function buildPanelQuotasPayload(
  enabledPanels: string[],
  panelQuotaGb: Record<string, string>,
) {
  return enabledPanels.map((panelId) => ({
    panelId,
    balanceBytes: Math.round(Number(panelQuotaGb[panelId] || 0) * 1024 ** 3),
  }));
}

function QuotaModeToggle({
  value,
  onChange,
  disabled,
}: {
  value: QuotaMode;
  onChange: (mode: QuotaMode) => void;
  disabled?: boolean;
}) {
  const t = useT();
  return (
    <div className="col-span-2 space-y-2">
      <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400">{t("admins.quotaMode")}</label>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${value === "GLOBAL" ? "border-blue-500/50 bg-blue-500/5" : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"} ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
          <input type="radio" name="quotaMode" checked={value === "GLOBAL"} onChange={() => onChange("GLOBAL")} className="mt-1" disabled={disabled} />
          <div>
            <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{t("admins.quotaModeGlobal")}</div>
            <div className="text-xs text-zinc-500">{t("admins.quotaModeGlobalHint")}</div>
          </div>
        </label>
        <label className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${value === "PER_PANEL" ? "border-violet-500/50 bg-violet-500/5" : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"} ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
          <input type="radio" name="quotaMode" checked={value === "PER_PANEL"} onChange={() => onChange("PER_PANEL")} className="mt-1" disabled={disabled} />
          <div>
            <div className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{t("admins.quotaModePerPanel")}</div>
            <div className="text-xs text-zinc-500">{t("admins.quotaModePerPanelHint")}</div>
          </div>
        </label>
      </div>
    </div>
  );
}

function PerPanelQuotaFields({
  panels,
  enabledPanels,
  values,
  onChange,
  disabled,
}: {
  panels: PanelRow[];
  enabledPanels: string[];
  values: Record<string, string>;
  onChange: (panelId: string, gb: string) => void;
  disabled?: boolean;
}) {
  const t = useT();
  if (enabledPanels.length === 0) return null;
  return (
    <div className="col-span-2 space-y-2">
      <label className="block text-sm font-medium text-zinc-500 dark:text-zinc-400">{t("admins.currentPanelQuotas")}</label>
      <div className="space-y-2 rounded-lg border border-zinc-200 dark:border-zinc-800 p-3 bg-zinc-50/50 dark:bg-zinc-950/30">
        {enabledPanels.map((panelId) => {
          const panel = panels.find((p) => p.id === panelId);
          return (
            <div key={panelId} className="flex items-center gap-3">
              <span className="text-sm flex-1 min-w-0 truncate text-zinc-700 dark:text-zinc-300">{panel?.name || panelId}</span>
              <input
                type="number"
                min={0}
                placeholder="0"
                disabled={disabled}
                value={values[panelId] ?? ""}
                onChange={(e) => onChange(panelId, e.target.value)}
                className="w-28 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500"
              />
              <span className="text-xs text-zinc-500 shrink-0">GB</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AddAdminModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const t = useT();
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
    enabledPanels: [] as string[],
    selectedInbounds: [] as string[],
    canCustomizeBranding: true,
    storeEnabled: false,
    storePanelId: "",
    refundOnDelete: true,
    refundOnEdit: true,
    unlimitedTraffic: false,
    quotaMode: "GLOBAL" as QuotaMode,
    panelQuotaGb: {} as Record<string, string>,
  });

  const { data: inbounds, isLoading: inboundsLoading } = useQuery<InboundRow[]>({
    queryKey: ["inbounds-all"],
    queryFn: async () => (await api.get<InboundRow[]>("/inbounds")).data,
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
        quotaMode: form.unlimitedTraffic ? "GLOBAL" : form.quotaMode,
        balance: form.unlimitedTraffic || form.quotaMode === "PER_PANEL"
          ? 0
          : (form.balanceGb ? Math.round(Number(form.balanceGb) * 1024 * 1024 * 1024) : 0),
        panelQuotas: !form.unlimitedTraffic && form.quotaMode === "PER_PANEL"
          ? buildPanelQuotasPayload(form.enabledPanels, form.panelQuotaGb)
          : undefined,
        expiryTime: form.expiryDays ? Date.now() + Number(form.expiryDays) * 24 * 60 * 60 * 1000 : 0,
        maxClients: form.maxClients ? Number(form.maxClients) : 0,
        inboundIds: form.selectedInbounds,
        permissions: [],
        storeEnabled: form.storeEnabled,
        storePanelId: form.storePanelId,
        refundOnDelete: form.unlimitedTraffic ? false : form.refundOnDelete,
        refundOnEdit: form.unlimitedTraffic ? false : form.refundOnEdit,
        unlimitedTraffic: form.unlimitedTraffic,
      };
      return (await api.post("/admins", payload)).data;
    },
    onSuccess: () => {
      toast(t("admins.adminCreated"));
      onSaved();
    },
    onError: () => toast(t("admins.createFailed"), "error"),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.username || !form.password) return toast(t("admins.usernamePasswordRequired"), "error");
    if (form.password.length < 8) return toast(t("admins.passwordMinLength"), "error");
    if (form.selectedInbounds.length === 0) return toast(t("admins.inboundRequired"), "error");
    create.mutate();
  };

  return (
    <motion.div {...MOTION_CONFIG.modalOverlay} className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-black/60 pt-[10dvh] px-4 sm:pt-0 sm:p-4 backdrop-blur-sm">
      <motion.div {...MOTION_CONFIG.modalContent} className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-950/30">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <Shield size={20} className="text-blue-500" /> {t("admins.addResellerTitle")}
          </h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"><X size={20} /></button>
        </div>
        <div className="overflow-y-auto flex-1">

        <form onSubmit={handleSubmit} className="p-6">
          <motion.div layout className="space-y-4">
            
            {/* Section A: Basic Info */}
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 overflow-hidden">
              <button type="button" onClick={() => setOpenSection(openSection === 'basic' ? '' : 'basic')} className="w-full flex items-center justify-between p-4 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors">
                <div className="flex items-center gap-2 font-medium text-zinc-800 dark:text-zinc-100"><Shield size={16} className="text-blue-400"/> {t("admins.basicInformation")}</div>
                <ChevronDown size={18} className={`text-zinc-500 transition-transform ${openSection === 'basic' ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence initial={false}>
                {openSection === 'basic' && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="p-4 grid grid-cols-2 gap-4 border-t border-zinc-200 dark:border-zinc-800">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">{t("admins.username")}</label>
                        <input type="text" required value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/50 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors" />
                      </div>
                      <div className="relative">
                        <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">{t("admins.password")}</label>
                        <input type={showPassword ? "text" : "password"} required value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/50 ps-3 pe-10 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors" />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute end-3 top-[28px] text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300">
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                      <div className="col-span-2 text-xs text-zinc-500 dark:text-zinc-400">
                        {t("admins.panelAssignmentMovedHint")}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Section B: Permissions */}
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 overflow-hidden">
              <button type="button" onClick={() => setOpenSection(openSection === 'permissions' ? '' : 'permissions')} className="w-full flex items-center justify-between p-4 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors">
                <div className="flex items-center gap-2 font-medium text-zinc-800 dark:text-zinc-100"><Server size={16} className="text-purple-400"/> {t("admins.permissions")}</div>
                <ChevronDown size={18} className={`text-zinc-500 transition-transform ${openSection === 'permissions' ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence initial={false}>
                {openSection === 'permissions' && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 space-y-4">
                      <div>
                        <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">{t("admins.maxClients")} <span className="text-zinc-500 text-xs">{t("admins.maxClientsHint")}</span></label>
                        <input type="number" min={0} placeholder="0" value={form.maxClients} onChange={(e) => setForm({ ...form, maxClients: e.target.value })} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/50 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors" />
                      </div>
                      <div className="mt-4">
                        <label className="mb-2 block text-sm font-medium text-zinc-800 dark:text-zinc-100">
                          {t("admins.allowedPanelsInbounds")}
                          <span className="block text-xs font-normal text-zinc-500 mt-0.5">{t("admins.allowedPanelsInboundsHint")}</span>
                        </label>
                        <PanelInboundPicker
                          panels={panels ?? []}
                          inbounds={inbounds ?? []}
                          isLoading={inboundsLoading}
                          enabledPanels={form.enabledPanels}
                          selectedInbounds={form.selectedInbounds}
                          onChange={(next) => setForm(f => ({ ...f, ...next }))}
                        />
                        {form.selectedInbounds.length === 0 && (
                          <div className="mt-3 p-3 rounded-lg border border-amber-500/20 bg-amber-500/10 text-sm text-amber-600 dark:text-amber-400 flex items-start gap-2">
                            <AlertCircle size={18} className="shrink-0 mt-0.5" />
                            <div>
                              <strong>{t("admins.noPanelSelected")}</strong>
                              <p className="text-xs opacity-80 mt-1">{t("admins.noPanelSelectedHint")}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Section C: Limits */}
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 overflow-hidden">
              <button type="button" onClick={() => setOpenSection(openSection === 'limits' ? '' : 'limits')} className="w-full flex items-center justify-between p-4 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors">
                <div className="flex items-center gap-2 font-medium text-zinc-800 dark:text-zinc-100"><Database size={16} className="text-emerald-400"/> {t("admins.limits")}</div>
                <ChevronDown size={18} className={`text-zinc-500 transition-transform ${openSection === 'limits' ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence initial={false}>
                {openSection === 'limits' && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="p-4 grid grid-cols-2 gap-4 border-t border-zinc-200 dark:border-zinc-800">
                      <div className="col-span-2">
                        <label className="flex items-center gap-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.unlimitedTraffic}
                            onChange={(e) => setForm({
                              ...form,
                              unlimitedTraffic: e.target.checked,
                              balanceGb: e.target.checked ? "" : form.balanceGb,
                              refundOnDelete: e.target.checked ? false : form.refundOnDelete,
                              refundOnEdit: e.target.checked ? false : form.refundOnEdit,
                            })}
                            className="w-4 h-4 rounded text-blue-600 bg-zinc-100 border-zinc-300 dark:bg-zinc-700 dark:border-zinc-600 focus:ring-blue-500"
                          />
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{t("admins.unlimitedTrafficLabel")}</span>
                            <span className="text-xs text-zinc-500">{t("admins.unlimitedTrafficHint")}</span>
                          </div>
                        </label>
                      </div>
                      <QuotaModeToggle
                        value={form.quotaMode}
                        onChange={(quotaMode) => setForm({ ...form, quotaMode })}
                        disabled={form.unlimitedTraffic}
                      />
                      {form.quotaMode === "GLOBAL" ? (
                      <div>
                        <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">{t("admins.trafficLimitGb")} <span className="text-zinc-500 text-xs">{t("admins.noneValue")}</span></label>
                        {form.unlimitedTraffic ? (
                          <div className="w-full rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-500 font-semibold flex items-center gap-2">
                            <Infinity size={18} /> {t("common.unlimited")}
                          </div>
                        ) : (
                          <input type="number" min={0} placeholder="0" value={form.balanceGb} onChange={(e) => setForm({ ...form, balanceGb: e.target.value })} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/50 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors" />
                        )}
                      </div>
                      ) : (
                        <PerPanelQuotaFields
                          panels={panels ?? []}
                          enabledPanels={form.enabledPanels}
                          values={form.panelQuotaGb}
                          onChange={(panelId, gb) => setForm((f) => ({
                            ...f,
                            panelQuotaGb: { ...f.panelQuotaGb, [panelId]: gb },
                          }))}
                          disabled={form.unlimitedTraffic}
                        />
                      )}
                      <div>
                        <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">{t("admins.expiryDays")} <span className="text-zinc-500 text-xs">{t("admins.unlimitedHint")}</span></label>
                        <input type="number" min={0} placeholder="0" value={form.expiryDays} onChange={(e) => setForm({ ...form, expiryDays: e.target.value })} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/50 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors" />
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Section D: Status */}
            <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 overflow-hidden">
              <button type="button" onClick={() => setOpenSection(openSection === 'status' ? '' : 'status')} className="w-full flex items-center justify-between p-4 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors">
                <div className="flex items-center gap-2 font-medium text-zinc-800 dark:text-zinc-100"><Activity size={16} className="text-rose-400"/> {t("admins.statusSection")}</div>
                <ChevronDown size={18} className={`text-zinc-500 transition-transform ${openSection === 'status' ? 'rotate-180' : ''}`} />
              </button>
              <AnimatePresence initial={false}>
                {openSection === 'status' && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                    <div className="p-4 border-t border-zinc-200 dark:border-zinc-800">
                      <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">{t("admins.accountStatus")}</label>
                      <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/50 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors mb-4">
                        <option value="active">{t("admins.statusActive")}</option>
                        <option value="disabled">{t("admins.statusDisabled")}</option>
                      </select>
                      <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">{t("admins.trafficAccountingMode")}</label>
                      <select value={form.trafficMode} onChange={(e) => setForm({ ...form, trafficMode: e.target.value })} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/50 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors">
                        <option value="ALLOCATION">{t("admins.allocationMode")}</option>
                        <option value="USAGE">{t("admins.usageMode")}</option>
                      </select>
                      <div className="mt-4 space-y-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                        <label className="flex items-center gap-3 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer">
                          <input type="checkbox" checked={form.refundOnDelete} onChange={(e) => setForm({ ...form, refundOnDelete: e.target.checked })} className="w-4 h-4 rounded text-blue-600 bg-zinc-100 border-zinc-300 dark:bg-zinc-700 dark:border-zinc-600 focus:ring-blue-500" />
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{t("admins.refundOnDelete")}</span>
                            <span className="text-xs text-zinc-500">{t("admins.refundOnDeleteHint")}</span>
                          </div>
                        </label>
                        <label className="flex items-center gap-3 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer">
                          <input type="checkbox" checked={form.refundOnEdit} onChange={(e) => setForm({ ...form, refundOnEdit: e.target.checked })} className="w-4 h-4 rounded text-blue-600 bg-zinc-100 border-zinc-300 dark:bg-zinc-700 dark:border-zinc-600 focus:ring-blue-500" />
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{t("admins.refundOnEdit")}</span>
                            <span className="text-xs text-zinc-500">{t("admins.refundOnEditHint")}</span>
                          </div>
                        </label>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>


          </motion.div>

          <div className="flex justify-end gap-3 pt-6 mt-6 border-t border-zinc-200 dark:border-zinc-800">
            <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm font-medium text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors">{t("common.cancel")}</button>
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" disabled={create.isPending || form.selectedInbounds.length === 0} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors shadow-lg shadow-blue-900/20">
              {create.isPending ? t("common.creating") : t("admins.createAdmin")}
            </motion.button>
          </div>
        </form>
        </div>
      </motion.div>
    </motion.div>
  );
}

function EditAdminModal({ adminId, onClose, onSaved }: { adminId: string; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);

  const { data: admin, isLoading } = useQuery({
    queryKey: ["admin", adminId],
    queryFn: async () => (await api.get<Admin>(`/admins/${adminId}`)).data,
  });

  const [openSection, setOpenSection] = useState("limits");
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    username: "",
    status: "active",
    trafficMode: "ALLOCATION",
    balanceGb: "",
    trafficDeltaGb: "",
    maxClients: "",
    password: "",
    expiryDays: "",
    customTrafficDelta: "",
    customExpiryDelta: "",
    customClientsDelta: "",
    enabledPanels: [] as string[],
    selectedInbounds: [] as string[],
    canCustomizeBranding: true,
    storeEnabled: false,
    refundOnDelete: true,
    refundOnEdit: true,
    unlimitedTraffic: false,
    quotaMode: "GLOBAL" as QuotaMode,
    panelQuotaGb: {} as Record<string, string>,
  });

  const { data: panels } = useQuery<PanelRow[]>({
    queryKey: ["panels"],
    queryFn: async () => (await api.get<PanelRow[]>("/panels")).data,
  });

  const { data: inbounds, isLoading: inboundsLoading } = useQuery<InboundRow[]>({
    queryKey: ["inbounds-all"],
    queryFn: async () => (await api.get<InboundRow[]>("/inbounds")).data,
  });

  useEffect(() => {
    if (admin) {
      const assigned = admin.adminInbounds ?? [];
      const enabledPanels = Array.from(
        new Set(
          assigned
            .map((ai: any) => ai.inbound?.panel?.id)
            .filter((id: string | undefined): id is string => !!id),
        ),
      );
      const panelQuotaGb = Object.fromEntries(
        (admin.panelQuotas || []).map((q) => [
          q.panelId,
          q.balance ? (q.balance / (1024 ** 3)).toFixed(2).replace(/\.?0+$/, "") : "0",
        ]),
      );
      setForm((prev) => ({
        ...prev,
        username: admin.username || "",
        status: admin.status || "active",
        trafficMode: admin.trafficMode || "ALLOCATION",
        balanceGb: "",
        trafficDeltaGb: "",
        maxClients: admin.maxClients ? String(admin.maxClients) : "",
        selectedInbounds: assigned.map((ai: any) => ai.inbound.id),
        enabledPanels,
        canCustomizeBranding: admin.permissions ? admin.permissions.includes("canCustomizeBranding") : true,
        storeEnabled: admin.storeEnabled || false,
        refundOnDelete: (admin as any).refundOnDelete ?? true,
        refundOnEdit: (admin as any).refundOnEdit ?? true,
        unlimitedTraffic: (admin as any).unlimitedTraffic ?? false,
        quotaMode: (admin.quotaMode as QuotaMode) || "GLOBAL",
        panelQuotaGb,
      }));
    }
  }, [admin]);

  const directEdit = useMutation({
    mutationFn: async () => {
      if (!admin) throw new Error('Admin not loaded');
      const payload: any = {
        status: form.status,
        trafficMode: form.trafficMode,
        inboundIds: form.selectedInbounds,
        permissions: [],
        refundOnDelete: form.unlimitedTraffic ? false : form.refundOnDelete,
        refundOnEdit: form.unlimitedTraffic ? false : form.refundOnEdit,
        unlimitedTraffic: form.unlimitedTraffic,
      };
      if (!form.unlimitedTraffic) {
        payload.quotaMode = form.quotaMode;
        if (form.quotaMode === "PER_PANEL") {
          payload.panelQuotas = buildPanelQuotasPayload(form.enabledPanels, form.panelQuotaGb);
        } else if (form.balanceGb) {
          payload.balance = Math.round(Number(form.balanceGb) * 1024 * 1024 * 1024);
        } else if (form.trafficDeltaGb) {
          const delta = Math.round(Number(form.trafficDeltaGb) * 1024 * 1024 * 1024);
          payload.balance = Math.max(0, admin.balance + delta);
        }
      }
      if (form.maxClients) payload.maxClients = Number(form.maxClients);
      if (form.password.trim()) payload.password = form.password;
      if (form.expiryDays) payload.expiryTime = Date.now() + Number(form.expiryDays) * 24 * 60 * 60 * 1000;
      payload.storeEnabled = form.storeEnabled;
      const nextUsername = form.username.trim();
      if (nextUsername && nextUsername !== admin.username) {
        payload.username = nextUsername;
      }
      
      const res = await api.patch(`/admins/${adminId}`, payload);



      return res.data;
    },
    onSuccess: () => {
      toast(t("admins.adminUpdated"));
      qc.invalidateQueries({ queryKey: ["admin", adminId] });
      onSaved();
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.message ||
        (Array.isArray(err?.response?.data?.message)
          ? err.response.data.message.join(", ")
          : null) ||
        t("admins.updateFailed");
      toast(String(msg), "error");
    },
  });

  const fixMigration = useMutation({
    mutationFn: async () => (
      await api.post(`/admins/${adminId}/fix-migration`, {
        inboundIds: form.selectedInbounds.length ? form.selectedInbounds : undefined,
      })
    ).data,
    onSuccess: () => {
      toast(t("admins.migrationFixApplied"));
      qc.invalidateQueries({ queryKey: ["admin", adminId] });
      qc.invalidateQueries({ queryKey: ["admins"] });
    },
    onError: () => toast(t("admins.migrationFixFailed"), "error"),
  });

  if (isLoading) return (
    <motion.div {...MOTION_CONFIG.modalOverlay} className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-black/60 pt-[10dvh] px-4 sm:pt-0 sm:p-4">
      <motion.div {...MOTION_CONFIG.modalContent} className="w-full max-w-4xl rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-12 flex justify-center">
        <Spinner />
      </motion.div>
    </motion.div>
  );

  if (!admin) return null;

  const remaining = admin.unlimitedTraffic
    ? t("common.unlimited")
    : admin.balance > 0
      ? formatBytes(admin.balance)
      : admin.trafficMode === 'USAGE' ? formatBytes(0) : t("admins.exhausted");
  const expiryDaysLabel = admin.expiryTime === 0
    ? t("common.unlimited")
    : admin.expiryTime > Date.now()
      ? t("common.days", { count: Math.ceil((admin.expiryTime - Date.now()) / (1000 * 60 * 60 * 24)) })
      : t("admins.expiredDaysAgo", { count: Math.floor((Date.now() - admin.expiryTime) / (1000 * 60 * 60 * 24)) });
  // Detect migrated admins: have no adminInbounds set
  const isMigrated = !admin.adminInbounds || admin.adminInbounds.length === 0;

  return (
    <motion.div {...MOTION_CONFIG.modalOverlay} className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-black/60 pt-[10dvh] px-4 sm:pt-0 sm:p-4 backdrop-blur-sm">
      <motion.div {...MOTION_CONFIG.modalContent} className="w-full max-w-5xl rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden max-h-[90vh]">
        {/* Edit Actions — first on mobile */}
        <div className="w-full md:w-2/3 p-6 overflow-y-visible md:overflow-y-auto space-y-8 order-1 md:order-2">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
              <Settings2 size={18} className="text-zinc-500 dark:text-zinc-400" /> {t("admins.editAdminHeading")}
            </h3>
            <button onClick={onClose} className="text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"><X size={20} /></button>
          </div>

          <div className="space-y-4">
              {/* Section A: Limits & Status */}
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 overflow-hidden">
                <button type="button" onClick={() => setOpenSection(openSection === 'limits' ? '' : 'limits')} className="w-full flex items-center justify-between p-4 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors">
                  <div className="flex items-center gap-2 font-medium text-zinc-800 dark:text-zinc-100"><Database size={16} className="text-emerald-400"/> {t("admins.limitsAndStatus")}</div>
                  <ChevronDown size={18} className={`text-zinc-500 transition-transform ${openSection === 'limits' ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence initial={false}>
                  {openSection === 'limits' && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="p-4 border-t border-zinc-200 dark:border-zinc-800">
                        <div className="space-y-4">
                          <div className="col-span-2">
                            <label className="flex items-center gap-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={form.unlimitedTraffic}
                                onChange={(e) => setForm({
                                  ...form,
                                  unlimitedTraffic: e.target.checked,
                                  balanceGb: e.target.checked ? "" : form.balanceGb,
                                  trafficDeltaGb: e.target.checked ? "" : form.trafficDeltaGb,
                                  refundOnDelete: e.target.checked ? false : form.refundOnDelete,
                                  refundOnEdit: e.target.checked ? false : form.refundOnEdit,
                                })}
                                className="w-4 h-4 rounded text-blue-600 bg-zinc-100 border-zinc-300 dark:bg-zinc-700 dark:border-zinc-600 focus:ring-blue-500"
                              />
                              <div className="flex flex-col">
                                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{t("admins.unlimitedTrafficLabel")}</span>
                                <span className="text-xs text-zinc-500">{t("admins.unlimitedTrafficEditHint")}</span>
                              </div>
                            </label>
                          </div>
                          <QuotaModeToggle
                            value={form.quotaMode}
                            onChange={(quotaMode) => setForm({ ...form, quotaMode })}
                            disabled={form.unlimitedTraffic}
                          />
                          {form.quotaMode === "GLOBAL" ? (
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">{t("admins.setAvailableTraffic")}</label>
                              {form.unlimitedTraffic ? (
                                <div className="w-full rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-500 font-semibold flex items-center gap-2">
                                  <Infinity size={18} /> {t("common.unlimited")}
                                </div>
                              ) : (
                                <input type="number" placeholder={t("admins.leaveEmptyNoChange")} value={form.balanceGb} onChange={(e) => setForm({ ...form, balanceGb: e.target.value, trafficDeltaGb: "" })} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors placeholder:text-zinc-600" />
                              )}
                              {!form.unlimitedTraffic && <p className="text-[10px] text-zinc-500 mt-1">{t("admins.setsAbsoluteTraffic")}</p>}
                            </div>
                            <div>
                              <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">{t("admins.adjustTraffic")}</label>
                              {form.unlimitedTraffic ? (
                                <div className="w-full rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-emerald-500 font-semibold flex items-center gap-2">
                                  <Infinity size={18} /> {t("common.unlimited")}
                                </div>
                              ) : (
                                <>
                                  <input type="number" placeholder={t("admins.adjustTrafficPlaceholder")} value={form.trafficDeltaGb} onChange={(e) => setForm({ ...form, trafficDeltaGb: e.target.value, balanceGb: "" })} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors placeholder:text-zinc-600" />
                                  <p className="text-[10px] text-zinc-500 mt-1">{t("admins.adjustTrafficHint")}</p>
                                </>
                              )}
                            </div>
                          </div>
                          ) : (
                            <PerPanelQuotaFields
                              panels={panels ?? []}
                              enabledPanels={form.enabledPanels}
                              values={form.panelQuotaGb}
                              onChange={(panelId, gb) => setForm((f) => ({
                                ...f,
                                panelQuotaGb: { ...f.panelQuotaGb, [panelId]: gb },
                              }))}
                              disabled={form.unlimitedTraffic}
                            />
                          )}
                          <div className="grid grid-cols-2 gap-4">
                            <div className="col-span-2">
                              <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">{t("admins.addExpiryDays")}</label>
                              <input type="number" placeholder={t("admins.leaveEmptyNoChange")} value={form.expiryDays} onChange={(e) => setForm({ ...form, expiryDays: e.target.value })} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors placeholder:text-zinc-600" />
                            </div>
                          </div>
                          
                          {admin && !admin.unlimitedTraffic && !form.unlimitedTraffic && (
                            <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 mt-2">
                              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">{t("admins.currentTraffic")}</h3>
                              {admin.quotaMode === "PER_PANEL" && admin.panelQuotas?.length ? (
                                <div className="space-y-2">
                                  {admin.panelQuotas.map((q) => (
                                    <div key={q.panelId} className="flex justify-between items-center text-sm">
                                      <span className="text-zinc-500 truncate">{q.panelName || q.panelId}</span>
                                      <span className="font-medium text-blue-400 shrink-0 ms-2">{(q.balance / (1024 ** 3)).toFixed(2)} GB</span>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                              <div className="grid grid-cols-3 gap-4">
                                <div className="flex flex-col">
                                  <span className="text-[10px] text-zinc-500 mb-0.5">{t("admins.totalAllocated")}</span>
                                  <span className="text-sm font-medium text-emerald-400">{(admin.totalAssigned || 0) / (1024 * 1024 * 1024) > 0 ? ((admin.totalAssigned || 0) / (1024 * 1024 * 1024)).toFixed(2) : "0"} GB</span>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[10px] text-zinc-500 mb-0.5">{t("admins.availableTraffic")}</span>
                                  <span className="text-sm font-medium text-blue-400">{admin.balance ? (admin.balance / (1024 * 1024 * 1024)).toFixed(2) : "0"} GB</span>
                                </div>
                                <div className="flex flex-col text-end">
                                  <span className="text-[10px] text-zinc-500 mb-0.5">{t("admins.usedTrafficLabel")}</span>
                                  <span className="text-sm font-medium text-amber-400">{admin.usedTraffic ? (admin.usedTraffic / (1024 * 1024 * 1024)).toFixed(2) : "0"} GB</span>
                                </div>
                              </div>
                              )}
                            </div>
                          )}
                          
                          <div>
                            <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">{t("common.status")}</label>
                            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/50 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors mb-4">
                              <option value="active">{t("admins.statusActive")}</option>
                              <option value="disabled">{t("admins.statusDisabled")}</option>
                            </select>
                            
                            <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">{t("admins.trafficAccountingMode")}</label>
                            <select value={form.trafficMode} onChange={(e) => setForm({ ...form, trafficMode: e.target.value })} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/50 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors">
                              <option value="ALLOCATION">{t("admins.allocationMode")}</option>
                              <option value="USAGE">{t("admins.usageMode")}</option>
                            </select>
                            
                            <div className="mt-4 space-y-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                              <label className={`flex items-center gap-3 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer ${form.unlimitedTraffic ? 'opacity-50 pointer-events-none' : ''}`}>
                                <input type="checkbox" checked={form.refundOnDelete} disabled={form.unlimitedTraffic} onChange={(e) => setForm({ ...form, refundOnDelete: e.target.checked })} className="w-4 h-4 rounded text-blue-600 bg-zinc-100 border-zinc-300 dark:bg-zinc-700 dark:border-zinc-600 focus:ring-blue-500" />
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{t("admins.refundOnDelete")}</span>
                                  <span className="text-xs text-zinc-500">{t("admins.refundOnDeleteHint")}</span>
                                </div>
                              </label>
                              <label className={`flex items-center gap-3 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer ${form.unlimitedTraffic ? 'opacity-50 pointer-events-none' : ''}`}>
                                <input type="checkbox" checked={form.refundOnEdit} disabled={form.unlimitedTraffic} onChange={(e) => setForm({ ...form, refundOnEdit: e.target.checked })} className="w-4 h-4 rounded text-blue-600 bg-zinc-100 border-zinc-300 dark:bg-zinc-700 dark:border-zinc-600 focus:ring-blue-500" />
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{t("admins.refundOnEdit")}</span>
                                  <span className="text-xs text-zinc-500">{t("admins.refundOnEditHint")}</span>
                                </div>
                              </label>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Section B: Basic Info */}
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 overflow-hidden">
                <button type="button" onClick={() => setOpenSection(openSection === 'basic' ? '' : 'basic')} className="w-full flex items-center justify-between p-4 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors">
                  <div className="flex items-center gap-2 font-medium text-zinc-800 dark:text-zinc-100"><Shield size={16} className="text-blue-400"/> {t("admins.basicInformation")}</div>
                  <ChevronDown size={18} className={`text-zinc-500 transition-transform ${openSection === 'basic' ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence initial={false}>
                  {openSection === 'basic' && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="p-4 grid grid-cols-2 gap-4 border-t border-zinc-200 dark:border-zinc-800">
                        <div>
                          <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">{t("admins.username")}</label>
                          <input
                            type="text"
                            value={form.username}
                            onChange={(e) => setForm({ ...form, username: e.target.value })}
                            className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/50 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors"
                            autoComplete="off"
                            spellCheck={false}
                          />
                          <p className="mt-1.5 text-[11px] leading-relaxed text-zinc-500">
                            {t("admins.usernameRenameHint")}
                          </p>
                        </div>
                        <div className="relative">
                          <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">{t("admins.password")}</label>
                          <input type={showPassword ? "text" : "password"} placeholder={t("admins.passwordKeepBlank")} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/50 ps-3 pe-10 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors" />
                          <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute end-3 top-[28px] text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300">
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                        <div className="col-span-2">
                          <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">{t("admins.activePanelNode")}</label>
                          {isMigrated && form.enabledPanels.length === 0 && (
                            <div className="mb-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-2">
                              ⚠️ {t("admins.noPanelAssigned")}
                            </div>
                          )}
                          <div className="flex flex-wrap gap-2">
                            {form.enabledPanels.length === 0 ? (
                              <span className="text-xs text-zinc-500">{t("admins.noPanelSelected")}</span>
                            ) : (
                              (panels ?? [])
                                .filter(p => form.enabledPanels.includes(p.id))
                                .map(p => (
                                  <span key={p.id} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 px-2.5 py-1 text-xs font-medium text-zinc-700 dark:text-zinc-300">
                                    <Server size={12} className="text-blue-400" /> {p.name}
                                  </span>
                                ))
                            )}
                          </div>
                          <p className="mt-2 text-xs text-zinc-500">{t("admins.panelAssignmentMovedHint")}</p>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Section B: Permissions */}
              <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 overflow-hidden">
                <button type="button" onClick={() => setOpenSection(openSection === 'permissions' ? '' : 'permissions')} className="w-full flex items-center justify-between p-4 bg-white dark:bg-zinc-900 hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors">
                  <div className="flex items-center gap-2 font-medium text-zinc-800 dark:text-zinc-100"><Server size={16} className="text-purple-400"/> {t("admins.permissions")}</div>
                  <ChevronDown size={18} className={`text-zinc-500 transition-transform ${openSection === 'permissions' ? 'rotate-180' : ''}`} />
                </button>
                <AnimatePresence initial={false}>
                  {openSection === 'permissions' && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 space-y-4">
                        <div>
                          <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">{t("admins.maxClients")} <span className="text-zinc-500 text-xs">{t("admins.maxClientsHint")}</span></label>
                          <input type="number" min={0} value={form.maxClients} onChange={(e) => setForm({ ...form, maxClients: e.target.value })} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/50 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors" />
                        </div>
                        <div className="mt-4">
                          <label className="mb-2 block text-sm font-medium text-zinc-800 dark:text-zinc-100">
                            {t("admins.allowedPanelsInbounds")}
                            <span className="block text-xs font-normal text-zinc-500 mt-0.5">{t("admins.allowedPanelsInboundsHint")}</span>
                          </label>
                          <PanelInboundPicker
                            panels={panels ?? []}
                            inbounds={inbounds ?? []}
                            isLoading={inboundsLoading}
                            enabledPanels={form.enabledPanels}
                            selectedInbounds={form.selectedInbounds}
                            onChange={(next) => setForm(f => ({ ...f, ...next }))}
                          />
                          {form.selectedInbounds.length === 0 && (
                            <div className="mt-3 p-3 rounded-lg border border-amber-500/20 bg-amber-500/10 text-sm text-amber-600 dark:text-amber-400 flex items-start gap-2">
                              <AlertCircle size={18} className="shrink-0 mt-0.5" />
                              <div>
                                <strong>{t("admins.noPanelSelected")}</strong>
                                <p className="text-xs opacity-80 mt-1">{t("admins.noPanelSelectedHint")}</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex justify-end pt-4">
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => directEdit.mutate()} disabled={directEdit.isPending} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors shadow-lg shadow-blue-900/20">
                  {directEdit.isPending ? t("common.saving") : t("common.saveChanges")}
                </motion.button>
              </div>
          </div>
        </div>

        {/* Admin Statistics (Sidebar) — below form on mobile */}
        <div className="w-full md:w-1/3 shrink-0 bg-zinc-50 dark:bg-zinc-950/50 p-6 border-t md:border-t-0 md:border-e border-zinc-200 dark:border-zinc-800/50 flex flex-col order-2 md:order-1">
          <div className="flex justify-between items-start mb-6">
            <div>
              <h2 className="text-xl font-bold text-zinc-800 dark:text-zinc-100">{admin.username}</h2>
              <div className="text-sm text-zinc-500 mt-1">{t("common.status")}: {adminStatusLabel(admin.status, t)}</div>
            </div>
            <Badge tone={admin.status === "active" ? "green" : "red"}>{adminStatusLabel(admin.status, t)}</Badge>
          </div>

          <div className="space-y-4 flex-1">
            <SummaryStat icon={<Users size={16} />} label={t("admins.currentClients")} value={`${admin._count?.clients ?? 0}`} />
            {!admin.unlimitedTraffic && (
              <>
                <SummaryStat icon={<Activity size={16} />} label={t("admins.usedTrafficLabel")} value={formatBytes(admin.usedTraffic || 0)} />
                {admin.quotaMode === "PER_PANEL" && admin.panelQuotas?.length ? (
                  <div className="rounded-lg bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800/50 p-3 space-y-2">
                    <div className="text-xs text-zinc-500">{t("admins.currentPanelQuotas")}</div>
                    {admin.panelQuotas.map((q) => (
                      <div key={q.panelId} className="flex justify-between text-sm gap-2">
                        <span className="text-zinc-500 truncate">{q.panelName || q.panelId}</span>
                        <span className="font-medium text-zinc-800 dark:text-zinc-100 shrink-0">{formatBytes(q.balance)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <SummaryStat icon={<Database size={16} />} label={t("admins.availableTraffic")} value={remaining} highlight={!admin.unlimitedTraffic && admin.balance === 0} />
                )}
              </>
            )}
            {admin.unlimitedTraffic && (
              <SummaryStat icon={<Infinity size={16} />} label={t("nav.traffic")} value={t("common.unlimited")} />
            )}
            <SummaryStat icon={<Shield size={16} />} label={t("admins.assignedInbounds")} value={admin.adminInbounds?.length?.toString() ?? "0"} />
            <SummaryStat icon={<Clock size={16} />} label={t("admins.daysRemainingLabel")} value={expiryDaysLabel} highlight={admin.expiryTime > 0 && admin.expiryTime < Date.now()} />
            {isMigrated && (
              <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-3 text-xs text-amber-400">
                ⚠️ {t("admins.migratedWarning")}
              </div>
            )}
          </div>
          
          <div className="mt-6 pt-6 border-t border-zinc-200 dark:border-zinc-800/50 space-y-3">
            <div className="text-xs text-zinc-500">{t("admins.createdAt", { date: formatDate(admin.createdAt) })}</div>
            {isMigrated && (
              <motion.button
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={() => fixMigration.mutate()}
                disabled={fixMigration.isPending}
                className="w-full rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 px-3 py-2 text-xs font-medium transition-colors"
              >
                {fixMigration.isPending ? t("admins.fixing") : `🔧 ${t("admins.fixMigration")}`}
              </motion.button>
            )}
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
