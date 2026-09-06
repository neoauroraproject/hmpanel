"use client";

import React, { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatBytes, formatDate } from "@/lib/format";
import { Card, PageHeader, Badge, Spinner, ErrorBox } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useT } from "@/i18n";
import { Plus, Power, Edit2, Shield, Activity, HardDrive, Cpu, CreditCard, ChevronDown, Check, X, ShieldCheck, Download, Upload, Trash2, Eye, EyeOff, Server, Database, Save, ArrowRight, Store, Users, Clock, Settings2, Zap, Lock, AlertCircle, Infinity, Diamond, Search, Layers } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { MOTION_CONFIG } from "@/lib/motion";
import { NodeInboundBadge } from "@/components/NodeInboundBadge";
import { PluginSlot } from "@/components/PluginSlot";
import { useAuth } from "@/store/auth";
import { useLicenseActivation } from "@/hooks/useLicenseActivation";

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
  isOwner?: boolean;
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
  remark?: string | null;
  port: number;
  protocol: string;
  nodeId?: number | null;
  nodeName?: string | null;
  originNodeGuid?: string | null;
  panel: { id: string; name: string; panelType?: string | null };
}

interface PanelRow {
  id: string;
  name: string;
  url: string;
  version: string;
  status: string;
  panelType?: string | null;
  operable?: boolean;
  connectionHealth?: string;
}

function isXuiPanel(panel: { panelType?: string | null }) {
  const type = panel.panelType || "3x-ui";
  return type !== "eylan" && type !== "pasarguard";
}

function isNativePremiumPanel(panel: { panelType?: string | null }) {
  return panel.panelType === "eylan" || panel.panelType === "pasarguard";
}

function panelTypeI18nKey(type?: string | null) {
  if (type === "eylan") return "panels.typeEylan";
  if (type === "pasarguard") return "panels.typePasarguard";
  return "panels.typeXui";
}

function inboundTitle(inbound: InboundRow) {
  return (inbound.remark || inbound.tag || "").trim() || inbound.tag;
}

function adminStatusLabel(status: string, t: (key: string, params?: Record<string, string | number>) => string) {
  if (status === "active") return t("admins.statusActive");
  if (status === "disabled" || status === "suspended") return t("admins.statusDisabled");
  return status;
}

function adminRoleLabel(admin: { role: string; isOwner?: boolean }, t: (key: string) => string) {
  if (admin.isOwner) return t("admins.owner");
  if (admin.role === "SUPER_ADMIN") return t("nav.superAdmin");
  return t("nav.reseller");
}

export default function AdminsPage() {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);
  const sessionAdmin = useAuth((s) => s.admin);
  const [addOpen, setAddOpen] = useState(false);
  const [editAdmin, setEditAdmin] = useState<Admin | null>(null);
  
  const [activeTab, setActiveTab] = useState<'active' | 'disabled'>('active');
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const { data: selfProfile } = useQuery({
    queryKey: ["admin", sessionAdmin?.id],
    queryFn: async () => (await api.get<Admin>(`/admins/${sessionAdmin!.id}`)).data,
    enabled: !!sessionAdmin?.id,
  });
  const isOwner = sessionAdmin?.isOwner === true || selfProfile?.isOwner === true;

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
    onError: (err: any) => {
      const msg =
        err?.response?.data?.message ||
        (Array.isArray(err?.response?.data?.message)
          ? err.response.data.message.join(", ")
          : null) ||
        t("admins.actionFailed");
      toast(String(msg), "error");
    },
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
                      <div className="text-xs text-zinc-500">{adminRoleLabel(a, t)}</div>
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
                    {a.role === "SUPER_ADMIN" && !a.isOwner && isOwner && (
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
                    
                    {(a.isOwner ? isOwner : a.role !== "SUPER_ADMIN" || isOwner || sessionAdmin?.id === a.id) && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setEditAdmin(a)}
                      className="p-2 text-amber-400 hover:bg-amber-400/10 rounded-lg transition-colors"
                      title={t("admins.editAdminTitle")}
                    >
                      <Edit2 size={16} />
                    </motion.button>
                    )}

                    {(() => {
                      const isOwnerRow = a.isOwner === true;
                      const isExtraSuper = a.role === "SUPER_ADMIN" && !isOwnerRow;
                      const canDelete = isOwnerRow
                        ? false
                        : isExtraSuper
                          ? isOwner
                          : true;
                      const blockedByClients = (a._count?.clients ?? 0) > 0;
                      if (!canDelete) return null;
                      return (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      disabled={blockedByClients}
                      onClick={() => {
                        if (confirm(t("admins.deleteConfirm", { username: a.username }))) {
                          quickAction.mutate({ id: a.id, payload: { delete: true } }); 
                        }
                      }}
                      className={`p-2 rounded-lg transition-colors ${blockedByClients ? "text-zinc-600 cursor-not-allowed" : "text-red-400 hover:bg-red-400/10"}`}
                      title={blockedByClients ? t("admins.cannotDeleteWithClients") : isExtraSuper ? t("admins.deleteSuperAdmin") : t("admins.deleteAdmin")}
                    >
                      <Trash2 size={16} />
                    </motion.button>
                      );
                    })()}
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
            callerIsOwner={isOwner}
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
            callerIsOwner={isOwner}
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
  disabled,
  allowPremiumPanels,
  collectOnly,
  adminId,
  onProviderDraft,
}: {
  panels: PanelRow[];
  inbounds: InboundRow[];
  isLoading?: boolean;
  enabledPanels: string[];
  selectedInbounds: string[];
  onChange: (next: { enabledPanels: string[]; selectedInbounds: string[] }) => void;
  disabled?: boolean;
  allowPremiumPanels?: boolean;
  collectOnly?: boolean;
  adminId?: string;
  onProviderDraft?: (items: unknown[]) => void;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState<string[]>([]);
  const [inboundQueryByPanel, setInboundQueryByPanel] = useState<Record<string, string>>({});

  React.useEffect(() => {
    setExpanded((prev) => {
      const missing = enabledPanels.filter((id) => !prev.includes(id));
      return missing.length ? [...prev, ...missing] : prev;
    });
  }, [enabledPanels]);

  const visiblePanels = React.useMemo(
    () =>
      panels.filter((p) => {
        if (isXuiPanel(p)) return true;
        return !!allowPremiumPanels;
      }),
    [panels, allowPremiumPanels],
  );

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

  const togglePanel = (panel: PanelRow) => {
    const panelInboundIds = (inboundsByPanel.get(panel.id) ?? []).map((i) => i.id);
    if (enabledPanels.includes(panel.id)) {
      onChange({
        enabledPanels: enabledPanels.filter((id) => id !== panel.id),
        selectedInbounds: selectedInbounds.filter((id) => !panelInboundIds.includes(id)),
      });
    } else {
      setExpanded((prev) => (prev.includes(panel.id) ? prev : [...prev, panel.id]));
      onChange({
        enabledPanels: [...enabledPanels, panel.id],
        selectedInbounds: isXuiPanel(panel)
          ? Array.from(new Set([...selectedInbounds, ...panelInboundIds]))
          : selectedInbounds,
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

  const setPanelInbounds = (panelInboundIds: string[], selected: boolean) => {
    onChange({
      enabledPanels,
      selectedInbounds: selected
        ? Array.from(new Set([...selectedInbounds, ...panelInboundIds]))
        : selectedInbounds.filter((id) => !panelInboundIds.includes(id)),
    });
  };

  if (isLoading) {
    return <div className="text-xs text-zinc-500">{t("common.loadingInbounds")}</div>;
  }

  if (visiblePanels.length === 0) {
    return (
      <div className="text-xs text-zinc-500 p-2 text-center border rounded-lg border-dashed border-zinc-300 dark:border-zinc-700">
        {t("common.noInboundsAvailable")}
      </div>
    );
  }

  return (
    <div className={`space-y-3 max-h-[28rem] overflow-y-auto pe-1 custom-scrollbar ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      {visiblePanels.map((p) => {
        const native = isNativePremiumPanel(p);
        const panelInbounds = inboundsByPanel.get(p.id) ?? [];
        const frozen = p.operable === false && !native;
        const isEnabled = enabledPanels.includes(p.id);
        const isExpanded = expanded.includes(p.id);
        const q = (inboundQueryByPanel[p.id] || "").trim().toLowerCase();
        const filteredInbounds = q
          ? panelInbounds.filter((i) => {
              const hay = `${inboundTitle(i)} ${i.tag} ${i.protocol} ${i.port} ${i.nodeName || ""}`.toLowerCase();
              return hay.includes(q);
            })
          : panelInbounds;
        const checkedCount = panelInbounds.filter((i) => selectedInbounds.includes(i.id)).length;
        const allSelected = panelInbounds.length > 0 && checkedCount === panelInbounds.length;
        const typeKey = panelTypeI18nKey(p.panelType);
        const typeChip =
          p.panelType === "eylan"
            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20"
            : p.panelType === "pasarguard"
              ? "bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/20"
              : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
        const byProtocol = new Map<string, InboundRow[]>();
        for (const inbound of filteredInbounds) {
          const proto = inbound.protocol || "other";
          if (!byProtocol.has(proto)) byProtocol.set(proto, []);
          byProtocol.get(proto)!.push(inbound);
        }

        return (
          <div
            key={p.id}
            className={`rounded-xl border overflow-hidden transition-colors ${
              isEnabled
                ? "border-blue-500/30 bg-white dark:bg-zinc-900 shadow-sm"
                : "border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-950/40"
            }`}
          >
            <div className="flex items-center gap-3 p-3">
              <input
                type="checkbox"
                checked={isEnabled}
                disabled={frozen}
                onChange={() => togglePanel(p)}
                className="w-4 h-4 rounded text-blue-600 bg-zinc-100 border-zinc-300 dark:bg-zinc-700 dark:border-zinc-600 focus:ring-blue-500 disabled:opacity-40"
              />
              <button
                type="button"
                onClick={() => setExpanded((prev) => (isExpanded ? prev.filter((id) => id !== p.id) : [...prev, p.id]))}
                className="flex flex-1 items-center justify-between gap-2 text-start min-w-0"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 inline-flex items-center gap-2 min-w-0">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${frozen ? "bg-amber-400" : isEnabled ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"}`} />
                    <Server size={14} className="text-blue-400 shrink-0" />
                    <span className="truncate">{p.name}</span>
                    <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${typeChip}`}>
                      {t(typeKey)}
                    </span>
                    {native ? <Diamond size={12} className="text-emerald-500 shrink-0" /> : null}
                    {frozen ? (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-500">
                        {p.connectionHealth === "DISABLED"
                          ? t("panels.disconnected")
                          : t("panels.premiumUnavailable")}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs text-zinc-500 mt-0.5">
                    {native
                      ? t(typeKey)
                      : t("admins.inboundSelectedCount", { selected: checkedCount, total: panelInbounds.length })}
                  </span>
                </span>
                <ChevronDown size={16} className={`text-zinc-500 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
              </button>
            </div>

            {isEnabled && isExpanded && (
              <div className="px-3 pb-3 space-y-2 border-t border-zinc-200 dark:border-zinc-800 pt-3">
                {native ? (
                  <PluginSlot
                    name="admins.panel.access"
                    props={{
                      adminId,
                      collectOnly: collectOnly ?? !adminId,
                      hideSave: true,
                      panelId: p.id,
                      panelType: p.panelType,
                      panelEnabled: isEnabled,
                      onDraftChange: onProviderDraft,
                    }}
                  />
                ) : panelInbounds.length === 0 ? (
                  <div className="text-xs text-zinc-500 p-3 text-center border rounded-xl border-dashed border-zinc-300 dark:border-zinc-700">
                    {t("common.noInboundsOnPanel")}
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="relative flex-1 min-w-[10rem]">
                        <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 text-zinc-400" size={13} />
                        <input
                          type="text"
                          value={inboundQueryByPanel[p.id] || ""}
                          onChange={(e) =>
                            setInboundQueryByPanel((prev) => ({ ...prev, [p.id]: e.target.value }))
                          }
                          placeholder={t("admins.searchInbounds")}
                          className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 ps-8 pe-3 py-1.5 text-xs text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => setPanelInbounds(panelInbounds.map((i) => i.id), true)}
                        className={`text-[11px] font-semibold px-2 py-1 rounded-md ${allSelected ? "text-zinc-400" : "text-blue-600 dark:text-blue-400 hover:bg-blue-500/10"}`}
                      >
                        {t("common.selectAll")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setPanelInbounds(panelInbounds.map((i) => i.id), false)}
                        className="text-[11px] font-semibold px-2 py-1 rounded-md text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                      >
                        {t("common.selectNone")}
                      </button>
                    </div>
                    {filteredInbounds.length === 0 ? (
                      <div className="text-xs text-zinc-500 p-2 text-center">{t("common.noResults")}</div>
                    ) : (
                      [...byProtocol.entries()].map(([protocol, group]) => (
                        <div key={protocol} className="space-y-1.5">
                          <div className="flex items-center gap-1.5 px-0.5 pt-1 text-[10px] font-bold uppercase tracking-wider text-zinc-400">
                            <Layers size={11} /> {protocol}
                            <span className="font-medium normal-case tracking-normal">({group.length})</span>
                          </div>
                          {group.map((i) => {
                            const checked = selectedInbounds.includes(i.id);
                            return (
                              <label
                                key={i.id}
                                className={`flex items-center gap-3 p-2.5 rounded-xl border cursor-pointer transition-colors ${
                                  checked
                                    ? "border-blue-500/30 bg-blue-500/5"
                                    : "border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50"
                                }`}
                              >
                                <input
                                  type="checkbox"
                                  checked={checked}
                                  onChange={() => toggleInbound(i.id)}
                                  className="w-4 h-4 rounded text-blue-600 bg-zinc-100 border-zinc-300 dark:bg-zinc-700 dark:border-zinc-600 focus:ring-blue-500"
                                />
                                <div className="flex min-w-0 flex-1 flex-col">
                                  <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 inline-flex items-center gap-1.5 min-w-0">
                                    <span className="truncate">{inboundTitle(i)}</span>
                                    <NodeInboundBadge inbound={i} />
                                  </span>
                                  <span className="text-xs text-zinc-500">
                                    {t("admins.inboundProtocolLine", { protocol: i.protocol, port: i.port })}
                                    {i.tag && i.remark && i.tag !== i.remark ? ` · ${i.tag}` : ""}
                                  </span>
                                </div>
                                {checked ? <Check size={14} className="text-blue-500 shrink-0" /> : null}
                              </label>
                            );
                          })}
                        </div>
                      ))
                    )}
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

function mergeProviderDraft(store: React.MutableRefObject<Record<string, unknown>>, items: unknown[]) {
  for (const item of items as Array<{ provider?: string }>) {
    if (item?.provider) store.current[item.provider] = item;
  }
}

async function persistProviderAccess(adminId: string, drafts: Record<string, unknown>) {
  const items = Object.values(drafts).filter(Boolean);
  if (!items.length) return;
  try {
    await api.put(`/premium-modules/admin-recharge/provider-access/${adminId}`, { items });
  } catch {
    /* Community or module off — Core inbound save already applied */
  }
}

function hasResellerPanelAccess(
  form: { superAdmin: boolean; selectedInbounds: string[]; enabledPanels: string[] },
  panels: PanelRow[] | undefined,
) {
  if (form.superAdmin) return true;
  if (form.selectedInbounds.length > 0) return true;
  return form.enabledPanels.some((id) => {
    const panel = panels?.find((p) => p.id === id);
    return panel ? isNativePremiumPanel(panel) : false;
  });
}

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
      <div className="grid gap-2 sm:grid-cols-2">
        {enabledPanels.map((panelId) => {
          const panel = panels.find((p) => p.id === panelId);
          const type = panel?.panelType;
          const typeChip =
            type === "eylan"
              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
              : type === "pasarguard"
                ? "bg-violet-500/10 text-violet-600 dark:text-violet-400"
                : "bg-blue-500/10 text-blue-600 dark:text-blue-400";
          return (
            <div
              key={panelId}
              className="flex items-center gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950/40 px-3 py-2.5"
            >
              <div className="flex min-w-0 flex-1 flex-col">
                <span className="text-sm font-medium truncate text-zinc-800 dark:text-zinc-100">{panel?.name || panelId}</span>
                <span className={`mt-0.5 w-fit rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${typeChip}`}>
                  {t(panelTypeI18nKey(type))}
                </span>
              </div>
              <input
                type="number"
                min={0}
                placeholder="0"
                disabled={disabled}
                value={values[panelId] ?? ""}
                onChange={(e) => onChange(panelId, e.target.value)}
                className="w-24 rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-1.5 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500"
              />
              <span className="text-xs text-zinc-500 shrink-0">GB</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AddAdminModal({ callerIsOwner, onClose, onSaved }: { callerIsOwner: boolean; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const toast = useToast((s) => s.push);
  const { licenseQuery } = useLicenseActivation();
  const isPremium =
    licenseQuery.data?.edition === "PREMIUM" &&
    licenseQuery.data?.status !== "community" &&
    licenseQuery.data?.mode !== "disabled";
  const providerDrafts = React.useRef<Record<string, unknown>>({});
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
    superAdmin: false,
    quotaMode: "GLOBAL" as QuotaMode,
    panelQuotaGb: {} as Record<string, string>,
  });
  const limitsLocked = form.superAdmin;

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
        role: form.superAdmin ? "SUPER_ADMIN" : "RESELLER",
        status: form.status,
        trafficMode: form.superAdmin ? "ALLOCATION" : form.trafficMode,
        quotaMode: form.superAdmin || form.unlimitedTraffic ? "GLOBAL" : form.quotaMode,
        balance: form.superAdmin || form.unlimitedTraffic || form.quotaMode === "PER_PANEL"
          ? 0
          : (form.balanceGb ? Math.round(Number(form.balanceGb) * 1024 * 1024 * 1024) : 0),
        panelQuotas: !form.superAdmin && !form.unlimitedTraffic && form.quotaMode === "PER_PANEL"
          ? buildPanelQuotasPayload(form.enabledPanels, form.panelQuotaGb)
          : undefined,
        expiryTime: form.superAdmin ? 0 : (form.expiryDays ? Date.now() + Number(form.expiryDays) * 24 * 60 * 60 * 1000 : 0),
        maxClients: form.superAdmin ? 0 : (form.maxClients ? Number(form.maxClients) : 0),
        inboundIds: form.superAdmin ? [] : form.selectedInbounds,
        permissions: [],
        storeEnabled: form.superAdmin ? false : form.storeEnabled,
        storePanelId: form.storePanelId,
        refundOnDelete: form.superAdmin || form.unlimitedTraffic ? false : form.refundOnDelete,
        refundOnEdit: form.superAdmin || form.unlimitedTraffic ? false : form.refundOnEdit,
        unlimitedTraffic: form.superAdmin ? true : form.unlimitedTraffic,
      };
      const created = (await api.post("/admins", payload)).data;
      if (!form.superAdmin && created?.id) {
        const drafts = { ...providerDrafts.current };
        for (const panel of panels ?? []) {
          if (!isNativePremiumPanel(panel)) continue;
          const key = panel.panelType === "eylan" ? "eylan" : "pasarguard";
          if (!form.enabledPanels.includes(panel.id) && drafts[key]) {
            drafts[key] = { ...(drafts[key] as object), enabled: false, resources: [] };
          }
        }
        await persistProviderAccess(created.id, drafts);
      }
      return created;
    },
    onSuccess: () => {
      toast(t("admins.adminCreated"));
      onSaved();
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.message ||
        (Array.isArray(err?.response?.data?.message)
          ? err.response.data.message.join(", ")
          : null) ||
        t("admins.createFailed");
      toast(String(msg), "error");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.username || !form.password) return toast(t("admins.usernamePasswordRequired"), "error");
    if (form.password.length < 8) return toast(t("admins.passwordMinLength"), "error");
    if (!hasResellerPanelAccess(form, panels)) return toast(t("admins.inboundRequired"), "error");
    create.mutate();
  };

  return (
    <motion.div {...MOTION_CONFIG.modalOverlay} className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-black/60 pt-[10dvh] px-4 sm:pt-0 sm:p-4 backdrop-blur-sm">
      <motion.div {...MOTION_CONFIG.modalContent} className="w-full max-w-3xl max-h-[90vh] flex flex-col rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between bg-zinc-50 dark:bg-zinc-950/30">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <Shield size={20} className="text-blue-500" /> {t("admins.addAdminTitle")}
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
                      {callerIsOwner && (
                        <label className="col-span-2 flex items-start gap-3 p-3 rounded-lg border border-blue-500/30 bg-blue-500/5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.superAdmin}
                            onChange={(e) => setForm({
                              ...form,
                              superAdmin: e.target.checked,
                              unlimitedTraffic: e.target.checked ? true : form.unlimitedTraffic,
                            })}
                            className="mt-0.5 w-4 h-4 rounded text-blue-600 bg-zinc-100 border-zinc-300 dark:bg-zinc-700 dark:border-zinc-600 focus:ring-blue-500"
                          />
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{t("admins.makeSuperAdmin")}</span>
                            <span className="text-xs text-zinc-500">{t("admins.makeSuperAdminHint")}</span>
                          </div>
                        </label>
                      )}
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
                    <div className={`p-4 border-t border-zinc-200 dark:border-zinc-800 space-y-4 ${limitsLocked ? "opacity-50 pointer-events-none" : ""}`}>
                      {limitsLocked && (
                        <p className="text-xs text-zinc-500">{t("admins.superAdminLimitsDisabled")}</p>
                      )}
                      <div>
                        <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">{t("admins.maxClients")} <span className="text-zinc-500 text-xs">{t("admins.maxClientsHint")}</span></label>
                        <input type="number" min={0} placeholder="0" value={form.maxClients} onChange={(e) => setForm({ ...form, maxClients: e.target.value })} disabled={limitsLocked} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/50 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors" />
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
                          disabled={limitsLocked}
                          allowPremiumPanels={isPremium}
                          collectOnly
                          onProviderDraft={(items) => mergeProviderDraft(providerDrafts, items)}
                        />
                        {!limitsLocked && !hasResellerPanelAccess(form, panels) && (
                          <div className="mt-3 p-3 rounded-lg border border-amber-500/20 bg-amber-500/10 text-sm text-amber-600 dark:text-amber-400 flex items-start gap-2">
                            <AlertCircle size={18} className="shrink-0 mt-0.5" />
                            <div>
                              <strong>{t("admins.noPanelSelected")}</strong>
                              <p className="text-xs opacity-80 mt-1">{t("admins.noPanelSelectedHint")}</p>
                            </div>
                          </div>
                        )}
                        {!limitsLocked && isPremium && (
                          <label className="flex items-center gap-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={form.storeEnabled}
                              onChange={(e) => setForm({ ...form, storeEnabled: e.target.checked })}
                              className="w-4 h-4 rounded text-blue-600"
                            />
                            <div className="flex flex-1 flex-col">
                              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 inline-flex items-center gap-1.5">
                                {t("admins.enableStore")}
                                <Diamond size={12} className="text-emerald-500" />
                              </span>
                              <span className="text-xs text-zinc-500">{t("admins.enableStoreHint")}</span>
                            </div>
                          </label>
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
                    <div className={`p-4 grid grid-cols-2 gap-4 border-t border-zinc-200 dark:border-zinc-800 ${limitsLocked ? "opacity-50 pointer-events-none" : ""}`}>
                      {limitsLocked && (
                        <p className="col-span-2 text-xs text-zinc-500">{t("admins.superAdminLimitsDisabled")}</p>
                      )}
                      <div className="col-span-2">
                        <label className="flex items-center gap-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={form.superAdmin || form.unlimitedTraffic}
                            disabled={limitsLocked}
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
                        disabled={form.unlimitedTraffic || limitsLocked}
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
                      <select value={form.trafficMode} disabled={limitsLocked} onChange={(e) => setForm({ ...form, trafficMode: e.target.value })} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/50 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors disabled:opacity-50">
                        <option value="ALLOCATION">{t("admins.allocationMode")}</option>
                        <option value="USAGE">{t("admins.usageMode")}</option>
                      </select>
                      <div className={`mt-4 space-y-3 pt-4 border-t border-zinc-200 dark:border-zinc-800 ${limitsLocked ? "opacity-50 pointer-events-none" : ""}`}>
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
            <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} type="submit" disabled={create.isPending || !hasResellerPanelAccess(form, panels)} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors shadow-lg shadow-blue-900/20">
              {create.isPending ? t("common.creating") : t("admins.createAdmin")}
            </motion.button>
          </div>
        </form>
        </div>
      </motion.div>
    </motion.div>
  );
}

function EditAdminModal({ adminId, callerIsOwner, onClose, onSaved }: { adminId: string; callerIsOwner: boolean; onClose: () => void; onSaved: () => void }) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);
  const { licenseQuery } = useLicenseActivation();
  const isPremium =
    licenseQuery.data?.edition === "PREMIUM" &&
    licenseQuery.data?.status !== "community" &&
    licenseQuery.data?.mode !== "disabled";
  const providerDrafts = React.useRef<Record<string, unknown>>({});

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
    superAdmin: false,
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

  const { data: providerAccess = [] } = useQuery<Array<{ provider: string; enabled: boolean }>>({
    queryKey: ["admin-provider-access", adminId],
    enabled: isPremium && !!adminId,
    queryFn: async () =>
      (await api.get(`/premium-modules/admin-recharge/provider-access/${adminId}`)).data,
    retry: false,
  });

  useEffect(() => {
    if (admin) {
      const assigned = admin.adminInbounds ?? [];
      const fromInbounds = assigned
        .map((ai: any) => ai.inbound?.panel?.id)
        .filter((id: string | undefined): id is string => !!id);
      const fromQuota = (admin.panelQuotas || []).map((q) => q.panelId);
      const fromNative = (panels ?? [])
        .filter((p) => isNativePremiumPanel(p) && providerAccess.some((r) => r.enabled && r.provider === p.panelType))
        .map((p) => p.id);
      const enabledPanels = Array.from(new Set([...fromInbounds, ...fromQuota, ...fromNative]));
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
        superAdmin: admin.role === "SUPER_ADMIN",
        quotaMode: (admin.quotaMode as QuotaMode) || "GLOBAL",
        panelQuotaGb,
      }));
    }
  }, [admin, panels, providerAccess]);

  const directEdit = useMutation({
    mutationFn: async () => {
      if (!admin) throw new Error('Admin not loaded');
      const payload: any = {
        status: form.status,
        trafficMode: form.superAdmin ? "ALLOCATION" : form.trafficMode,
        inboundIds: form.superAdmin ? undefined : form.selectedInbounds,
        permissions: [],
        refundOnDelete: form.superAdmin || form.unlimitedTraffic ? false : form.refundOnDelete,
        refundOnEdit: form.superAdmin || form.unlimitedTraffic ? false : form.refundOnEdit,
        unlimitedTraffic: form.superAdmin ? true : form.unlimitedTraffic,
      };
      if (callerIsOwner && !admin.isOwner) {
        payload.role = form.superAdmin ? "SUPER_ADMIN" : "RESELLER";
      }
      if (!form.superAdmin && !form.unlimitedTraffic) {
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
      if (!form.superAdmin && form.maxClients) payload.maxClients = Number(form.maxClients);
      if (form.password.trim()) payload.password = form.password;
      if (!form.superAdmin && form.expiryDays) payload.expiryTime = Date.now() + Number(form.expiryDays) * 24 * 60 * 60 * 1000;
      payload.storeEnabled = form.superAdmin ? false : form.storeEnabled;
      const nextUsername = form.username.trim();
      if (nextUsername && nextUsername !== admin.username) {
        payload.username = nextUsername;
      }
      
      const res = await api.patch(`/admins/${adminId}`, payload);
      if (!form.superAdmin) {
        const drafts = { ...providerDrafts.current };
        for (const panel of panels ?? []) {
          if (!isNativePremiumPanel(panel)) continue;
          const key = panel.panelType === "eylan" ? "eylan" : "pasarguard";
          if (!form.enabledPanels.includes(panel.id)) {
            drafts[key] = {
              provider: key,
              enabled: false,
              trafficBytes: "0",
              maxClients: 0,
              unlimitedClients: true,
              unlimitedTraffic: false,
              expiryDays: 0,
              resources: [],
            };
          }
        }
        await persistProviderAccess(adminId, drafts);
      }
      return res.data;



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

  const remaining = admin.unlimitedTraffic || form.superAdmin
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
  const isMigrated = admin.role !== "SUPER_ADMIN" && !form.superAdmin && (!admin.adminInbounds || admin.adminInbounds.length === 0);
  const limitsLocked = form.superAdmin;
  const showSuperAdminToggle = callerIsOwner && !admin.isOwner;
  const statusLocked = admin.isOwner === true;

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
                          {showSuperAdminToggle && (
                            <label className="flex items-start gap-3 p-3 rounded-lg border border-blue-500/30 bg-blue-500/5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={form.superAdmin}
                                onChange={(e) => setForm({
                                  ...form,
                                  superAdmin: e.target.checked,
                                  unlimitedTraffic: e.target.checked ? true : form.unlimitedTraffic,
                                })}
                                className="mt-0.5 w-4 h-4 rounded text-blue-600 bg-zinc-100 border-zinc-300 dark:bg-zinc-700 dark:border-zinc-600 focus:ring-blue-500"
                              />
                              <div className="flex flex-col">
                                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{t("admins.makeSuperAdmin")}</span>
                                <span className="text-xs text-zinc-500">{t("admins.makeSuperAdminHint")}</span>
                              </div>
                            </label>
                          )}
                          {limitsLocked && (
                            <p className="text-xs text-zinc-500">{t("admins.superAdminLimitsDisabled")}</p>
                          )}
                          <div className={`space-y-4 ${limitsLocked ? "opacity-50 pointer-events-none" : ""}`}>
                          <div className="col-span-2">
                            <label className="flex items-center gap-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={form.superAdmin || form.unlimitedTraffic}
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
                            disabled={form.unlimitedTraffic || limitsLocked}
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
                            <select value={form.status} disabled={statusLocked} onChange={(e) => setForm({ ...form, status: e.target.value })} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/50 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors mb-4 disabled:opacity-50">
                              <option value="active">{t("admins.statusActive")}</option>
                              <option value="disabled">{t("admins.statusDisabled")}</option>
                            </select>
                            
                            <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">{t("admins.trafficAccountingMode")}</label>
                            <select value={form.trafficMode} disabled={limitsLocked} onChange={(e) => setForm({ ...form, trafficMode: e.target.value })} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/50 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors disabled:opacity-50">
                              <option value="ALLOCATION">{t("admins.allocationMode")}</option>
                              <option value="USAGE">{t("admins.usageMode")}</option>
                            </select>
                            
                            <div className="mt-4 space-y-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                              <label className={`flex items-center gap-3 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer ${form.unlimitedTraffic || limitsLocked ? 'opacity-50 pointer-events-none' : ''}`}>
                                <input type="checkbox" checked={form.refundOnDelete} disabled={form.unlimitedTraffic || limitsLocked} onChange={(e) => setForm({ ...form, refundOnDelete: e.target.checked })} className="w-4 h-4 rounded text-blue-600 bg-zinc-100 border-zinc-300 dark:bg-zinc-700 dark:border-zinc-600 focus:ring-blue-500" />
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{t("admins.refundOnDelete")}</span>
                                  <span className="text-xs text-zinc-500">{t("admins.refundOnDeleteHint")}</span>
                                </div>
                              </label>
                              <label className={`flex items-center gap-3 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer ${form.unlimitedTraffic || limitsLocked ? 'opacity-50 pointer-events-none' : ''}`}>
                                <input type="checkbox" checked={form.refundOnEdit} disabled={form.unlimitedTraffic || limitsLocked} onChange={(e) => setForm({ ...form, refundOnEdit: e.target.checked })} className="w-4 h-4 rounded text-blue-600 bg-zinc-100 border-zinc-300 dark:bg-zinc-700 dark:border-zinc-600 focus:ring-blue-500" />
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{t("admins.refundOnEdit")}</span>
                                  <span className="text-xs text-zinc-500">{t("admins.refundOnEditHint")}</span>
                                </div>
                              </label>
                            </div>
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
                      <div className={`p-4 border-t border-zinc-200 dark:border-zinc-800 space-y-4 ${limitsLocked ? "opacity-50 pointer-events-none" : ""}`}>
                        {limitsLocked && (
                          <p className="text-xs text-zinc-500">{t("admins.superAdminLimitsDisabled")}</p>
                        )}
                        <div>
                          <label className="mb-1 block text-sm font-medium text-zinc-500 dark:text-zinc-400">{t("admins.maxClients")} <span className="text-zinc-500 text-xs">{t("admins.maxClientsHint")}</span></label>
                          <input type="number" min={0} value={form.maxClients} disabled={limitsLocked} onChange={(e) => setForm({ ...form, maxClients: e.target.value })} className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/50 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors" />
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
                            disabled={limitsLocked}
                            allowPremiumPanels={isPremium}
                            adminId={adminId}
                            onProviderDraft={(items) => mergeProviderDraft(providerDrafts, items)}
                          />
                          {!limitsLocked && !hasResellerPanelAccess(form, panels) && (
                            <div className="mt-3 p-3 rounded-lg border border-amber-500/20 bg-amber-500/10 text-sm text-amber-600 dark:text-amber-400 flex items-start gap-2">
                              <AlertCircle size={18} className="shrink-0 mt-0.5" />
                              <div>
                                <strong>{t("admins.noPanelSelected")}</strong>
                                <p className="text-xs opacity-80 mt-1">{t("admins.noPanelSelectedHint")}</p>
                              </div>
                            </div>
                          )}
                          {!limitsLocked && isPremium && (
                            <label className="mt-3 flex items-center gap-3 p-3 rounded-lg border border-zinc-200 dark:border-zinc-800 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={form.storeEnabled}
                                onChange={(e) => setForm({ ...form, storeEnabled: e.target.checked })}
                                className="w-4 h-4 rounded text-blue-600"
                              />
                              <div className="flex flex-1 flex-col">
                                <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 inline-flex items-center gap-1.5">
                                  {t("admins.enableStore")}
                                  <Diamond size={12} className="text-emerald-500" />
                                </span>
                                <span className="text-xs text-zinc-500">{t("admins.enableStoreHint")}</span>
                              </div>
                            </label>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              <div className="flex justify-end pt-4">
                <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={() => {
                  if (!hasResellerPanelAccess(form, panels)) {
                    toast(t("admins.inboundRequired"), "error");
                    return;
                  }
                  directEdit.mutate();
                }} disabled={directEdit.isPending} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 transition-colors shadow-lg shadow-blue-900/20">
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
              <div className="text-sm text-zinc-500 mt-1">{adminRoleLabel(admin, t)}</div>
            </div>
            <Badge tone={admin.status === "active" ? "green" : "red"}>{adminStatusLabel(admin.status, t)}</Badge>
          </div>

          <div className="space-y-4 flex-1">
            <SummaryStat icon={<Users size={16} />} label={t("admins.currentClients")} value={`${admin._count?.clients ?? 0}`} />
            {!form.superAdmin && !admin.unlimitedTraffic && (
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
            {(form.superAdmin || admin.unlimitedTraffic) && (
              <SummaryStat icon={<Infinity size={16} />} label={t("nav.traffic")} value={t("common.unlimited")} />
            )}
            {!form.superAdmin && (
            <SummaryStat icon={<Shield size={16} />} label={t("admins.assignedInbounds")} value={admin.adminInbounds?.length?.toString() ?? "0"} />
            )}
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
