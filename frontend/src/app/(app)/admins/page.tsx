"use client";

import React, { useEffect, useState } from "react";
import { keepPreviousData, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { formatBytes, formatDate } from "@/lib/format";
import { Card, PageHeader, Badge, Spinner, ErrorBox } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useT } from "@/i18n";
import { Plus, Power, Edit2, Shield, Activity, HardDrive, Cpu, CreditCard, ChevronDown, Check, X, ShieldCheck, Download, Upload, Trash2, Eye, EyeOff, Server, Database, Save, ArrowRight, Store, Users, Clock, Settings2, Zap, Lock, AlertCircle, Infinity, Search, Layers } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { MOTION_CONFIG } from "@/lib/motion";
import { NodeInboundBadge } from "@/components/NodeInboundBadge";
import { PluginSlot } from "@/components/PluginSlot";
import { usePluginRegistry } from "@/store/pluginRegistry";
import { useAuth } from "@/store/auth";
import { useLicenseActivation } from "@/hooks/useLicenseActivation";
import { PremiumGem } from "@/components/PremiumGem";
import {
  applyCountDelta,
  applyExpiryDeltaMs,
  applyTrafficDeltaBytes,
} from "./quota-adjust";
import { useUiStyle } from "@/store/uiStyle";
import { ModernAdminsView } from "./ModernAdminsView";
import { AdminBulkBar } from "./AdminBulkBar";
import { QuickQuotaDialog } from "./QuickQuotaDialog";
import { AdminPremiumAccess, postPremiumAssignment, useAssignableModules } from "./AdminPremiumAccess";

interface AdminPanelQuotaRow {
  panelId: string;
  panelName?: string;
  panelType?: string | null;
  balance: number;
  totalAssigned?: number;
  /** 0 = unlimited on this panel */
  maxClients?: number;
  maxDeviceLimit?: number;
  maxExpireDays?: number;
  maxClientTrafficGb?: number;
  trafficMode?: string;
  unlimitedTraffic?: boolean;
}

/** Per-panel caps as raw form strings. On edit these are +/- deltas; empty = no change. */
interface PanelQuotaForm {
  gb: string;
  maxClients: string;
  maxDeviceLimit: string;
  maxExpireDays: string;
  maxClientTrafficGb: string;
  trafficMode: string;
  unlimitedTraffic: boolean;
}

type QuotaBaseline = {
  balance: number;
  maxClients: number;
  maxDeviceLimit: number;
  maxExpireDays: number;
  maxClientTrafficGb: number;
  unlimitedTraffic?: boolean;
};

const EMPTY_PANEL_QUOTA: PanelQuotaForm = {
  gb: "",
  maxClients: "",
  maxDeviceLimit: "",
  maxExpireDays: "",
  maxClientTrafficGb: "",
  trafficMode: "ALLOCATION",
  unlimitedTraffic: false,
};

const EMPTY_QUOTA_BASELINE: QuotaBaseline = {
  balance: 0,
  maxClients: 0,
  maxDeviceLimit: 0,
  maxExpireDays: 0,
  maxClientTrafficGb: 0,
};

export interface Admin {
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
  maxDeviceLimit?: number; // 0 = Unlimited
  maxExpireDays?: number; // 0 = Unlimited
  maxClientTrafficGb?: number; // 0 = Unlimited
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

type QuotaMode = "GLOBAL" | "PER_PANEL";

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
  const { modern } = useUiStyle();
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);
  const sessionAdmin = useAuth((s) => s.admin);
  const [addOpen, setAddOpen] = useState(false);
  const [editAdmin, setEditAdmin] = useState<Admin | null>(null);
  const [quickFor, setQuickFor] = useState<Admin | null>(null);
  
  const [activeTab, setActiveTab] = useState<'active' | 'disabled'>('active');
  
  const [selected, setSelected] = useState<string[]>([]);
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

  const { data, isLoading, isFetching, error } = useQuery({
    queryKey: ["admins", activeTab, debouncedSearch],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const q = new URLSearchParams({
        limit: "100",
        status: activeTab,
        ...(debouncedSearch ? { search: debouncedSearch } : {})
      });
      return (await api.get<{ data: Admin[] }>(`/admins?${q.toString()}`)).data;
    },
  });

  // Deleting keeps the admin's clients: say so, and where to find them afterwards.
  const deleteConfirmText = (a: { username: string; _count?: { clients?: number } }) => {
    const count = a._count?.clients ?? 0;
    return count > 0
      ? t("admins.deleteConfirmWithClients", { username: a.username, count })
      : t("admins.deleteConfirm", { username: a.username });
  };

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

  useEffect(() => {
    if (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("add") === "1") {
      setAddOpen(true);
    }
  }, []);

  const toggleStatus = (admin: Admin) => {
    quickAction.mutate({ id: admin.id, payload: { status: admin.status === 'active' ? 'disabled' : 'active' } });
  };

  // Keep the page (and search input) mounted while the query key changes —
  // returning <Spinner /> on isLoading unmounts the input and closes the mobile keyboard.
  if (isLoading && !data) return <Spinner />;
  if (error && !data) return <ErrorBox message={t("admins.loadFailed")} />;

  const admins = data?.data ?? [];
  const selectable = admins.filter((a) => a.role !== "SUPER_ADMIN");
  const selectedIds = selected.filter((id) => selectable.some((a) => a.id === id));
  const onSelect = (id: string, on: boolean) =>
    setSelected((prev) => (on ? [...new Set([...prev, id])] : prev.filter((x) => x !== id)));
  const onSelectAll = (ids: string[], on: boolean) =>
    setSelected((prev) => (on ? [...new Set([...prev, ...ids])] : prev.filter((x) => !ids.includes(x))));

  return (
    <motion.div {...MOTION_CONFIG.page} className={selectedIds.length ? "pb-24" : undefined}>
      <AdminBulkBar ids={selectedIds} onClear={() => setSelected([])} />
      {modern ? (
        <ModernAdminsView
          admins={admins}
          activeTab={activeTab}
          onTab={setActiveTab}
          search={search}
          onSearch={setSearch}
          fetching={isFetching && !!data}
          isOwner={isOwner}
          roleLabel={(a) => adminRoleLabel(a, t)}
          onAdd={() => setAddOpen(true)}
          onEdit={setEditAdmin}
          onQuick={setQuickFor}
          onToggle={toggleStatus}
          selected={selectedIds}
          onSelect={onSelect}
          onSelectAll={onSelectAll}
          onDelete={(a) => {
            if (confirm(deleteConfirmText(a))) {
              quickAction.mutate({ id: a.id, payload: { delete: true } });
            }
          }}
        />
      ) : (
      <>
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
          {isFetching && data ? (
            <div className="pointer-events-none absolute inset-y-0 end-3 flex items-center">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-zinc-300 border-t-blue-500 dark:border-zinc-600 dark:border-t-blue-400" />
            </div>
          ) : null}
        </div>
      </div>

      <Card className="overflow-x-auto p-0 shadow-lg border-transparent md:border-zinc-200 dark:border-zinc-800/50 bg-transparent md:bg-zinc-50 dark:bg-zinc-950">
        <table className="w-full text-sm block md:table">
          <thead className="hidden md:table-header-group">
            <tr className="border-b border-zinc-200 dark:border-zinc-800 text-start text-xs uppercase tracking-wide text-zinc-500 bg-white dark:bg-zinc-900/50">
              <th className="px-4 py-3 font-medium">
                <span className="flex items-center gap-3">
                  {selectable.length ? (
                    <input
                      type="checkbox"
                      checked={selectable.every((a) => selectedIds.includes(a.id))}
                      onChange={(e) => onSelectAll(selectable.map((a) => a.id), e.target.checked)}
                      aria-label={t("adminBulk.selectAll")}
                      className="h-4 w-4 cursor-pointer"
                    />
                  ) : null}
                  {t("admins.colAdmin")}
                </span>
              </th>
              <th className="px-4 py-3 font-medium">{t("common.status")}</th>
              <th className="px-4 py-3 font-medium">{t("admins.colTraffic")}</th>
              <th className="px-4 py-3 font-medium">{t("admins.colClients")}</th>
              <th className="px-4 py-3 font-medium">{t("admins.colExpiry")}</th>
              <th className="px-4 py-3 font-medium text-end">{t("common.actions")}</th>
            </tr>
          </thead>
          <tbody className="block md:table-row-group space-y-3 md:space-y-0 md:divide-y md:divide-zinc-800/50">
            {admins.map((a, i) => {
              const canEdit = a.isOwner ? isOwner : true;
              return (
              <React.Fragment key={a.id}>
              <motion.tr 
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.2, delay: i * 0.03 }}
                className="block md:table-row group border border-zinc-200 dark:border-zinc-800 md:border-none rounded-xl md:rounded-none bg-zinc-50 dark:bg-zinc-950 md:bg-transparent last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-900/60 transition-colors"
              >
                <td className="block md:table-cell px-4 py-3">
                  <div className="flex justify-between items-center md:block">
                    <div>
                      <div className="font-semibold text-zinc-800 dark:text-zinc-100 flex items-center gap-2">
                        {a.role !== "SUPER_ADMIN" ? (
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(a.id)}
                            onChange={(e) => onSelect(a.id, e.target.checked)}
                            aria-label={a.username}
                            className="h-4 w-4 shrink-0 cursor-pointer"
                          />
                        ) : null}
                        {canEdit ? (
                          <button
                            type="button"
                            onClick={() => setEditAdmin(a)}
                            title={t("admins.editAdminTitle")}
                            className="text-start text-blue-600 dark:text-blue-400 hover:underline focus:outline-none focus-visible:underline"
                          >
                            {a.username}
                          </button>
                        ) : (
                          a.username
                        )}
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
                      <div className="font-medium text-blue-400">{t("admins.quotaModeGlobal")}</div>
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
                  {a.role === "SUPER_ADMIN" ? <span className="text-zinc-600">—</span> : a.quotaMode === "PER_PANEL" && a.maxClients === 0 ? (
                    <div className="text-xs">
                      <div className="font-medium text-purple-400">{a._count?.clients ?? 0}</div>
                      <div className="text-zinc-500">{t("admins.quotaModePerPanel")}</div>
                    </div>
                  ) : (
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

                <td className="block md:table-cell px-4 py-3 border-t border-zinc-200 dark:border-zinc-800/50 md:border-0 mt-2 md:mt-0 transition-all duration-300 text-end">
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
                    {a.role === "SUPER_ADMIN" && !a.isOwner && (
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
                    
                    {canEdit && a.role !== "SUPER_ADMIN" && !a.unlimitedTraffic && (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setQuickFor(a)}
                      className="p-2 text-blue-500 hover:bg-blue-500/10 rounded-lg transition-colors"
                      title={t("adminTools.quickTopUp")}
                      aria-label={t("adminTools.quickTopUp")}
                    >
                      <Zap size={16} />
                    </motion.button>
                    )}
                    {canEdit && (
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
                      const canDelete = !isOwnerRow;
                      if (!canDelete) return null;
                      return (
                    <motion.button
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        if (confirm(deleteConfirmText(a))) {
                          quickAction.mutate({ id: a.id, payload: { delete: true } }); 
                        }
                      }}
                      className="p-2 rounded-lg transition-colors text-red-400 hover:bg-red-400/10"
                      title={isExtraSuper ? t("admins.deleteSuperAdmin") : t("admins.deleteAdmin")}
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
      </>
      )}

      <AnimatePresence>
        {addOpen && (
          <AddAdminModal
            callerIsOwner={sessionAdmin?.role === "SUPER_ADMIN"}
            onClose={() => setAddOpen(false)}
            onSaved={() => {
              setAddOpen(false);
              qc.invalidateQueries({ queryKey: ["admins"] });
            }}
          />
        )}

        {quickFor && <QuickQuotaDialog key={quickFor.id} adminId={quickFor.id} onClose={() => setQuickFor(null)} />}

        {editAdmin && (
          <EditAdminModal
            adminId={editAdmin.id}
            callerIsOwner={sessionAdmin?.role === "SUPER_ADMIN"}
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

/** Traffic pool + client count stay visible; fixed per-client caps live in a closed accordion. */
function UnlimitedTrafficToggle({
  checked,
  disabled,
  onChange,
  hintKey = "admins.unlimitedTrafficHint",
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  hintKey?: string;
}) {
  const t = useT();
  return (
    <label className={`flex items-start gap-3 p-3 rounded-lg border border-emerald-500/30 bg-emerald-500/5 cursor-pointer ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 w-4 h-4 rounded text-emerald-600 bg-zinc-100 border-zinc-300 dark:bg-zinc-700 dark:border-zinc-600 focus:ring-emerald-500"
      />
      <div className="flex flex-col">
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{t("admins.unlimitedTraffic")}</span>
        <span className="text-xs text-zinc-500">{t(hintKey)}</span>
      </div>
    </label>
  );
}

function PanelLimitFields({
  panelType,
  value,
  onChange,
  disabled,
  current,
  title,
  deviceKey,
  trafficModeHint,
  hideTraffic,
  unlimited,
  onUnlimitedChange,
  unlimitedHintKey,
}: {
  panelType?: string | null;
  value: PanelQuotaForm;
  onChange: (patch: Partial<PanelQuotaForm>) => void;
  disabled?: boolean;
  current?: QuotaBaseline;
  title?: string;
  deviceKey?: string;
  trafficModeHint?: string;
  hideTraffic?: boolean;
  unlimited?: boolean;
  onUnlimitedChange?: (next: boolean) => void;
  unlimitedHintKey?: string;
}) {
  const trafficUnlimited = Boolean(unlimited ?? value.unlimitedTraffic ?? hideTraffic);
  const t = useT();
  const [capsOpen, setCapsOpen] = useState(false);
  const fieldClass =
    "w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500";
  const labelClass = "block text-sm font-medium text-zinc-600 dark:text-zinc-400";
  const stock = current ?? EMPTY_QUOTA_BASELINE;
  const stockCount = (n: number) => (n > 0 ? String(n) : t("admins.stockUnlimited"));
  const stockGb = trafficUnlimited
    ? t("admins.stockUnlimited")
    : stock.balance > 0
      ? `${(Math.round((stock.balance / 1024 ** 3) * 100) / 100).toString()} GB`
      : "0 GB";
  const capsSummary = trafficUnlimited
    ? t("admins.clientCapsSummaryNoTraffic", {
        days: stockCount(stock.maxExpireDays),
        devices: stockCount(stock.maxDeviceLimit),
      })
    : t("admins.clientCapsSummary", {
        traffic: stockCount(stock.maxClientTrafficGb),
        days: stockCount(stock.maxExpireDays),
        devices: stockCount(stock.maxDeviceLimit),
      });

  const capField = (
    label: string,
    stockValue: number,
    fieldValue: string,
    key: keyof Pick<PanelQuotaForm, "maxClientTrafficGb" | "maxExpireDays" | "maxDeviceLimit">,
  ) => (
    <div className="min-w-0">
      <div className="mb-1.5 flex min-w-0 flex-col gap-0.5">
        <label className={`${labelClass} leading-snug`}>{label}</label>
        <span className="text-xs font-medium text-zinc-500">
          {t("admins.stockAvailable", { value: stockCount(stockValue) })}
        </span>
      </div>
      <input
        type="text"
        inputMode="decimal"
        autoComplete="off"
        placeholder={t("admins.adjustTrafficPlaceholder")}
        disabled={disabled}
        value={fieldValue}
        onChange={(e) => onChange({ [key]: e.target.value })}
        className={fieldClass}
      />
    </div>
  );

  return (
    <div
      className={`space-y-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-950/40 p-3.5 ${
        disabled ? "opacity-50 pointer-events-none" : ""
      }`}
    >
      <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-zinc-500">
        <Database size={13} className="text-emerald-500" /> {title || t("admins.panelLimitsTitle")}
      </div>
      {onUnlimitedChange ? (
        <UnlimitedTrafficToggle
          checked={trafficUnlimited}
          disabled={disabled}
          hintKey={unlimitedHintKey}
          onChange={(next) => {
            onUnlimitedChange(next);
            onChange({ unlimitedTraffic: next });
          }}
        />
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {!trafficUnlimited ? (
        <div className="min-w-0">
          <div className="mb-1.5 flex min-w-0 flex-col gap-0.5">
            <label className={`${labelClass} leading-snug`}>{t("admins.adjustTraffic")}</label>
            <span className="text-xs font-medium text-zinc-500">
              {t("admins.stockAvailable", { value: stockGb })}
            </span>
          </div>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder={t("admins.adjustTrafficPlaceholder")}
            disabled={disabled}
            value={value.gb}
            onChange={(e) => onChange({ gb: e.target.value })}
            className={fieldClass}
          />
        </div>
        ) : null}
        <div className="min-w-0">
          <div className="mb-1.5 flex min-w-0 flex-col gap-0.5">
            <label className={`${labelClass} leading-snug`}>{t("admins.adjustClients")}</label>
            <span className="text-xs font-medium text-zinc-500">
              {t("admins.stockAvailable", { value: stockCount(stock.maxClients) })}
            </span>
          </div>
          <input
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder={t("admins.adjustTrafficPlaceholder")}
            disabled={disabled}
            value={value.maxClients}
            onChange={(e) => onChange({ maxClients: e.target.value })}
            className={fieldClass}
          />
        </div>
        {!trafficUnlimited ? (
        <div className="min-w-0 sm:col-span-2">
          <label className={`${labelClass} mb-1.5`}>{t("admins.trafficAccountingMode")}</label>
          <select
            disabled={disabled}
            value={value.trafficMode || "ALLOCATION"}
            onChange={(e) => onChange({ trafficMode: e.target.value })}
            className={fieldClass}
          >
            <option value="ALLOCATION">{t("admins.allocationMode")}</option>
            <option value="USAGE">{t("admins.usageMode")}</option>
          </select>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">{trafficModeHint || t("admins.panelTrafficModeHint")}</p>
        </div>
        ) : null}
      </div>
      <p className="text-xs leading-relaxed text-zinc-500">{t("admins.adjustDeltaHint")}</p>
      <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white/70 dark:bg-zinc-950/50">
        <button
          type="button"
          onClick={() => setCapsOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-start hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium text-zinc-800 dark:text-zinc-100">
              {t("admins.clientCapsTitle")}
            </span>
            {!capsOpen ? (
              <span className="mt-0.5 block truncate text-xs text-zinc-500">{capsSummary}</span>
            ) : null}
          </span>
          <ChevronDown size={16} className={`shrink-0 text-zinc-500 transition-transform ${capsOpen ? "rotate-180" : ""}`} />
        </button>
        {capsOpen ? (
          <div className="space-y-3 border-t border-zinc-200 px-3 py-3 dark:border-zinc-800">
            <p className="text-xs leading-relaxed text-zinc-500">{t("admins.clientCapsHint")}</p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {!trafficUnlimited ? capField(
                t("admins.adjustClientTraffic"),
                stock.maxClientTrafficGb,
                value.maxClientTrafficGb,
                "maxClientTrafficGb",
              ) : null}
              {capField(
                t("admins.adjustExpireDays"),
                stock.maxExpireDays,
                value.maxExpireDays,
                "maxExpireDays",
              )}
              {capField(
                t(deviceKey || panelDeviceLimitI18nKey(panelType)),
                stock.maxDeviceLimit,
                value.maxDeviceLimit,
                "maxDeviceLimit",
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
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
  const optionClass = (active: boolean) =>
    `rounded-xl border p-3 text-start transition-colors ${
      active
        ? "border-blue-500/40 bg-blue-500/10"
        : "border-zinc-200 bg-white hover:border-zinc-300 dark:border-zinc-800 dark:bg-zinc-950"
    } ${disabled ? "opacity-50 pointer-events-none" : ""}`;
  return (
    <div>
      <div className="mb-2 text-sm font-medium text-zinc-800 dark:text-zinc-100">{t("admins.quotaMode")}</div>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button type="button" disabled={disabled} onClick={() => onChange("PER_PANEL")} className={optionClass(value === "PER_PANEL")}>
          <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{t("admins.quotaModePerPanel")}</div>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">{t("admins.quotaModePerPanelHint")}</p>
        </button>
        <button type="button" disabled={disabled} onClick={() => onChange("GLOBAL")} className={optionClass(value === "GLOBAL")}>
          <div className="text-sm font-semibold text-zinc-800 dark:text-zinc-100">{t("admins.quotaModeGlobal")}</div>
          <p className="mt-1 text-xs leading-relaxed text-zinc-500">{t("admins.quotaModeGlobalHint")}</p>
        </button>
      </div>
    </div>
  );
}

function ResourceAccordion({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: React.ReactNode;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-start hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
      >
        <span className="text-sm font-medium text-zinc-800 dark:text-zinc-100">{title}</span>
        <span className="flex shrink-0 items-center gap-2 text-xs font-medium text-zinc-500">
          {t("admins.resourceItemCount", { count })}
          <ChevronDown size={16} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>
      {open ? <div className="space-y-2 border-t border-zinc-200 px-3 py-3 dark:border-zinc-800">{children}</div> : null}
    </div>
  );
}

/**
 * Multi-panel inbound assignment. A reseller may be granted inbounds on several
 * panels at once; every checked inbound is saved through the flat `inboundIds`
 * list (AdminInbound already bridges admin ↔ inbound across panels). Each enabled
 * panel also carries its own traffic and client caps in the same card.
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
  panelQuotas,
  onQuotaChange,
  showQuotaFields,
  quotaBaselines,
  unlimitedTraffic,
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
  panelQuotas: Record<string, PanelQuotaForm>;
  onQuotaChange: (panelId: string, patch: Partial<PanelQuotaForm>) => void;
  showQuotaFields?: boolean;
  quotaBaselines?: Record<string, QuotaBaseline>;
  unlimitedTraffic?: boolean;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState<string[]>([]);
  const [inboundQueryByPanel, setInboundQueryByPanel] = useState<Record<string, string>>({});
  const hasNativeAccessSlot = usePluginRegistry(
    (state) => (state.slots["admins.panel.access"]?.length ?? 0) > 0,
  );

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
    <div className={`space-y-3 max-h-[28rem] overflow-y-auto overflow-x-hidden pe-1 custom-scrollbar min-w-0 ${disabled ? "opacity-50 pointer-events-none" : ""}`}>
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

        const inboundChecklist = panelInbounds.length === 0 ? null : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 min-w-[10rem]">
                <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 text-zinc-400" size={14} />
                <input
                  type="text"
                  value={inboundQueryByPanel[p.id] || ""}
                  onChange={(e) =>
                    setInboundQueryByPanel((prev) => ({ ...prev, [p.id]: e.target.value }))
                  }
                  placeholder={t("admins.searchInbounds")}
                  className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 ps-8 pe-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500"
                />
              </div>
              <button
                type="button"
                onClick={() => setPanelInbounds(panelInbounds.map((i) => i.id), true)}
                disabled={allSelected}
                className="rounded-lg bg-blue-600 px-3 py-2 text-xs font-semibold text-white hover:bg-blue-500 disabled:opacity-40"
              >
                {t("common.selectAll")}
              </button>
              <button
                type="button"
                onClick={() => setPanelInbounds(panelInbounds.map((i) => i.id), false)}
                disabled={checkedCount === 0}
                className="rounded-lg border border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 disabled:opacity-40 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-200 dark:hover:bg-zinc-800"
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
        );

        return (
          <div
            key={p.id}
            className={`rounded-xl border overflow-hidden transition-colors ${
              isEnabled
                ? "border-blue-500/30 bg-white dark:bg-zinc-900 shadow-sm"
                : "border-zinc-200 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-950/40"
            }`}
          >
            <div className="flex min-w-0 items-center gap-3 p-3">
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
                  <span className="text-sm font-semibold text-zinc-800 dark:text-zinc-100 inline-flex flex-wrap items-center gap-2 min-w-0">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${frozen ? "bg-amber-400" : isEnabled ? "bg-emerald-500" : "bg-zinc-300 dark:bg-zinc-600"}`} />
                    <Server size={14} className="text-blue-400 shrink-0" />
                    <span className="truncate">{p.name}</span>
                    <span className={`shrink-0 rounded-md border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${typeChip}`}>
                      {t(typeKey)}
                    </span>
                    {native ? <PremiumGem size={12} className="text-emerald-500 shrink-0" /> : null}
                    {frozen ? (
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-500">
                        {p.connectionHealth === "DISABLED"
                          ? t("panels.disconnected")
                          : t("panels.premiumUnavailable")}
                      </span>
                    ) : null}
                  </span>
                  <span className="text-xs text-zinc-500 mt-0.5">{t(typeKey)}</span>
                </span>
                <ChevronDown size={16} className={`text-zinc-500 shrink-0 transition-transform ${isExpanded ? "rotate-180" : ""}`} />
              </button>
            </div>

            {isEnabled && isExpanded && (
              <div className="px-3 pb-3 space-y-3 border-t border-zinc-200 dark:border-zinc-800 pt-3">
                {showQuotaFields ? (
                  <PanelLimitFields
                    panelType={p.panelType}
                    value={panelQuotas[p.id] ?? EMPTY_PANEL_QUOTA}
                    current={quotaBaselines?.[p.id]}
                    onChange={(patch) => onQuotaChange(p.id, patch)}
                    unlimited={panelQuotas[p.id]?.unlimitedTraffic === true}
                    unlimitedHintKey="admins.unlimitedTrafficPanelHint"
                    onUnlimitedChange={(next) => onQuotaChange(p.id, { unlimitedTraffic: next })}
                  />
                ) : (
                  <div className="rounded-xl border border-dashed border-emerald-500/30 bg-emerald-500/5 p-3 text-sm leading-relaxed text-emerald-600 dark:text-emerald-400">
                    {t("admins.nativePanelUsesSharedPool")}
                  </div>
                )}
                {native ? (
                  <>
                    <PluginSlot
                      name="admins.panel.access"
                      props={{
                        adminId,
                        collectOnly: collectOnly ?? !adminId,
                        hideSave: true,
                        resourcesOnly: true,
                        panelId: p.id,
                        panelType: p.panelType,
                        panelEnabled: isEnabled,
                        onDraftChange: onProviderDraft,
                      }}
                    />
                    {!hasNativeAccessSlot && panelInbounds.length === 0 ? (
                      <div className="rounded-xl border border-dashed border-zinc-300 dark:border-zinc-700 p-3 text-sm text-zinc-500 space-y-1">
                        <div className="font-medium text-zinc-600 dark:text-zinc-300">
                          {t("admins.nativeResourcePickerMissing")}
                        </div>
                        <p className="leading-relaxed text-xs">
                          {t(showQuotaFields ? "admins.nativePanelLimitsStillApply" : "admins.nativePanelUsesSharedPool")}
                        </p>
                      </div>
                    ) : null}
                    {panelInbounds.length > 0 ? (
                      <ResourceAccordion title={t("admins.nativeSyncedInbounds")} count={checkedCount}>
                        {inboundChecklist}
                      </ResourceAccordion>
                    ) : null}
                  </>
                ) : (
                  <ResourceAccordion title={t("admins.allowedInbounds")} count={checkedCount}>
                    {panelInbounds.length === 0 ? (
                      <div className="text-sm text-zinc-500 p-2 text-center">
                        {t("common.noInboundsOnPanel")}
                      </div>
                    ) : (
                      inboundChecklist
                    )}
                  </ResourceAccordion>
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

function nativeProviderKey(panelType?: string | null): "eylan" | "pasarguard" | null {
  if (panelType === "eylan") return "eylan";
  if (panelType === "pasarguard") return "pasarguard";
  return null;
}

function overlayQuotaOnProviderDraft(
  draft: Record<string, unknown>,
  resolved: { balanceBytes: number; maxClients: number; unlimitedTraffic?: boolean } | undefined,
  panel: PanelRow,
  quotaMode: QuotaMode,
  unlimitedTraffic = false,
) {
  const provider = nativeProviderKey(panel.panelType);
  const bytes = Math.max(0, Number(resolved?.balanceBytes) || 0);
  const maxClients = Math.max(0, Number(resolved?.maxClients) || 0);
  return {
    ...draft,
    provider,
    enabled: true,
    panelId: panel.id,
    trafficBytes: (resolved?.unlimitedTraffic ?? unlimitedTraffic) ? "0" : String(bytes),
    unlimitedTraffic: resolved?.unlimitedTraffic ?? unlimitedTraffic,
    maxClients,
    unlimitedClients: maxClients <= 0,
    quotaMode,
    expiryDays: Number(draft.expiryDays || 0),
    resources: Array.isArray(draft.resources) ? draft.resources : undefined,
  };
}

/** Native drafts hide traffic fields, so copy the Community panel-card caps before save. */
function collectProviderAccessDrafts(
  drafts: Record<string, unknown>,
  panels: PanelRow[] | undefined,
  enabledPanels: string[],
  resolvedQuotas: Array<{ panelId: string; balanceBytes: number; maxClients: number; unlimitedTraffic?: boolean }>,
  quotaMode: QuotaMode = "PER_PANEL",
  unlimitedTraffic = false,
) {
  const resolvedByPanel = Object.fromEntries(resolvedQuotas.map((q) => [q.panelId, q]));
  const shared =
    quotaMode === "GLOBAL"
      ? resolvedQuotas[0] || { panelId: "", balanceBytes: 0, maxClients: 0 }
      : null;
  const out: Record<string, unknown> = { ...drafts };
  for (const panel of panels ?? []) {
    const key = nativeProviderKey(panel.panelType);
    if (!key) continue;
    if (!enabledPanels.includes(panel.id)) {
      out[key] = {
        provider: key,
        enabled: false,
        trafficBytes: "0",
        maxClients: 0,
        unlimitedClients: true,
        unlimitedTraffic: false,
        expiryDays: 0,
        resources: [],
      };
      continue;
    }
    const base =
      out[key] && typeof out[key] === "object"
        ? (out[key] as Record<string, unknown>)
        : { provider: key };
    out[key] = overlayQuotaOnProviderDraft(
      base,
      shared || resolvedByPanel[panel.id],
      panel,
      quotaMode,
      unlimitedTraffic,
    );
  }
  return out;
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
  panelQuotas: Record<string, PanelQuotaForm>,
  baselines: Record<string, QuotaBaseline> = {},
) {
  return enabledPanels.map((panelId) => {
    const quota = panelQuotas[panelId] ?? EMPTY_PANEL_QUOTA;
    const base = baselines[panelId] ?? EMPTY_QUOTA_BASELINE;
    const unlimitedTraffic = quota.unlimitedTraffic === true;
    return {
      panelId,
      balanceBytes: unlimitedTraffic ? 0 : applyTrafficDeltaBytes(base.balance, quota.gb),
      maxClients: applyCountDelta(base.maxClients, quota.maxClients),
      maxDeviceLimit: applyCountDelta(base.maxDeviceLimit, quota.maxDeviceLimit),
      maxExpireDays: applyCountDelta(base.maxExpireDays, quota.maxExpireDays),
      maxClientTrafficGb: unlimitedTraffic ? 0 : applyCountDelta(base.maxClientTrafficGb, quota.maxClientTrafficGb),
      trafficMode: quota.trafficMode === "USAGE" ? "USAGE" : "ALLOCATION",
      unlimitedTraffic,
    };
  });
}

type PanelQuotaFormState = {
  superAdmin: boolean;
  unlimitedTraffic: boolean;
  enabledPanels: string[];
  panelQuotas: Record<string, PanelQuotaForm>;
  quotaMode?: QuotaMode;
};

function resolveQuotaMode(
  form: Pick<PanelQuotaFormState, "superAdmin" | "unlimitedTraffic" | "quotaMode">,
): QuotaMode {
  if (form.superAdmin) return "GLOBAL";
  return form.quotaMode === "GLOBAL" ? "GLOBAL" : "PER_PANEL";
}

function allPanelsUnlimited(
  form: Pick<PanelQuotaFormState, "enabledPanels" | "panelQuotas">,
) {
  return (
    form.enabledPanels.length > 0 &&
    form.enabledPanels.every((id) => form.panelQuotas[id]?.unlimitedTraffic === true)
  );
}

function accountUnlimitedTraffic(
  form: Pick<PanelQuotaFormState, "superAdmin" | "unlimitedTraffic" | "enabledPanels" | "panelQuotas" | "quotaMode">,
) {
  if (form.superAdmin) return true;
  if (resolveQuotaMode(form) === "PER_PANEL") return allPanelsUnlimited(form);
  return form.unlimitedTraffic === true;
}

function mergeQuotaBaselines(
  panelIds: string[],
  baselines: Record<string, QuotaBaseline> = {},
): QuotaBaseline {
  const rows = panelIds.map((id) => baselines[id] ?? EMPTY_QUOTA_BASELINE);
  if (!rows.length) return { ...EMPTY_QUOTA_BASELINE };
  const unlimited = (key: keyof Omit<QuotaBaseline, "balance">) => rows.some((r) => r[key] === 0);
  return {
    balance: rows.reduce((sum, r) => sum + r.balance, 0),
    maxClients: unlimited("maxClients") ? 0 : rows.reduce((sum, r) => sum + r.maxClients, 0),
    maxDeviceLimit: unlimited("maxDeviceLimit") ? 0 : Math.max(0, ...rows.map((r) => r.maxDeviceLimit)),
    maxExpireDays: unlimited("maxExpireDays") ? 0 : Math.max(0, ...rows.map((r) => r.maxExpireDays)),
    maxClientTrafficGb: unlimited("maxClientTrafficGb") ? 0 : Math.max(0, ...rows.map((r) => r.maxClientTrafficGb)),
  };
}

function applyQuotaModeChange<
  T extends PanelQuotaFormState & {
    globalBaseline?: QuotaBaseline;
    gb?: string;
    maxClients?: string;
    maxDeviceLimit?: string;
    maxExpireDays?: string;
    maxClientTrafficGb?: string;
    quotaBaselines?: Record<string, QuotaBaseline>;
  },
>(form: T, mode: QuotaMode): T {
  if (form.quotaMode === mode) return form;
  if (mode === "GLOBAL") {
    return {
      ...form,
      quotaMode: mode,
      unlimitedTraffic: allPanelsUnlimited(form) || (form.enabledPanels.length === 0 && form.unlimitedTraffic),
      globalBaseline: mergeQuotaBaselines(form.enabledPanels, form.quotaBaselines),
      gb: "",
      maxClients: "",
      maxDeviceLimit: "",
      maxExpireDays: "",
      maxClientTrafficGb: "",
    };
  }
  const quotaBaselines = { ...(form.quotaBaselines ?? {}) };
  const first = form.enabledPanels[0];
  const shared = form.globalBaseline ?? EMPTY_QUOTA_BASELINE;
  if (first && (quotaBaselines[first]?.balance ?? 0) === 0 && shared.balance > 0) {
    quotaBaselines[first] = { ...shared };
  }
  const panelQuotas = { ...form.panelQuotas };
  if (form.unlimitedTraffic) {
    for (const panelId of form.enabledPanels) {
      panelQuotas[panelId] = {
        ...(panelQuotas[panelId] ?? EMPTY_PANEL_QUOTA),
        unlimitedTraffic: true,
      };
    }
  }
  return { ...form, quotaMode: mode, quotaBaselines, panelQuotas };
}

/** Enabling a panel must give its caps card a row to bind to. */
function applyPanelSelection<T extends PanelQuotaFormState>(
  form: T,
  next: { enabledPanels: string[]; selectedInbounds: string[] },
): T {
  const panelQuotas = { ...form.panelQuotas };
  for (const panelId of next.enabledPanels) {
    if (!panelQuotas[panelId]) panelQuotas[panelId] = { ...EMPTY_PANEL_QUOTA };
  }
  return { ...form, ...next, panelQuotas };
}

function patchPanelQuota<T extends PanelQuotaFormState>(
  form: T,
  panelId: string,
  patch: Partial<PanelQuotaForm>,
): T {
  return {
    ...form,
    panelQuotas: {
      ...form.panelQuotas,
      [panelId]: { ...(form.panelQuotas[panelId] ?? EMPTY_PANEL_QUOTA), ...patch },
    },
  };
}

type ProviderAccessRow = { provider: string; enabled: boolean };

/** Stable fallback so a disabled premium query does not rehydrate the edit form every render. */
const EMPTY_PROVIDER_ACCESS: ProviderAccessRow[] = [];

function adminQuotaStamp(admin: Admin) {
  const quotas = admin.panelQuotas ?? [];
  return [
    admin.id,
    admin.balance,
    admin.expiryTime,
    admin.maxClients,
    admin.maxDeviceLimit ?? 0,
    admin.maxExpireDays ?? 0,
    admin.maxClientTrafficGb ?? 0,
    admin.status,
    admin.username,
    admin.role,
    admin.quotaMode ?? "",
    admin.unlimitedTraffic === true ? "1" : "0",
    ...quotas.map(
      (q) =>
        `${q.panelId}:${q.balance}:${q.maxClients ?? 0}:${q.maxDeviceLimit ?? 0}:${q.maxExpireDays ?? 0}:${q.maxClientTrafficGb ?? 0}:${q.trafficMode ?? ""}:${q.unlimitedTraffic ? "1" : "0"}`,
    ),
  ].join("|");
}

function keepQuotaDrafts(
  next: Record<string, PanelQuotaForm>,
  prev: Record<string, PanelQuotaForm>,
): Record<string, PanelQuotaForm> {
  const out: Record<string, PanelQuotaForm> = { ...next };
  for (const [panelId, draft] of Object.entries(prev)) {
    out[panelId] = {
      ...(out[panelId] ?? EMPTY_PANEL_QUOTA),
      gb: draft.gb,
      maxClients: draft.maxClients,
      maxDeviceLimit: draft.maxDeviceLimit,
      maxExpireDays: draft.maxExpireDays,
      maxClientTrafficGb: draft.maxClientTrafficGb,
      unlimitedTraffic: draft.unlimitedTraffic === true,
    };
  }
  return out;
}

function buildEditAdminForm(
  admin: Admin,
  panels: PanelRow[] | undefined,
  providerAccess: ProviderAccessRow[],
) {
  const assigned = admin.adminInbounds ?? [];
  const fromInbounds = assigned
    .map((ai: { inbound?: { panel?: { id?: string } } }) => ai.inbound?.panel?.id)
    .filter((id: string | undefined): id is string => !!id);
  const fromQuota = (admin.panelQuotas || []).map((q) => q.panelId);
  const fromNative = (panels ?? [])
    .filter((p) => isNativePremiumPanel(p) && providerAccess.some((r) => r.enabled && r.provider === p.panelType))
    .map((p) => p.id);
  const enabledPanels = Array.from(new Set([...fromInbounds, ...fromQuota, ...fromNative]));
  const quotaBaselines: Record<string, QuotaBaseline> = {};
  const panelQuotas: Record<string, PanelQuotaForm> = Object.fromEntries(
    (admin.panelQuotas || []).map((q) => {
      quotaBaselines[q.panelId] = {
        balance: q.balance || 0,
        maxClients: q.maxClients || 0,
        maxDeviceLimit: q.maxDeviceLimit || 0,
        maxExpireDays: q.maxExpireDays || 0,
        maxClientTrafficGb: q.maxClientTrafficGb || 0,
        unlimitedTraffic: q.unlimitedTraffic === true,
      };
      return [
        q.panelId,
        {
          gb: "",
          maxClients: "",
          maxDeviceLimit: "",
          maxExpireDays: "",
          maxClientTrafficGb: "",
          trafficMode: q.trafficMode === "USAGE" ? "USAGE" : "ALLOCATION",
          unlimitedTraffic: q.unlimitedTraffic === true,
        },
      ];
    }),
  );
  const migratingFromGlobalPool =
    admin.role !== "SUPER_ADMIN" && admin.quotaMode !== "PER_PANEL" && !admin.unlimitedTraffic;
  enabledPanels.forEach((panelId, index) => {
    if (panelQuotas[panelId]) return;
    panelQuotas[panelId] = {
      ...EMPTY_PANEL_QUOTA,
      trafficMode: admin.trafficMode === "USAGE" ? "USAGE" : "ALLOCATION",
    };
    quotaBaselines[panelId] =
      migratingFromGlobalPool && index === 0
        ? {
            balance: admin.balance || 0,
            maxClients: admin.maxClients || 0,
            maxDeviceLimit: admin.maxDeviceLimit || 0,
            maxExpireDays: admin.maxExpireDays || 0,
            maxClientTrafficGb: admin.maxClientTrafficGb || 0,
          }
        : { ...EMPTY_QUOTA_BASELINE };
  });
  const quotaMode: QuotaMode = admin.quotaMode === "PER_PANEL" ? "PER_PANEL" : "GLOBAL";
  const globalBaseline: QuotaBaseline =
    quotaMode === "PER_PANEL"
      ? mergeQuotaBaselines(enabledPanels, quotaBaselines)
      : {
          balance: admin.balance || 0,
          maxClients: admin.maxClients || 0,
          maxDeviceLimit: admin.maxDeviceLimit || 0,
          maxExpireDays: admin.maxExpireDays || 0,
          maxClientTrafficGb: admin.maxClientTrafficGb || 0,
        };
  return {
    username: admin.username || "",
    status: admin.status || "active",
    trafficMode: admin.trafficMode || "ALLOCATION",
    gb: "",
    maxClients: "",
    maxDeviceLimit: "",
    maxExpireDays: "",
    maxClientTrafficGb: "",
    expiryDays: "",
    selectedInbounds: assigned.map((ai: { inbound: { id: string } }) => ai.inbound.id),
    enabledPanels,
    canCustomizeBranding: admin.permissions ? admin.permissions.includes("canCustomizeBranding") : true,
    storeEnabled: admin.storeEnabled || false,
    refundOnDelete: admin.refundOnDelete ?? true,
    refundOnEdit: admin.refundOnEdit ?? true,
    unlimitedTraffic: admin.unlimitedTraffic === true,
    superAdmin: admin.role === "SUPER_ADMIN",
    quotaMode,
    panelQuotas,
    quotaBaselines,
    globalBaseline,
  };
}

/** 3x-ui caps concurrent IPs, pasarguard caps registered HWIDs. */
function panelDeviceLimitI18nKey(type?: string | null) {
  if (type === "pasarguard") return "admins.panelMaxDeviceLimitHwid";
  if (type === "eylan") return "admins.panelMaxDeviceLimit";
  return "admins.panelMaxDeviceLimitIp";
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
  const [stepIndex, setStepIndex] = useState(0);
  const [premiumModules, setPremiumModules] = useState<string[]>([]);
  const { data: assignableModules = [] } = useAssignableModules(isPremium);
  const [showPassword, setShowPassword] = useState(false);
  const [form, setForm] = useState({
    username: "",
    password: "",
    status: "active",
    trafficMode: "ALLOCATION",
    expiryDays: "",
    maxClients: "",
    maxDeviceLimit: "",
    maxExpireDays: "",
    maxClientTrafficGb: "",
    gb: "",
    enabledPanels: [] as string[],
    selectedInbounds: [] as string[],
    canCustomizeBranding: true,
    storeEnabled: false,
    storePanelId: "",
    refundOnDelete: true,
    refundOnEdit: true,
    unlimitedTraffic: false,
    superAdmin: false,
    quotaMode: "PER_PANEL" as QuotaMode,
    panelQuotas: {} as Record<string, PanelQuotaForm>,
    quotaBaselines: {} as Record<string, QuotaBaseline>,
    globalBaseline: { ...EMPTY_QUOTA_BASELINE },
  });
  const limitsLocked = form.superAdmin;
  const quotaMode = resolveQuotaMode(form);
  const perPanelQuotas = quotaMode === "PER_PANEL";

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
        trafficMode: form.superAdmin
          ? "ALLOCATION"
          : perPanelQuotas
            ? form.enabledPanels.some((id) => form.panelQuotas[id]?.trafficMode === "USAGE")
              ? "USAGE"
              : "ALLOCATION"
            : form.trafficMode,
        quotaMode,
        balance: form.superAdmin || accountUnlimitedTraffic(form) || perPanelQuotas ? 0 : applyTrafficDeltaBytes(0, form.gb),
        panelQuotas: perPanelQuotas
          ? buildPanelQuotasPayload(form.enabledPanels, form.panelQuotas)
          : undefined,
        expiryTime: form.superAdmin ? 0 : applyExpiryDeltaMs(0, form.expiryDays),
        maxClients: form.superAdmin || perPanelQuotas ? 0 : applyCountDelta(0, form.maxClients),
        maxDeviceLimit: form.superAdmin || perPanelQuotas ? 0 : applyCountDelta(0, form.maxDeviceLimit),
        maxExpireDays: form.superAdmin || perPanelQuotas ? 0 : applyCountDelta(0, form.maxExpireDays),
        maxClientTrafficGb: form.superAdmin || accountUnlimitedTraffic(form) || perPanelQuotas ? 0 : applyCountDelta(0, form.maxClientTrafficGb),
        inboundIds: form.superAdmin ? [] : form.selectedInbounds,
        permissions: [],
        storeEnabled: form.superAdmin ? false : form.storeEnabled || premiumModules.includes("store"),
        storePanelId: form.storePanelId,
        refundOnDelete: form.superAdmin || accountUnlimitedTraffic(form) ? false : form.refundOnDelete,
        refundOnEdit: form.superAdmin || accountUnlimitedTraffic(form) ? false : form.refundOnEdit,
        unlimitedTraffic: accountUnlimitedTraffic(form),
      };
      const created = (await api.post("/admins", payload)).data;
      if (!form.superAdmin && created?.id) {
        await persistProviderAccess(
          created.id,
          collectProviderAccessDrafts(
            providerDrafts.current,
            panels,
            form.enabledPanels,
            perPanelQuotas
              ? payload.panelQuotas || []
              : form.enabledPanels.map((panelId) => ({
                  panelId,
                  balanceBytes: payload.balance || 0,
                  maxClients: payload.maxClients || 0,
                  unlimitedTraffic: accountUnlimitedTraffic(form),
                })),
            quotaMode,
            accountUnlimitedTraffic(form),
          ),
        );
        // Store access follows storeEnabled above; the rest are plain module assignments.
        for (const moduleId of premiumModules) {
          if (moduleId === "store") continue;
          try {
            await postPremiumAssignment({ adminId: created.id, moduleId, enabled: true, settings: {} });
          } catch {
            /* account exists; access can be granted later from the edit screen */
          }
        }
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

  type WizardStep = "account" | "traffic" | "panels" | "premium" | "review";
  const steps: WizardStep[] = form.superAdmin
    ? ["account", "review"]
    : ["account", "traffic", "panels", ...(isPremium ? (["premium"] as WizardStep[]) : []), "review"];
  const stepNo = Math.min(stepIndex, steps.length - 1);
  const step = steps[stepNo];
  const stepLabel: Record<WizardStep, string> = {
    account: t("adminWizard.stepAccount"),
    traffic: t("adminWizard.stepTraffic"),
    panels: t("adminWizard.stepPanels"),
    premium: t("adminWizard.stepPremium"),
    review: t("adminWizard.stepReview"),
  };

  const stepError = (s: WizardStep): string | null => {
    if (s === "account") {
      if (!form.username || !form.password) return t("admins.usernamePasswordRequired");
      if (form.password.length < 8) return t("admins.passwordMinLength");
    }
    if (s === "panels" && !hasResellerPanelAccess(form, panels)) return t("admins.inboundRequired");
    return null;
  };

  const goNext = () => {
    const err = stepError(step);
    if (err) return toast(err, "error");
    setStepIndex(Math.min(stepNo + 1, steps.length - 1));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step !== "review") return goNext();
    for (const s of steps) {
      const err = stepError(s);
      if (err) return toast(err, "error");
    }
    create.mutate();
  };

  const panelName = (id: string) => panels?.find((p) => p.id === id)?.name || id;
  const fieldClass =
    "w-full rounded-xl border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/50 px-3 py-2.5 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors";
  const reviewRow = (label: string, value: React.ReactNode) => (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <span className="text-zinc-500">{label}</span>
      <span className="text-end font-medium text-zinc-900 dark:text-zinc-50">{value}</span>
    </div>
  );

  return (
    <motion.div {...MOTION_CONFIG.modalOverlay} className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-black/60 pt-[6dvh] px-4 sm:pt-0 sm:p-4 backdrop-blur-sm">
      <motion.div {...MOTION_CONFIG.modalContent} className="w-full max-w-3xl max-h-[92vh] min-w-0 flex flex-col rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden">
        <div className="border-b border-zinc-200 px-6 pb-4 pt-5 dark:border-zinc-800">
          <div className="flex items-center justify-between gap-3">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
              <Shield size={19} className="text-blue-500" /> {t("admins.addAdminTitle")}
            </h2>
            <button type="button" onClick={onClose} aria-label={t("common.cancel")} className="flex h-9 w-9 items-center justify-center rounded-full text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-700 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"><X size={18} /></button>
          </div>
          <ol className="mt-4 flex items-center gap-1.5 overflow-x-auto hide-scrollbar" aria-label={t("adminWizard.progress")}>
            {steps.map((s, i) => {
              const done = i < stepNo;
              const active = i === stepNo;
              return (
                <li key={s} className="flex min-w-0 items-center gap-1.5">
                  <button
                    type="button"
                    disabled={i > stepNo}
                    onClick={() => setStepIndex(i)}
                    aria-current={active ? "step" : undefined}
                    className={`flex h-8 shrink-0 items-center gap-2 rounded-full ps-1 pe-3 text-xs font-semibold transition-colors ${
                      active
                        ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                        : done
                          ? "cursor-pointer bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/15 dark:text-emerald-300"
                          : "bg-zinc-100 text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
                    }`}
                  >
                    <span className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] ${active ? "bg-white/20" : done ? "bg-emerald-500 text-white" : "bg-white dark:bg-zinc-900"}`}>
                      {done ? <Check size={12} /> : i + 1}
                    </span>
                    <span className="whitespace-nowrap">{stepLabel[s]}</span>
                  </button>
                  {i < steps.length - 1 ? <span className="h-px w-4 shrink-0 bg-zinc-200 dark:bg-zinc-700" aria-hidden /> : null}
                </li>
              );
            })}
          </ol>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto p-6">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: "easeOut" }}
                className="space-y-5"
              >
                {step === "account" ? (
                  <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-zinc-600 dark:text-zinc-300">{t("admins.username")}</label>
                        <input type="text" autoFocus value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} className={fieldClass} dir="ltr" autoComplete="off" />
                      </div>
                      <div className="relative">
                        <label className="mb-1.5 block text-sm font-medium text-zinc-600 dark:text-zinc-300">{t("admins.password")}</label>
                        <input type={showPassword ? "text" : "password"} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className={`${fieldClass} pe-10`} dir="ltr" autoComplete="new-password" />
                        <button type="button" onClick={() => setShowPassword(!showPassword)} aria-label={t("adminWizard.togglePassword")} className="absolute end-3 top-[34px] text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                        <p className="mt-1.5 text-xs text-zinc-500">{t("adminWizard.passwordHint")}</p>
                      </div>
                    </div>
                    {callerIsOwner && (
                      <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-blue-500/30 bg-blue-500/5 p-3.5">
                        <input
                          type="checkbox"
                          checked={form.superAdmin}
                          onChange={(e) => {
                            setStepIndex(0);
                            setForm({ ...form, superAdmin: e.target.checked, unlimitedTraffic: e.target.checked ? true : form.unlimitedTraffic });
                          }}
                          className="mt-0.5 h-4 w-4 rounded text-blue-600"
                        />
                        <div className="flex flex-col">
                          <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{t("admins.makeSuperAdmin")}</span>
                          <span className="text-xs text-zinc-500">{t("admins.makeSuperAdminHint")}</span>
                        </div>
                      </label>
                    )}
                  </>
                ) : null}

                {step === "traffic" ? (
                  <>
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{t("adminWizard.trafficTitle")}</h3>
                      <p className="mt-1 text-xs leading-relaxed text-zinc-500">{t("adminWizard.trafficHint")}</p>
                    </div>
                    <QuotaModeToggle
                      value={quotaMode === "GLOBAL" ? "GLOBAL" : "PER_PANEL"}
                      onChange={(mode) => setForm((f) => applyQuotaModeChange(f, mode))}
                    />
                    {perPanelQuotas ? (
                      <div className="flex items-start gap-2 rounded-xl border border-violet-500/25 bg-violet-500/5 p-3 text-sm text-violet-700 dark:text-violet-300">
                        <Layers size={16} className="mt-0.5 shrink-0" />
                        <span className="leading-relaxed">{t("adminWizard.perPanelNext")}</span>
                      </div>
                    ) : (
                      <PanelLimitFields
                        title={t("admins.globalLimitsTitle")}
                        deviceKey="admins.maxDeviceLimit"
                        trafficModeHint={t("admins.globalTrafficModeHint")}
                        unlimited={form.unlimitedTraffic}
                        onUnlimitedChange={(next) => setForm((f) => ({ ...f, unlimitedTraffic: next }))}
                        value={{
                          gb: form.gb,
                          maxClients: form.maxClients,
                          maxDeviceLimit: form.maxDeviceLimit,
                          maxExpireDays: form.maxExpireDays,
                          maxClientTrafficGb: form.maxClientTrafficGb,
                          trafficMode: form.trafficMode,
                          unlimitedTraffic: form.unlimitedTraffic,
                        }}
                        current={form.globalBaseline}
                        onChange={(patch) =>
                          setForm((f) => ({
                            ...f,
                            gb: patch.gb ?? f.gb,
                            maxClients: patch.maxClients ?? f.maxClients,
                            maxDeviceLimit: patch.maxDeviceLimit ?? f.maxDeviceLimit,
                            maxExpireDays: patch.maxExpireDays ?? f.maxExpireDays,
                            maxClientTrafficGb: patch.maxClientTrafficGb ?? f.maxClientTrafficGb,
                            trafficMode: patch.trafficMode ?? f.trafficMode,
                            unlimitedTraffic: patch.unlimitedTraffic ?? f.unlimitedTraffic,
                          }))
                        }
                      />
                    )}
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-zinc-600 dark:text-zinc-300">{t("admins.addExpiryDays")}</label>
                      <input
                        type="text"
                        inputMode="decimal"
                        autoComplete="off"
                        placeholder={t("adminWizard.expiryPlaceholder")}
                        value={form.expiryDays}
                        onChange={(e) => setForm({ ...form, expiryDays: e.target.value })}
                        className={fieldClass}
                      />
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {[30, 60, 90, 180, 365].map((d) => (
                          <button
                            key={d}
                            type="button"
                            onClick={() => setForm((f) => ({ ...f, expiryDays: String(d) }))}
                            className={`h-7 rounded-full border px-2.5 text-[11px] font-semibold transition-colors ${form.expiryDays === String(d) ? "border-blue-500 bg-blue-500/10 text-blue-700 dark:text-blue-300" : "border-zinc-200 text-zinc-600 hover:border-blue-400 dark:border-zinc-700 dark:text-zinc-300"}`}
                          >
                            {t("common.days", { count: d })}
                          </button>
                        ))}
                      </div>
                      <p className="mt-1.5 text-xs leading-relaxed text-zinc-500">{t("adminWizard.expiryHint")}</p>
                    </div>
                  </>
                ) : null}

                {step === "panels" ? (
                  <>
                    <div>
                      <h3 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{t("admins.allowedPanelsInbounds")}</h3>
                      <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                        {t(perPanelQuotas ? "admins.allowedPanelsAndLimitsHint" : "admins.allowedPanelsSharedPoolHint")}
                      </p>
                    </div>
                    <PanelInboundPicker
                      panels={panels ?? []}
                      inbounds={inbounds ?? []}
                      isLoading={inboundsLoading}
                      enabledPanels={form.enabledPanels}
                      selectedInbounds={form.selectedInbounds}
                      onChange={(next) => setForm((f) => applyPanelSelection(f, next))}
                      disabled={false}
                      allowPremiumPanels={isPremium}
                      collectOnly
                      onProviderDraft={(items) => mergeProviderDraft(providerDrafts, items)}
                      panelQuotas={form.panelQuotas}
                      onQuotaChange={(panelId, patch) => setForm((f) => patchPanelQuota(f, panelId, patch))}
                      showQuotaFields={perPanelQuotas}
                      unlimitedTraffic={form.unlimitedTraffic}
                    />
                    {!hasResellerPanelAccess(form, panels) && (
                      <div className="flex items-start gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-700 dark:text-amber-400">
                        <AlertCircle size={18} className="mt-0.5 shrink-0" />
                        <div>
                          <strong>{t("admins.noPanelSelected")}</strong>
                          <p className="mt-1 text-xs opacity-80">{t("admins.noPanelSelectedHint")}</p>
                        </div>
                      </div>
                    )}
                  </>
                ) : null}

                {step === "premium" ? (
                  <AdminPremiumAccess mode="controlled" value={premiumModules} onChange={setPremiumModules} />
                ) : null}

                {step === "review" ? (
                  <>
                    <div className="divide-y divide-zinc-100 rounded-2xl border border-zinc-200 px-4 dark:divide-zinc-800 dark:border-zinc-800">
                      {reviewRow(t("admins.username"), <span dir="ltr">{form.username || "—"}</span>)}
                      {reviewRow(t("adminWizard.reviewRole"), form.superAdmin ? t("nav.superAdmin") : t("nav.reseller"))}
                      {!form.superAdmin ? (
                        <>
                          {reviewRow(
                            t("adminWizard.stepTraffic"),
                            perPanelQuotas ? t("admins.quotaModePerPanel") : form.unlimitedTraffic ? t("admins.unlimitedTrafficLabel") : form.gb ? `${form.gb} GB` : "—",
                          )}
                          {perPanelQuotas && form.enabledPanels.length
                            ? reviewRow(
                                t("adminWizard.reviewPanelTraffic"),
                                <span className="flex flex-col items-end gap-0.5">
                                  {form.enabledPanels.map((id) => {
                                    const q = form.panelQuotas[id];
                                    return (
                                      <span key={id} className="text-xs">
                                        <span className="text-zinc-500">{panelName(id)}:</span>{" "}
                                        {q?.unlimitedTraffic ? t("admins.stockUnlimited") : q?.gb ? `${q.gb} GB` : "—"}
                                      </span>
                                    );
                                  })}
                                </span>,
                              )
                            : null}
                          {reviewRow(t("adminWizard.reviewExpiry"), form.expiryDays ? t("common.days", { count: Number(form.expiryDays) || 0 }) : t("common.never"))}
                          {reviewRow(t("adminWizard.reviewAccess"), t("adminWizard.reviewAccessValue", { panels: form.enabledPanels.length, inbounds: form.selectedInbounds.length }))}
                          {isPremium
                            ? reviewRow(
                                t("adminWizard.stepPremium"),
                                premiumModules.length
                                  ? assignableModules.filter((m) => premiumModules.includes(m.id)).map((m) => m.name).join("، ")
                                  : "—",
                              )
                            : null}
                        </>
                      ) : null}
                    </div>

                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-sm font-medium text-zinc-600 dark:text-zinc-300">{t("admins.accountStatus")}</label>
                        <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={fieldClass}>
                          <option value="active">{t("admins.statusActive")}</option>
                          <option value="disabled">{t("admins.statusDisabled")}</option>
                        </select>
                      </div>
                    </div>
                    {!form.superAdmin ? (
                      <div className="space-y-2">
                        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-200 p-3 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50">
                          <input type="checkbox" checked={form.refundOnDelete} onChange={(e) => setForm({ ...form, refundOnDelete: e.target.checked })} className="h-4 w-4 rounded text-blue-600" />
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{t("admins.refundOnDelete")}</span>
                            <span className="text-xs text-zinc-500">{t("admins.refundOnDeleteHint")}</span>
                          </div>
                        </label>
                        <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-zinc-200 p-3 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-800/50">
                          <input type="checkbox" checked={form.refundOnEdit} onChange={(e) => setForm({ ...form, refundOnEdit: e.target.checked })} className="h-4 w-4 rounded text-blue-600" />
                          <div className="flex flex-col">
                            <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{t("admins.refundOnEdit")}</span>
                            <span className="text-xs text-zinc-500">{t("admins.refundOnEditHint")}</span>
                          </div>
                        </label>
                      </div>
                    ) : null}
                  </>
                ) : null}
              </motion.div>
            </AnimatePresence>
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-zinc-200 px-6 py-4 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => (stepNo === 0 ? onClose() : setStepIndex(stepNo - 1))}
              className="rounded-xl px-4 py-2 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
            >
              {stepNo === 0 ? t("common.cancel") : t("adminWizard.back")}
            </button>
            <div className="flex items-center gap-3">
              <span className="hidden text-xs text-zinc-500 sm:inline">{t("adminWizard.stepOf", { n: stepNo + 1, total: steps.length })}</span>
              {step === "review" ? (
                <button type="submit" disabled={create.isPending} className="rounded-xl bg-blue-600 px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-blue-900/20 transition-colors hover:bg-blue-500 disabled:opacity-50">
                  {create.isPending ? t("common.creating") : t("admins.createAdmin")}
                </button>
              ) : (
                <button type="submit" className="inline-flex items-center gap-1.5 rounded-xl bg-zinc-900 px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-zinc-800 dark:bg-white dark:text-zinc-900 dark:hover:bg-zinc-200">
                  {t("adminWizard.next")} <ArrowRight size={15} className="rtl:-scale-x-100" />
                </button>
              )}
            </div>
          </div>
        </form>
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
    maxClients: "",
    maxDeviceLimit: "",
    maxExpireDays: "",
    maxClientTrafficGb: "",
    gb: "",
    password: "",
    expiryDays: "",
    enabledPanels: [] as string[],
    selectedInbounds: [] as string[],
    canCustomizeBranding: true,
    storeEnabled: false,
    refundOnDelete: true,
    refundOnEdit: true,
    unlimitedTraffic: false,
    superAdmin: false,
    quotaMode: "PER_PANEL" as QuotaMode,
    panelQuotas: {} as Record<string, PanelQuotaForm>,
    quotaBaselines: {} as Record<string, QuotaBaseline>,
    globalBaseline: { ...EMPTY_QUOTA_BASELINE },
  });
  const quotaMode = resolveQuotaMode(form);
  const perPanelQuotas = quotaMode === "PER_PANEL";

  const { data: panels } = useQuery<PanelRow[]>({
    queryKey: ["panels"],
    queryFn: async () => (await api.get<PanelRow[]>("/panels")).data,
  });

  const { data: inbounds, isLoading: inboundsLoading } = useQuery<InboundRow[]>({
    queryKey: ["inbounds-all"],
    queryFn: async () => (await api.get<InboundRow[]>("/inbounds")).data,
  });

  const { data: providerAccessData } = useQuery<ProviderAccessRow[]>({
    queryKey: ["admin-provider-access", adminId],
    enabled: isPremium && !!adminId,
    queryFn: async () =>
      (await api.get(`/premium-modules/admin-recharge/provider-access/${adminId}`)).data,
    retry: false,
  });
  const providerAccess = providerAccessData ?? EMPTY_PROVIDER_ACCESS;
  const quotaStamp = admin ? adminQuotaStamp(admin) : "";
  const lastQuotaStamp = React.useRef("");

  useEffect(() => {
    if (!admin) return;
    const next = buildEditAdminForm(admin, panels, providerAccess);
    if (lastQuotaStamp.current === quotaStamp) {
      setForm((prev) => {
        const extra = next.enabledPanels.filter((id) => !prev.enabledPanels.includes(id));
        if (!extra.length) return prev;
        const merged = applyPanelSelection(prev, {
          enabledPanels: [...prev.enabledPanels, ...extra],
          selectedInbounds: prev.selectedInbounds,
        });
        return {
          ...merged,
          quotaBaselines: {
            ...next.quotaBaselines,
            ...prev.quotaBaselines,
          },
          panelQuotas: keepQuotaDrafts(next.panelQuotas, merged.panelQuotas),
        };
      });
      return;
    }
    lastQuotaStamp.current = quotaStamp;
    setForm((prev) => ({ ...prev, ...next }));
  }, [admin, panels, providerAccess, quotaStamp]);

  const directEdit = useMutation({
    mutationFn: async () => {
      if (!admin) throw new Error('Admin not loaded');
      const payload: any = {
        status: form.status,
        trafficMode: form.superAdmin
          ? "ALLOCATION"
          : perPanelQuotas
            ? form.enabledPanels.some((id) => form.panelQuotas[id]?.trafficMode === "USAGE")
              ? "USAGE"
              : "ALLOCATION"
            : form.trafficMode,
        inboundIds: form.superAdmin ? undefined : form.selectedInbounds,
        permissions: [],
        refundOnDelete: form.superAdmin || accountUnlimitedTraffic(form) ? false : form.refundOnDelete,
        refundOnEdit: form.superAdmin || accountUnlimitedTraffic(form) ? false : form.refundOnEdit,
        unlimitedTraffic: accountUnlimitedTraffic(form),
      };
      if (callerIsOwner && !admin.isOwner) {
        payload.role = form.superAdmin ? "SUPER_ADMIN" : "RESELLER";
      }
      if (!form.superAdmin) {
        payload.quotaMode = quotaMode;
        if (perPanelQuotas) {
          payload.panelQuotas = buildPanelQuotasPayload(
            form.enabledPanels,
            form.panelQuotas,
            form.quotaBaselines,
          );
          payload.maxClients = 0;
          payload.maxDeviceLimit = 0;
          payload.maxExpireDays = 0;
          payload.maxClientTrafficGb = 0;
        } else {
          const stock = form.globalBaseline ?? EMPTY_QUOTA_BASELINE;
          payload.balance = form.unlimitedTraffic ? 0 : applyTrafficDeltaBytes(stock.balance, form.gb);
          payload.maxClients = applyCountDelta(stock.maxClients, form.maxClients);
          payload.maxDeviceLimit = applyCountDelta(stock.maxDeviceLimit, form.maxDeviceLimit);
          payload.maxExpireDays = applyCountDelta(stock.maxExpireDays, form.maxExpireDays);
          payload.maxClientTrafficGb = form.unlimitedTraffic
            ? 0
            : applyCountDelta(stock.maxClientTrafficGb, form.maxClientTrafficGb);
        }
      }
      if (form.password.trim()) payload.password = form.password;
      if (!form.superAdmin && form.expiryDays.trim()) {
        payload.expiryTime = applyExpiryDeltaMs(admin.expiryTime, form.expiryDays);
      }
      payload.storeEnabled = form.superAdmin ? false : form.storeEnabled;
      const nextUsername = form.username.trim();
      if (nextUsername && nextUsername !== admin.username) {
        payload.username = nextUsername;
      }
      
      const res = await api.patch(`/admins/${adminId}`, payload);
      if (!form.superAdmin) {
        await persistProviderAccess(
          adminId,
          collectProviderAccessDrafts(
            providerDrafts.current,
            panels,
            form.enabledPanels,
            perPanelQuotas
              ? payload.panelQuotas || []
              : form.enabledPanels.map((panelId) => ({
                  panelId,
                  balanceBytes: payload.balance || 0,
                  maxClients: payload.maxClients || 0,
                  unlimitedTraffic: accountUnlimitedTraffic(form),
                })),
            quotaMode,
            accountUnlimitedTraffic(form),
          ),
        );
      }
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

  const perPanelStock = Object.values(form.quotaBaselines || {}).reduce(
    (sum, row) => sum + (Number(row.balance) || 0),
    0,
  );
  const remaining = form.superAdmin || accountUnlimitedTraffic(form)
    ? t("common.unlimited")
    : perPanelQuotas
      ? form.enabledPanels.some((id) => form.panelQuotas[id]?.unlimitedTraffic || form.quotaBaselines[id]?.unlimitedTraffic)
        ? t("common.unlimited")
        : perPanelStock > 0
          ? formatBytes(perPanelStock)
          : t("admins.exhausted")
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
      <motion.div {...MOTION_CONFIG.modalContent} className="w-full max-w-5xl min-w-0 rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden max-h-[90vh]">
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
                          {!limitsLocked ? (
                            <>
                              <QuotaModeToggle
                                value={quotaMode === "GLOBAL" ? "GLOBAL" : "PER_PANEL"}
                                onChange={(mode) => setForm((f) => applyQuotaModeChange(f, mode))}
                              />
                              {perPanelQuotas ? (
                                <div className="rounded-lg border border-violet-500/25 bg-violet-500/5 p-3 text-sm text-violet-600 dark:text-violet-400 flex items-start gap-2">
                                  <Layers size={16} className="shrink-0 mt-0.5" />
                                  <span className="leading-relaxed">{t("admins.limitsLiveOnPanels")}</span>
                                </div>
                              ) : (
                                <PanelLimitFields
                                  title={t("admins.globalLimitsTitle")}
                                  deviceKey="admins.maxDeviceLimit"
                                  trafficModeHint={t("admins.globalTrafficModeHint")}
                                  unlimited={form.unlimitedTraffic}
                                  onUnlimitedChange={(next) => setForm((f) => ({ ...f, unlimitedTraffic: next }))}
                                  value={{
                                    gb: form.gb,
                                    maxClients: form.maxClients,
                                    maxDeviceLimit: form.maxDeviceLimit,
                                    maxExpireDays: form.maxExpireDays,
                                    maxClientTrafficGb: form.maxClientTrafficGb,
                                    trafficMode: form.trafficMode,
                                    unlimitedTraffic: form.unlimitedTraffic,
                                  }}
                                  current={form.globalBaseline}
                                  onChange={(patch) =>
                                    setForm((f) => ({
                                      ...f,
                                      gb: patch.gb ?? f.gb,
                                      maxClients: patch.maxClients ?? f.maxClients,
                                      maxDeviceLimit: patch.maxDeviceLimit ?? f.maxDeviceLimit,
                                      maxExpireDays: patch.maxExpireDays ?? f.maxExpireDays,
                                      maxClientTrafficGb: patch.maxClientTrafficGb ?? f.maxClientTrafficGb,
                                      trafficMode: patch.trafficMode ?? f.trafficMode,
                                      unlimitedTraffic: patch.unlimitedTraffic ?? f.unlimitedTraffic,
                                    }))
                                  }
                                />
                              )}
                              {admin.quotaMode === "PER_PANEL" && quotaMode === "GLOBAL" ? (
                                <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2">
                                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                                  <span className="leading-relaxed">{t("admins.switchToGlobalNotice")}</span>
                                </div>
                              ) : null}
                              {admin.quotaMode !== "PER_PANEL" && quotaMode === "PER_PANEL" ? (
                                <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-3 text-xs text-amber-600 dark:text-amber-400 flex items-start gap-2">
                                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                                  <span className="leading-relaxed">{t("admins.perPanelMigrationNotice")}</span>
                                </div>
                              ) : null}
                            </>
                          ) : null}
                          <div>
                            <div className="mb-1 flex min-w-0 flex-col gap-0.5">
                              <label className="text-sm font-medium leading-snug text-zinc-500 dark:text-zinc-400">
                                {t("admins.addExpiryDays")}
                              </label>
                              <span className="text-xs font-medium text-zinc-500">
                                {t("admins.stockAvailable", { value: expiryDaysLabel })}
                              </span>
                            </div>
                            <input
                              type="text"
                              inputMode="decimal"
                              autoComplete="off"
                              placeholder={t("admins.adjustTrafficPlaceholder")}
                              disabled={limitsLocked}
                              value={form.expiryDays}
                              onChange={(e) => setForm({ ...form, expiryDays: e.target.value })}
                              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2.5 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors placeholder:text-zinc-600"
                            />
                            <p className="text-xs text-zinc-500 mt-1.5">{t("admins.adjustAccountExpiryHint")}</p>
                          </div>
                          
                          {admin && !(accountUnlimitedTraffic(form) && !perPanelQuotas) && (
                            <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-4 mt-2">
                              <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-500 mb-3">{t("admins.currentTraffic")}</h3>
                              {admin.quotaMode === "PER_PANEL" && admin.panelQuotas?.length ? (
                                <div className="space-y-2">
                                  {admin.panelQuotas.map((q) => (
                                    <div key={q.panelId} className="text-sm">
                                      <div className="flex justify-between items-center">
                                        <span className="text-zinc-500 truncate">{q.panelName || q.panelId}</span>
                                        <span className="font-medium text-blue-400 shrink-0 ms-2">
                                          {q.unlimitedTraffic ? t("admins.stockUnlimited") : `${(q.balance / (1024 ** 3)).toFixed(2)} GB`}
                                        </span>
                                      </div>
                                      <div className="text-[10px] text-zinc-500">
                                        {t("admins.panelCapsSummary", {
                                          clients: q.maxClients ? q.maxClients : "∞",
                                          devices: q.maxDeviceLimit ? q.maxDeviceLimit : "∞",
                                          days: q.maxExpireDays ? q.maxExpireDays : "∞",
                                          traffic: q.maxClientTrafficGb ? q.maxClientTrafficGb : "∞",
                                        })}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                          <div className="grid grid-cols-3 gap-2 sm:gap-4">
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
                            <p className="mb-4 text-xs leading-relaxed text-zinc-500">
                              {t(perPanelQuotas ? "admins.trafficModeMovedHint" : "admins.globalTrafficModeHint")}
                            </p>
                            
                            <div className="mt-4 space-y-3 pt-4 border-t border-zinc-200 dark:border-zinc-800">
                              <label className={`flex items-center gap-3 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer ${accountUnlimitedTraffic(form) || limitsLocked ? 'opacity-50 pointer-events-none' : ''}`}>
                                <input type="checkbox" checked={form.refundOnDelete} disabled={accountUnlimitedTraffic(form) || limitsLocked} onChange={(e) => setForm({ ...form, refundOnDelete: e.target.checked })} className="w-4 h-4 rounded text-blue-600 bg-zinc-100 border-zinc-300 dark:bg-zinc-700 dark:border-zinc-600 focus:ring-blue-500" />
                                <div className="flex flex-col">
                                  <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200">{t("admins.refundOnDelete")}</span>
                                  <span className="text-xs text-zinc-500">{t("admins.refundOnDeleteHint")}</span>
                                </div>
                              </label>
                              <label className={`flex items-center gap-3 p-2 rounded-lg border border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 cursor-pointer ${accountUnlimitedTraffic(form) || limitsLocked ? 'opacity-50 pointer-events-none' : ''}`}>
                                <input type="checkbox" checked={form.refundOnEdit} disabled={accountUnlimitedTraffic(form) || limitsLocked} onChange={(e) => setForm({ ...form, refundOnEdit: e.target.checked })} className="w-4 h-4 rounded text-blue-600 bg-zinc-100 border-zinc-300 dark:bg-zinc-700 dark:border-zinc-600 focus:ring-blue-500" />
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
                      <div className="p-4 grid grid-cols-1 gap-4 border-t border-zinc-200 dark:border-zinc-800 sm:grid-cols-2">
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
                        <div className="sm:col-span-2">
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
                          <label className="mb-2 block text-sm font-medium text-zinc-800 dark:text-zinc-100">
                            {t("admins.allowedPanelsInbounds")}
                            <span className="block text-xs font-normal text-zinc-500 mt-0.5">{t(perPanelQuotas ? "admins.allowedPanelsAndLimitsHint" : "admins.allowedPanelsSharedPoolHint")}</span>
                          </label>
                          <PanelInboundPicker
                            panels={panels ?? []}
                            inbounds={inbounds ?? []}
                            isLoading={inboundsLoading}
                            enabledPanels={form.enabledPanels}
                            selectedInbounds={form.selectedInbounds}
                            onChange={(next) => setForm((f) => applyPanelSelection(f, next))}
                            disabled={limitsLocked}
                            allowPremiumPanels={isPremium}
                            adminId={adminId}
                            onProviderDraft={(items) => mergeProviderDraft(providerDrafts, items)}
                            panelQuotas={form.panelQuotas}
                            quotaBaselines={form.quotaBaselines}
                            onQuotaChange={(panelId, patch) => setForm((f) => patchPanelQuota(f, panelId, patch))}
                            showQuotaFields={perPanelQuotas}
                            unlimitedTraffic={form.unlimitedTraffic}
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
                                  <PremiumGem size={12} className="text-emerald-500" />
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

              {!form.superAdmin && admin.role !== "SUPER_ADMIN" ? (
                <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
                  <AdminPremiumAccess mode="live" adminId={admin.id} />
                </div>
              ) : null}

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
                        <span className="font-medium text-zinc-800 dark:text-zinc-100 shrink-0">
                          {q.unlimitedTraffic ? t("admins.stockUnlimited") : formatBytes(q.balance)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <SummaryStat icon={<Database size={16} />} label={t("admins.availableTraffic")} value={remaining} highlight={!admin.unlimitedTraffic && !form.superAdmin && (perPanelQuotas ? perPanelStock <= 0 : admin.balance === 0)} />
                )}
              </>
            )}
            {(form.superAdmin || accountUnlimitedTraffic(form)) && (
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
