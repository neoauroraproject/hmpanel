"use client";

import { useState, useEffect, useMemo } from "react";
import { clsx } from "clsx";
import { useQuery, useMutation, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { copyToClipboard } from "@/lib/clipboard";
import type { Client, Paginated, Admin } from "@/lib/types";
import { formatBytes, formatExpiry, isExpired, formatDate } from "@/lib/format";
import { Card, PageHeader, Badge, Spinner, ErrorBox } from "@/components/ui";
import { useToast } from "@/components/toast";
import { useAuth } from "@/store/auth";
import { useT } from "@/i18n";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Plus, ChevronDown, ChevronUp, Copy, Check, CheckCircle2,
  Trash2, X, Play, Square, CheckSquare, Eye, MoreVertical, QrCode, Link, Edit2, Power, 
  Activity, Users, HardDrive, CalendarDays, Filter, FolderPlus, RotateCcw, AlertTriangle, Database, Network, Download
} from "lucide-react";
import { io } from "socket.io-client";
import { ConnectionDetailsModal } from "@/components/ConnectionDetailsModal";
import { BulkCreateModal } from "./BulkCreateModal";
import { PluginSlot } from "@/components/PluginSlot";
import { NodeInboundBadge } from "@/components/NodeInboundBadge";

const GB = 1024 ** 3;

function bulkActionLabel(
  t: (key: string, params?: Record<string, string | number>) => string,
  action: string,
): string {
  const keys: Record<string, string> = {
    enable: "clients.enable",
    disable: "clients.disable",
    delete: "common.delete",
    cleanup: "common.delete",
    resetUsage: "clients.resetUsage",
    resetTraffic: "clients.resetTraffic",
    addTraffic: "clients.addTraffic",
    addDays: "clients.addDays",
    assignGroup: "clients.assignGroup",
    assignInbounds: "clients.assignInbounds",
    exportSubs: "clients.exportSubs",
  };
  const key = keys[action];
  return key ? t(key) : action;
}

interface InboundRow {
  id: string;
  tag: string;
  port: number;
  protocol: string;
  remark?: string;
  nodeId?: number | null;
  originNodeGuid?: string | null;
  streamSettings?: any;
  panel: { id: string; name: string; url: string; subUrl?: string | null };
}

interface PanelRow {
  id: string;
  name: string;
  url: string;
  subUrl?: string | null;
}

function CopyBtn({ text }: { text: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const toast = useToast((s) => s.push);
  const handleCopy = async () => {
    try {
      await copyToClipboard(text);
      setCopied(true);
      toast(t("common.copiedToClipboard"), "success");
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };
  return (
    <button
      onClick={(e) => {
        e.stopPropagation();
        handleCopy();
      }}
      className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
      title={t("common.copyToClipboard")}
    >
      {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
    </button>
  );
}

function UsageBar({ up, down, total }: { up: string; down: string; total: string }) {
  const t = useT();
  const used = Number(up) + Number(down);
  const cap = Number(total);
  const pct = cap > 0 ? Math.min(100, (used / cap) * 100) : 0;
  return (
    <div className="w-full max-w-[160px]">
      <div className="mb-1 flex justify-between text-[11px] text-zinc-500 dark:text-zinc-400">
        <span>{formatBytes(used)}</span>
        <span>/ {cap > 0 ? formatBytes(cap) : t("common.unlimited")}</span>
      </div>
      <div className="h-1.5 w-full rounded-full bg-zinc-100 dark:bg-zinc-800 overflow-hidden">
        <div
          className={
            pct > 85 ? "h-1.5 rounded-full bg-red-500" : "h-1.5 rounded-full bg-blue-500"
          }
          style={{ width: cap > 0 ? `${pct}%` : "100%" }}
        />
      </div>
    </div>
  );
}

export default function ClientsPage() {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);
  const adminUser = useAuth((s) => s.admin);
  const isSuperAdmin = adminUser?.role === "SUPER_ADMIN";

  const onlinesQuery = useQuery({
    queryKey: ["live-onlines"],
    queryFn: async () => (await api.get<{ onlines: string[] }>("/stats/onlines")).data,
    refetchInterval: 10000,
    refetchOnWindowFocus: true
  });
  const onlineClients = onlinesQuery.data?.onlines ?? [];

  const onlineIpsQuery = useQuery({
    queryKey: ["online-ips"],
    queryFn: async () => (await api.get<Record<string, number>>("/panels/online-ips")).data,
    refetchInterval: 15000,
  });
  const onlineIps = onlineIpsQuery.data ?? {};

  // Filter States
  const [search, setSearch] = useState("");
  const [adminId, setAdminId] = useState("");
  const [inboundId, setInboundId] = useState("");
  const [panelId, setPanelId] = useState("");
  const [status, setStatus] = useState("");
  const [expiry, setExpiry] = useState("");
  const [trafficRange, setTrafficRange] = useState("");

  // Pagination State
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(25);

  // Persistent Selection state (maps client ID -> Client object)
  const [selectedClients, setSelectedClients] = useState<Record<string, Client>>({});
  const selectedIds = Object.keys(selectedClients);
  const selectedCount = selectedIds.length;

  const [expandedId, setExpandedId] = useState<string | null>(null);
  
  // Instant fetch when opening client details
  useEffect(() => {
    if (expandedId) {
      onlinesQuery.refetch();
    }
  }, [expandedId]);

  const [editing, setEditing] = useState<Client | null>(null);
  const [connectionDetailsClient, setConnectionDetailsClient] = useState<Client | null>(null);
  const [filterDrawerOpen, setFilterDrawerOpen] = useState(false);
  const [showStatsMobile, setShowStatsMobile] = useState(false);
  const [showQuickFilters, setShowQuickFilters] = useState(false);

  // Modals state
  const [addOpen, setAddOpen] = useState(false);
  const [bulkCreateOpen, setBulkCreateOpen] = useState(false);
  const [groupAssignModalOpen, setGroupAssignModalOpen] = useState(false);
  const [mobileActionsOpen, setMobileActionsOpen] = useState(false);
  
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [pendingBulkAction, setPendingBulkAction] = useState<"enable" | "disable" | "delete" | "cleanup" | "resetUsage" | "resetTraffic" | null>(null);
  const [assignInboundsModalOpen, setAssignInboundsModalOpen] = useState(false);
  const [assignInboundIds, setAssignInboundIds] = useState<string[]>([]);

  const [bulkValueModal, setBulkValueModal] = useState<{
    action: "addTraffic" | "addDays";
    title: string;
    label: string;
    placeholder: string;
  } | null>(null);
  const [bulkInputValue, setBulkInputValue] = useState("");

  // Bulk operation results modal
  const [bulkResult, setBulkResult] = useState<{
    success: number;
    failed: number;
    errors: string[];
    action: string;
  } | null>(null);

  // Query Clients
  const { data, isLoading, isFetching, error } = useQuery<Paginated<Client>>({
    queryKey: ["clients", page, limit, search, adminId, inboundId, panelId, status, expiry, trafficRange],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const params = new URLSearchParams();
      params.append("page", String(page));
      params.append("limit", String(limit));
      if (search) params.append("search", search);
      if (adminId) params.append("adminId", adminId);
      if (inboundId) params.append("inboundId", inboundId);
      if (panelId) params.append("panelId", panelId);
      if (status) params.append("status", status);
      if (expiry) params.append("expiry", expiry);
      if (trafficRange) params.append("trafficRange", trafficRange);

      return (await api.get<Paginated<Client>>(`/clients?${params.toString()}`)).data;
    },
  });

  // KPI Overview
  const { data: overviewData } = useQuery({
    queryKey: ["reseller-overview", panelId],
    queryFn: async () => (await api.get<any>(`/stats/reseller-overview${panelId ? `?panelId=${panelId}` : ''}`)).data,
  });

  const displayClients = data?.data ?? [];

  // Query options lists for filters
  const { data: adminsList } = useQuery<Paginated<Admin>>({
    queryKey: ["admins-list"],
    queryFn: async () => (await api.get<Paginated<Admin>>("/admins?limit=100")).data,
    enabled: isSuperAdmin,
  });

  const { data: inboundsList, isLoading: isLoadingInbounds } = useQuery<InboundRow[]>({
    queryKey: ["inbounds-list"],
    queryFn: async () => (await api.get<InboundRow[]>("/inbounds")).data,
  });

  const { data: panelsList } = useQuery<PanelRow[]>({
    queryKey: ["panels-list"],
    queryFn: async () => (await api.get<PanelRow[]>("/panels")).data,
    enabled: isSuperAdmin,
  });

  // Mutations
  const toggle = useMutation({
    onMutate: async (c: Client) => {
      // Optimistic UI updates
      await qc.cancelQueries({ queryKey: ["clients"] });
      const previous = qc.getQueryData(["clients", page, limit, search, adminId, inboundId, panelId, status, expiry, trafficRange]);
      
      qc.setQueryData(
        ["clients", page, limit, search, adminId, inboundId, panelId, status, expiry, trafficRange],
        (old: any) => {
          if (!old) return old;
          return {
            ...old,
            data: old.data.map((item: Client) =>
              item.id === c.id ? { ...item, enable: !item.enable } : item
            ),
          };
        }
      );
      return { previous };
    },
    mutationFn: async (c: Client) =>
      api.patch(`/clients/${c.id}`, { enable: !c.enable }),
    onSuccess: () => {
      toast(t("clients.statusUpdated"));
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["clients"] });
        qc.invalidateQueries({ queryKey: ["reseller-overview"] });
        qc.invalidateQueries({ queryKey: ["overview"] });
      }, 1500);
    },
    onError: (err, variables, context) => {
      if (context?.previous) {
        qc.setQueryData(
          ["clients", page, limit, search, adminId, inboundId, panelId, status, expiry, trafficRange],
          context.previous
        );
      }
      toast(t("common.actionFailed"), "error");
    },
  });

  const bulkMutation = useMutation({
    mutationFn: async (dto: {
      ids: string[];
      action: "enable" | "disable" | "delete" | "cleanup" | "addTraffic" | "addDays" | "resetUsage" | "resetTraffic" | "assignGroup" | "assignInbounds";
      value?: number;
      groupName?: string;
      inboundIds?: string[];
    }) => (await api.post<any>("/clients/bulk", dto)).data,
    onSuccess: (d, vars) => {
      if (d.failed > 0) {
        setBulkResult({
          success: d.affected,
          failed: d.failed,
          errors: d.errors,
          action: vars.action,
        });
      } else {
        toast(t("clients.bulkActionCompleted", { action: bulkActionLabel(t, vars.action), count: d.affected }), "success");
      }
      setSelectedClients({});
      setBulkValueModal(null);
      setBulkInputValue("");
      setGroupAssignModalOpen(false);
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["clients"] });
        qc.invalidateQueries({ queryKey: ["reseller-overview"] });
        qc.invalidateQueries({ queryKey: ["overview"] });
      }, 1500);
    },
    onError: (err: any) => {
      toast(err.response?.data?.message || t("clients.bulkActionFailed"), "error");
    },
  });

  // Optimized bulk enable/disable — uses 3.4.2 bulk endpoints when available
  const bulkToggleMutation = useMutation({
    mutationFn: async (dto: { ids: string[]; action: "enable" | "disable" }) =>
      (await api.post<any>(`/bulk-clients/${dto.action}`, { ids: dto.ids })).data,
    onSuccess: (d, vars) => {
      if (d.failed > 0) {
        setBulkResult({
          success: d.affected,
          failed: d.failed,
          errors: d.errors,
          action: vars.action,
        });
      } else {
        toast(t("clients.bulkActionCompleted", { action: bulkActionLabel(t, vars.action), count: d.affected }), "success");
      }
      setSelectedClients({});
      setTimeout(() => {
        qc.invalidateQueries({ queryKey: ["clients"] });
        qc.invalidateQueries({ queryKey: ["reseller-overview"] });
        qc.invalidateQueries({ queryKey: ["overview"] });
      }, 1500);
    },
    onError: (err: any) => {
      toast(err.response?.data?.message || t("clients.bulkActionFailed"), "error");
    },
  });

  // Export subscription links as downloadable TXT
  const bulkExportMutation = useMutation({
    mutationFn: async (dto: { ids: string[] }) =>
      (await api.post<any>("/bulk-clients/export-subs", dto)).data,
    onSuccess: (data) => {
      const blob = new Blob([data.content], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast(t("clients.exportedLinks", { count: data.count }), "success");
    },
    onError: (err: any) => {
      toast(err.response?.data?.message || t("clients.exportFailed"), "error");
    },
  });

  // Must stay above loading/error early returns (Rules of Hooks).
  const filterChips = useMemo(
    () => [
      { id: "", label: t("clients.filterAll") },
      { id: "online", label: t("clients.filterOnline") },
      { id: "traffic-low", label: t("clients.filterLowTraffic") },
      { id: "expiring-soon", label: t("clients.filterExpiringSoon") },
      { id: "disabled", label: t("clients.filterDisabled") },
      { id: "expired", label: t("clients.filterExpired") },
      { id: "depleted", label: t("clients.filterNoTraffic") },
    ],
    [t],
  );

  if (isLoading) return <Spinner />;
  if (error) return <ErrorBox message={t("clients.loadFailed")} />;

  const clients = data?.data ?? [];
  const totalItems = data?.total ?? 0;
  const totalPages = Math.ceil(totalItems / limit);

  // Checkbox functions
  const currentPageIds = clients.map((c) => c.id);
  const allCurrentPageSelected = clients.length > 0 && currentPageIds.every((id) => selectedClients[id]);

  const handleSelectAll = () => {
    setSelectedClients((prev) => {
      const next = { ...prev };
      if (allCurrentPageSelected) {
        for (const id of currentPageIds) {
          delete next[id];
        }
      } else {
        for (const client of clients) {
          next[client.id] = client;
        }
      }
      return next;
    });
  };

  const handleSelectOne = (client: Client) => {
    setSelectedClients((prev) => {
      const next = { ...prev };
      if (next[client.id]) {
        delete next[client.id];
      } else {
        next[client.id] = client;
      }
      return next;
    });
  };

  const handleBulkAction = (action: string) => {
    if (action === "delete") {
      setDeleteConfirmOpen(true);
    } else if (action === "resetUsage" || action === "resetTraffic") {
      setResetConfirmOpen(true);
    } else if (action === "enable" || action === "disable") {
      setPendingBulkAction(action as any);
    } else if (action === "assignInbounds") {
      setAssignInboundsModalOpen(true);
    } else if (action === "addTraffic") {
      setBulkValueModal({
        action,
        title: t("clients.bulkAddTrafficTitle"),
        label: t("clients.bulkAddTrafficLabel"),
        placeholder: t("clients.bulkAddTrafficPlaceholder"),
      });
    } else if (action === "addDays") {
      setBulkValueModal({
        action,
        title: t("clients.bulkAddDaysTitle"),
        label: t("clients.bulkAddDaysLabel"),
        placeholder: t("clients.bulkAddDaysPlaceholder"),
      });
    } else if (action === "assignGroup") {
      setGroupAssignModalOpen(true);
    } else if (action === "exportSubs") {
      bulkExportMutation.mutate({ ids: selectedIds });
    }
  };

  const submitBulkValue = () => {
    if (!bulkValueModal) return;
    const numVal = Number(bulkInputValue);
    if (isNaN(numVal) || numVal <= 0) {
      toast(t("clients.invalidPositiveNumber"), "error");
      return;
    }
    bulkMutation.mutate({
      ids: selectedIds,
      action: bulkValueModal.action,
      value: numVal,
    });
  };

  const resetFilters = () => {
    setSearch("");
    setAdminId("");
    setInboundId("");
    setPanelId("");
    setStatus("");
    setExpiry("");
    setTrafficRange("");
    setPage(1);
  };

  // Up-front balance checks for Bulk Add Traffic
  const inputNum = Number(bulkInputValue) || 0;
  const bytesToAddPerClient = inputNum * 1024 * 1024 * 1024;
  const totalRequired = bytesToAddPerClient * selectedCount;
  const availableTraffic = overviewData?.admin?.availableTraffic ?? 0;
  const trafficMode = overviewData?.admin?.trafficMode ?? 'ALLOCATION';
  const unlimitedTraffic = overviewData?.admin?.unlimitedTraffic === true;
  const trafficExhausted =
    !!overviewData?.admin && !unlimitedTraffic && availableTraffic <= 0;
  const balanceAfter = availableTraffic - totalRequired;
  const insufficientBalance = trafficMode === 'ALLOCATION' && totalRequired > availableTraffic;

  // Traffic Impact calculations for Delete Confirmation
  const totalAllocatedTraffic = Object.values(selectedClients).reduce((sum, c) => sum + Number(c.total), 0);

  return (
    <div className="space-y-6 pb-20">
      <PageHeader
        title={t("clients.title")}
        subtitle={t(totalItems === 1 ? "clients.subtitle" : "clients.subtitle_plural", { count: totalItems })}
        action={
          <>
            <PluginSlot name="clients.actions" />
            <button
              onClick={() => setBulkCreateOpen(true)}
              disabled={trafficExhausted}
              title={trafficExhausted ? t("clients.insufficientBalance") : undefined}
              className="flex items-center gap-2 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-4 py-2 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors disabled:opacity-50 disabled:pointer-events-none"
            >
              <Users size={16} /> {t("clients.bulkCreate")}
            </button>
            <button
              onClick={() => setAddOpen(true)}
              disabled={trafficExhausted}
              title={trafficExhausted ? t("clients.insufficientBalance") : undefined}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 transition-colors shadow-lg shadow-blue-500/20 disabled:opacity-50 disabled:pointer-events-none disabled:shadow-none"
            >
              <Plus size={16} /> {t("clients.addClient")}
            </button>
          </>
        }
      />

      {/* Global KPI Header */}
      {overviewData && overviewData.admin && (
        <div className="mb-4">
          <div className="md:hidden flex justify-between items-center mb-2">
            <span className="text-sm font-semibold text-zinc-700 dark:text-zinc-300">{t("clients.overviewStats")}</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 pb-4 border-b border-zinc-200 dark:border-zinc-800 transition-all block md:grid">
            <div className="bg-white dark:bg-zinc-900/50 rounded-2xl p-4 border border-zinc-200 dark:border-zinc-800 flex items-center gap-4">
              <div className="p-3 bg-emerald-500/10 text-emerald-400 rounded-xl"><Activity size={20} /></div>
              <div>
                <div className="text-xs text-zinc-500 font-medium">{t("clients.onlineClients")}</div>
                <div className="text-xl font-bold text-zinc-900 dark:text-white">
                  {isSuperAdmin 
                    ? <>{onlineClients.length} <span className="text-sm font-normal text-zinc-500">({t("clients.global")})</span></>
                    : onlineClients.filter(c => c && overviewData?.clientEmails?.map((e: string) => e.trim().toLowerCase()).includes(c.toLowerCase())).length} 
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-zinc-900/50 rounded-2xl p-4 border border-zinc-200 dark:border-zinc-800 flex items-center gap-4">
              <div className="p-3 bg-blue-500/10 text-blue-400 rounded-xl"><HardDrive size={20} /></div>
              <div>
                <div className="text-xs text-zinc-500 font-medium">{t("clients.availableTraffic")}</div>
                <div className="text-xl font-bold text-zinc-900 dark:text-white">
                  {overviewData.admin.unlimitedTraffic
                    ? <span className="text-emerald-500">∞</span>
                    : formatBytes(overviewData.admin.availableTraffic)}
                </div>
                <div className="text-[10px] text-zinc-400 mt-1">
                  {overviewData.admin.unlimitedTraffic
                    ? t("common.unlimited")
                    : t("clients.outOf", { total: formatBytes(overviewData.admin.allTimeTraffic || 0) })}
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-zinc-900/50 rounded-2xl p-4 border border-zinc-200 dark:border-zinc-800 flex items-center gap-4">
              <div className="p-3 bg-purple-500/10 text-purple-400 rounded-xl"><Users size={20} /></div>
              <div>
                <div className="text-xs text-zinc-500 font-medium">{t("clients.clientCapacity")}</div>
                <div className="text-xl font-bold text-zinc-900 dark:text-white">
                  {overviewData.admin.clientCapacity === 0 
                    ? `${overviewData.clientEmails?.length ?? 0} / ∞` 
                    : `${overviewData.clientEmails?.length ?? 0} / ${overviewData.admin.clientCapacity}`}
                </div>
              </div>
            </div>
            <div className="bg-white dark:bg-zinc-900/50 rounded-2xl p-4 border border-zinc-200 dark:border-zinc-800 flex items-center gap-4">
              <div className="p-3 bg-amber-500/10 text-amber-400 rounded-xl"><CalendarDays size={20} /></div>
              <div>
                <div className="text-xs text-zinc-500 font-medium">{t("clients.subscriptionExpiry")}</div>
                <div className="text-xl font-bold text-zinc-900 dark:text-white">
                  {overviewData.admin.expiryTime > 0 
                    ? (overviewData.admin.expiryTime < Date.now() 
                        ? t("common.expired")
                        : t("clients.daysRemaining", { count: Math.ceil((overviewData.admin.expiryTime - Date.now()) / (1000 * 60 * 60 * 24)) })) 
                    : t("common.never")}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search and Quick Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="w-full sm:w-72 relative">
          <div className="absolute inset-y-0 start-3 flex items-center pointer-events-none">
            <svg className="h-4 w-4 text-zinc-500 dark:text-zinc-400" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
          </div>
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder={t("clients.searchExtendedPlaceholder")}
            className="w-full bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-lg ps-9 pe-4 py-2 text-base md:text-sm text-zinc-800 dark:text-zinc-100 focus:outline-none focus:border-blue-500"
          />
        </div>
      </div>

      <div>
        <div className="flex overflow-x-auto hide-scrollbar items-center gap-2 pb-2 -mx-4 px-4 sm:mx-0 sm:px-0">
          <div className="hidden sm:flex items-center gap-2 me-2 text-sm text-zinc-500 dark:text-zinc-400 font-medium">
            <Filter size={16} /> {t("clients.filtersLabel")}
          </div>
          {filterChips.map(f => (
            <button
              key={f.id}
              onClick={() => { setStatus(f.id); setPage(1); }}
              className={`whitespace-nowrap px-4 py-1.5 rounded-full text-xs font-semibold transition-colors border ${
                status === f.id ? 'bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20' : 'bg-white dark:bg-zinc-900 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-800'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Advanced Filters Drawer/Collapsible */}
      <div className="md:hidden flex justify-end">
        <button
          onClick={() => setFilterDrawerOpen(!filterDrawerOpen)}
          className="flex items-center gap-2 rounded-lg bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 px-4 py-2 text-sm font-medium text-zinc-600 dark:text-zinc-300"
        >
          <Filter size={16} /> {filterDrawerOpen ? t("clients.hideFilters") : t("clients.advancedFilters")}
        </button>
      </div>

      <Card className={`p-4 space-y-4 ${filterDrawerOpen ? "block" : "hidden md:block"}`}>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4 lg:grid-cols-6">

          {/* Admin Filter */}
          {isSuperAdmin && (
            <div>
              <select
                value={adminId}
                onChange={(e) => {
                  setAdminId(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-600 dark:text-zinc-300 outline-none focus:border-blue-500"
              >
                <option value="">{t("clients.allAdmins")}</option>
                <option value="orphaned">{t("clients.noAdminDirect")}</option>
                {adminsList?.data.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.username}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Panel Filter */}
          {isSuperAdmin && (
            <div>
              <select
                value={panelId}
                onChange={(e) => {
                  setPanelId(e.target.value);
                  setPage(1);
                }}
                className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-600 dark:text-zinc-300 outline-none focus:border-blue-500"
              >
                <option value="">{t("clients.allPanels")}</option>
                {panelsList?.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Inbound Filter */}
          <div>
            <select
              value={inboundId}
              onChange={(e) => {
                setInboundId(e.target.value);
                setPage(1);
              }}
              className="w-full rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-600 dark:text-zinc-300 outline-none focus:border-blue-500"
            >
              <option value="">{t("clients.allInbounds")}</option>
              {inboundsList?.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.remark ? `${i.remark} — ` : ''}{i.tag} ({i.protocol})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Clear Filters Link */}
        {(search || adminId || inboundId || panelId || status || expiry || trafficRange) && (
          <div className="flex justify-end">
            <button
              onClick={resetFilters}
              className="text-xs text-blue-400 hover:text-blue-300 transition-colors"
            >
              {t("clients.resetFilters")}
            </button>
          </div>
        )}
      </Card>

      {/* Main Table / Cards */}
      <Card className="overflow-hidden p-0 bg-transparent md:bg-zinc-50 dark:bg-zinc-950 border-0 md:border md:border-zinc-200 dark:border-zinc-800">
        <div className="overflow-x-auto">
          <table className="w-full text-sm block md:table">
            <thead className="hidden md:table-header-group">
              <tr className="border-b border-zinc-200 dark:border-zinc-800 text-start text-xs uppercase tracking-wide text-zinc-500 bg-white dark:bg-zinc-900/30 font-semibold">
                <th className="w-12 px-4 py-3 text-center">
                  <button
                    onClick={handleSelectAll}
                    className="text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors inline-block"
                  >
                    {allCurrentPageSelected ? (
                      <CheckSquare size={16} className="text-blue-500" />
                    ) : (
                      <Square size={16} />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3 font-medium">{t("clients.colUsername")}</th>
                <th className="px-4 py-3 font-medium">{t("clients.colOwner")}</th>
                <th className="px-4 py-3 font-medium">{t("clients.colTraffic")}</th>
                <th className="px-4 py-3 font-medium">{t("clients.colExpiry")}</th>
                <th className="px-4 py-3 font-medium">{t("clients.colStatus")}</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody className="block md:table-row-group space-y-3 md:space-y-0">
              {displayClients.map((c, i) => {
                const isExpanded = expandedId === c.id;
                const isSelected = !!selectedClients[c.id];
                const isOnline = onlineClients.includes(c.email.trim().toLowerCase());
                const ipCount = onlineIps[c.email.trim()] || 0;
                return (
                  <AnimatePresence key={c.id}>
                      <motion.tr
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: i * 0.03 }}
                        onClick={() => {
                          if (selectedCount > 0) {
                            handleSelectOne(c);
                          } else {
                            setExpandedId(isExpanded ? null : c.id);
                          }
                        }}
                        className={`block md:table-row bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 md:border-b md:border-x-0 md:border-t-0 md:border-zinc-200 dark:border-zinc-800/60 rounded-xl md:rounded-none last:border-b-0 hover:bg-zinc-50 dark:hover:bg-zinc-900/30 transition-colors cursor-pointer ${
                          isExpanded ? "bg-white dark:bg-zinc-900/20" : ""
                        }`}
                      >
                      <td
                        className="hidden md:table-cell px-4 py-3 text-center"
                        onClick={(e) => { e.stopPropagation(); handleSelectOne(c); }}
                      >
                        <button
                          className="text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                        >
                          {isSelected ? (
                            <CheckSquare size={16} className="text-blue-500" />
                          ) : (
                            <Square size={16} />
                          )}
                        </button>
                      </td>
                      <td className="block md:table-cell px-4 py-3">
                        <div className="flex items-center justify-between md:justify-start gap-2">
                          <div className="flex items-center gap-2">
                            {/* Checkbox wrapper for mobile */}
                            <div className="md:hidden" onClick={(e) => { e.stopPropagation(); handleSelectOne(c); }}>
                              {isSelected ? (
                                <CheckSquare size={18} className="text-blue-500" />
                              ) : (
                                <Square size={18} className="text-zinc-400" />
                              )}
                            </div>
                            <div className="font-semibold text-zinc-800 dark:text-zinc-100">{c.remark || c.email}</div>
                            {isOnline && (
                              <div className="flex items-center gap-1">
                                <span className="relative flex h-2.5 w-2.5" title={t("common.online")}>
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
                                </span>
                                {ipCount > 0 && (
                                  <span className="text-[10px] font-bold text-emerald-500 bg-emerald-500/10 px-1.5 py-0.5 rounded-md" title={t("clients.ipsConnected", { count: ipCount })}>
                                    {t("clients.ipShort", { count: ipCount })}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                          
                          {/* Mobile status indicator - always visible */}
                          <div className="md:hidden flex items-center gap-1">
                            {(() => {
                              const used = Number(c.up) + Number(c.down);
                              const cap = Number(c.total);
                              const outOfTraffic = cap > 0 && used >= cap;
                              const expired = isExpired(c.expiryTime);
                              
                              if (!c.enable) return <Badge tone="gray">{t("common.disabled")}</Badge>;
                              if (outOfTraffic) return <Badge tone="red">{t("clients.noTraffic")}</Badge>;
                              if (expired) return <Badge tone="red">{t("common.expired")}</Badge>;
                              if (isOnline) return <Badge tone="green">{t("common.online")}</Badge>;
                              return <Badge tone="blue">{t("common.active")}</Badge>;
                            })()}
                          </div>
                        </div>
                        {c.remark && (
                          <div className="text-xs text-zinc-500 mt-1 md:mt-0">{c.email}</div>
                        )}
                      </td>
                      <td className="hidden md:table-cell px-4 py-3 text-zinc-600 dark:text-zinc-300">
                        {c.admin?.username || <Badge tone="gray">{t("clients.directPanel")}</Badge>}
                      </td>
                      <td className="hidden md:table-cell px-4 py-3">
                        <UsageBar up={c.up} down={c.down} total={c.total} />
                      </td>
                      <td className="block md:table-cell px-4 py-3 text-zinc-600 dark:text-zinc-300">
                        <div className="md:hidden flex items-center justify-between">
                          <UsageBar up={c.up} down={c.down} total={c.total} />
                          <span className={`text-xs ms-2 whitespace-nowrap ${isExpired(c.expiryTime) ? "text-red-400 font-medium" : ""}`}>
                            {formatExpiry(c.expiryTime)}
                          </span>
                        </div>
                        <span className={`hidden md:inline ${isExpired(c.expiryTime) ? "text-red-400 font-medium" : ""}`}>
                          {formatExpiry(c.expiryTime)}
                        </span>
                      </td>
                      <td className="hidden md:table-cell px-4 py-3">
                        {(() => {
                          const used = Number(c.up) + Number(c.down);
                          const cap = Number(c.total);
                          const outOfTraffic = cap > 0 && used >= cap;
                          const expired = isExpired(c.expiryTime);
                          
                          if (!c.enable) {
                            return (
                              <div className="flex items-center gap-2" title={t("common.disabled")}>
                                <span className="h-2 w-2 rounded-full bg-zinc-500"></span>
                                <span className="text-xs text-zinc-500 dark:text-zinc-400">{t("common.disabled")}</span>
                              </div>
                            );
                          }
                          if (outOfTraffic || expired) {
                            return (
                              <div className="flex items-center gap-2" title={outOfTraffic ? t("clients.outOfTraffic") : t("common.expired")}>
                                <span className="h-2 w-2 rounded-full bg-red-500"></span>
                                <span className="text-xs text-red-400">{outOfTraffic ? t("clients.noTraffic") : t("common.expired")}</span>
                              </div>
                            );
                          }
                          if (isOnline) {
                            return (
                              <div className="flex items-center gap-2" title={t("common.online")}>
                                <span className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                </span>
                                <span className="text-xs text-emerald-400">{t("common.online")}{ipCount > 0 ? ` (${ipCount})` : ""}</span>
                              </div>
                            );
                          }
                          return (
                            <div className="flex items-center gap-2" title={t("common.active")}>
                              <span className="h-2 w-2 rounded-full bg-blue-500"></span>
                              <span className="text-xs text-blue-400">{t("common.active")}</span>
                            </div>
                          );
                        })()}
                      </td>
                      <td className="hidden md:table-cell px-4 py-3 border-t border-zinc-200 dark:border-zinc-800/50 md:border-0 mt-2 md:mt-0" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-wrap items-center justify-start md:justify-end gap-1.5 md:gap-1.5 w-full">
                          <motion.button
                            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              toggle.mutate(c);
                            }}
                            className={`p-2 rounded-lg transition-colors ${c.enable ? "text-emerald-400 hover:bg-emerald-400/10" : "text-zinc-500 hover:bg-zinc-100 dark:hover:bg-zinc-800"}`}
                            title={c.enable ? t("clients.disableClient") : t("clients.enableClient")}
                          >
                            <Power size={16} />
                          </motion.button>
                          
                          <motion.button
                            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setConnectionDetailsClient(c);
                            }}
                            className="p-2 text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors"
                            title={t("clients.subscriptionQr")}
                          >
                            <QrCode size={16} />
                          </motion.button>
                          
                          <motion.button
                            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditing(c);
                            }}
                            className="p-2 text-zinc-500 dark:text-zinc-400 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg transition-colors"
                            title={t("clients.editClient")}
                          >
                            <Edit2 size={16} />
                          </motion.button>

                          <motion.button
                            whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (confirm(t("clients.deleteClientConfirm", { email: c.email }))) {
                                bulkMutation.mutate({ ids: [c.id], action: 'delete' });
                              }
                            }}
                            className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                            title={t("clients.deleteClient")}
                          >
                            <Trash2 size={16} />
                          </motion.button>
                        </div>
                      </td>
                      <AnimatePresence>
                        {isExpanded && (
                          <motion.td
                            initial={{ opacity: 0, height: 0, paddingBottom: 0, paddingTop: 0 }}
                            animate={{ opacity: 1, height: "auto", paddingBottom: 16, paddingTop: 16 }}
                            exit={{ opacity: 0, height: 0, paddingBottom: 0, paddingTop: 0 }}
                            transition={{ duration: 0.25, ease: "easeOut" }}
                            className="block md:hidden px-4 border-t border-zinc-200 dark:border-zinc-800 mt-2"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex flex-wrap items-center justify-center gap-2 w-full">
                              <motion.button
                                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggle.mutate(c);
                                }}
                                className={`flex flex-1 justify-center items-center gap-2 px-3 py-2 rounded-lg transition-colors border ${c.enable ? "text-emerald-500 border-emerald-500/20 bg-emerald-500/10" : "text-zinc-500 border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800"}`}
                              >
                                <Power size={16} /> <span className="text-sm font-medium">{c.enable ? t("clients.disable") : t("clients.enable")}</span>
                              </motion.button>
                              
                              <motion.button
                                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setConnectionDetailsClient(c);
                                }}
                                className="flex flex-1 justify-center items-center gap-2 px-3 py-2 text-blue-500 border border-blue-500/20 bg-blue-500/10 rounded-lg transition-colors"
                              >
                                <QrCode size={16} /> <span className="text-sm font-medium">{t("clients.qrLink")}</span>
                              </motion.button>
                              
                              <motion.button
                                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditing(c);
                                }}
                                className="flex flex-1 justify-center items-center gap-2 px-3 py-2 text-zinc-600 dark:text-zinc-300 border border-zinc-200 dark:border-zinc-700 bg-zinc-100 dark:bg-zinc-800 rounded-lg transition-colors"
                              >
                                <Edit2 size={16} /> <span className="text-sm font-medium">{t("common.edit")}</span>
                              </motion.button>

                              <motion.button
                                whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (confirm(t("clients.deleteClientConfirm", { email: c.email }))) {
                                    bulkMutation.mutate({ ids: [c.id], action: 'delete' });
                                  }
                                }}
                                className="flex flex-1 justify-center items-center gap-2 px-3 py-2 text-red-500 border border-red-500/20 bg-red-500/10 rounded-lg transition-colors"
                              >
                                <Trash2 size={16} /> <span className="text-sm font-medium">{t("common.delete")}</span>
                              </motion.button>
                            </div>
                          </motion.td>
                        )}
                      </AnimatePresence>
                    </motion.tr>
                    {isExpanded && (
                      <motion.tr
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.25, ease: "easeOut" }}
                        className="hidden md:table-row bg-white dark:bg-zinc-900/40 border border-t-0 border-zinc-200 dark:border-zinc-800 md:border-b md:border-x-0"
                      >
                        <td colSpan={7} className="px-4 py-4">
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                            <div className="space-y-1">
                              <div className="text-xs text-zinc-500 uppercase font-semibold">{t("clients.connectionDetails")}</div>
                              <div className="flex justify-between items-center bg-zinc-50 dark:bg-zinc-950 p-2 rounded border border-zinc-200 dark:border-zinc-800">
                                <span className="text-zinc-600 dark:text-zinc-400">{t("clients.panelLabel")}</span>
                                <span className="font-medium text-zinc-900 dark:text-zinc-100">{c.inbound?.panel?.name || t("common.unknown")}</span>
                              </div>
                              <div className="flex justify-between items-center bg-zinc-50 dark:bg-zinc-950 p-2 rounded border border-zinc-200 dark:border-zinc-800">
                                <span className="text-zinc-600 dark:text-zinc-400">{t("clients.inboundLabel")}</span>
                                <span className="font-medium text-zinc-900 dark:text-zinc-100 flex items-center gap-1">
                                  {c.inbounds?.length ? c.inbounds.slice(0, 2).map((i: any) => i.tag).join(', ') : (c.inbound?.tag || t("common.unknown"))}
                                  {c.inbounds && c.inbounds.length > 2 && (
                                    <span className="text-[10px] bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400 px-1.5 py-0.5 rounded font-bold">
                                      +{c.inbounds.length - 2}
                                    </span>
                                  )}
                                </span>
                              </div>
                              <div className="flex justify-between items-center bg-zinc-50 dark:bg-zinc-950 p-2 rounded border border-zinc-200 dark:border-zinc-800">
                                <span className="text-zinc-600 dark:text-zinc-400">{t("clients.protocolLabel")}</span>
                                <span className="font-medium text-zinc-900 dark:text-zinc-100 uppercase flex items-center gap-1">
                                  {c.inbounds?.length 
                                    ? c.inbounds.slice(0, 2).map((i: any) => `${i.protocol}${i.streamSettings?.network ? ` ${i.streamSettings.network}` : ''}`).join(', ')
                                    : `${c.inbound?.protocol || t("common.unknown")}${(c.inbound as any)?.streamSettings?.network ? ` ${(c.inbound as any).streamSettings.network}` : ''}`
                                  }
                                  {c.inbounds && c.inbounds.length > 2 && (
                                    <span className="text-[10px] bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400 px-1.5 py-0.5 rounded font-bold">
                                      +{c.inbounds.length - 2}
                                    </span>
                                  )}
                                </span>
                              </div>
                            </div>
                            <div className="space-y-1">
                              <div className="text-xs text-zinc-500 uppercase font-semibold">{t("clients.trafficSpecifics")}</div>
                              <div className="flex justify-between items-center bg-zinc-50 dark:bg-zinc-950 p-2 rounded border border-zinc-200 dark:border-zinc-800">
                                <span className="text-zinc-600 dark:text-zinc-400">{t("clients.uploadLabel")}</span>
                                <span className="font-medium text-emerald-500">{formatBytes(c.up)}</span>
                              </div>
                              <div className="flex justify-between items-center bg-zinc-50 dark:bg-zinc-950 p-2 rounded border border-zinc-200 dark:border-zinc-800">
                                <span className="text-zinc-600 dark:text-zinc-400">{t("clients.downloadLabel")}</span>
                                <span className="font-medium text-blue-500">{formatBytes(c.down)}</span>
                              </div>
                            </div>
                            <div className="space-y-1 lg:col-span-2">
                               <div className="text-xs text-zinc-500 uppercase font-semibold">{t("clients.subscriptionLinks")}</div>
                               
                               <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-950 p-2 rounded border border-zinc-200 dark:border-zinc-800">
                                 <span className="text-zinc-500 w-[70px] whitespace-nowrap">{t("clients.systemSub")}</span>
                                 <a 
                                   href={typeof window !== 'undefined' ? `${window.location.origin}/s/${c.subId || c.email}` : '#'} 
                                   target="_blank" 
                                   className="font-mono text-xs text-blue-500 hover:underline truncate flex-1 block"
                                   onClick={(e) => e.stopPropagation()}
                                 >
                                   {typeof window !== 'undefined' ? `${window.location.origin}/s/${c.subId || c.email}` : ''}
                                 </a>
                               </div>
                               
                               {c.inbound?.panel?.url && (
                                 <div className="flex items-center gap-2 bg-zinc-50 dark:bg-zinc-950 p-2 rounded border border-zinc-200 dark:border-zinc-800">
                                   <span className="text-zinc-500 w-[70px] whitespace-nowrap">{t("clients.panelSub")}</span>
                                   {(() => {
                                     const sub = encodeURIComponent(c.subId || c.email || '');
                                     let link = '';
                                     if (c.inbound.panel.subUrl) {
                                       const base = c.inbound.panel.subUrl.endsWith('/') ? c.inbound.panel.subUrl : `${c.inbound.panel.subUrl}/`;
                                       link = `${base}${sub}`;
                                     } else {
                                       try {
                                         const parsed = new URL(c.inbound.panel.url);
                                         link = `${parsed.origin}/sub/${sub}`;
                                       } catch {
                                         const base = c.inbound.panel.url.endsWith('/') ? c.inbound.panel.url : `${c.inbound.panel.url}/`;
                                         link = `${base}sub/${sub}`;
                                       }
                                     }
                                     return (
                                       <a 
                                         href={link} 
                                         target="_blank" 
                                         className="font-mono text-xs text-blue-500 hover:underline truncate flex-1 block"
                                         onClick={(e) => e.stopPropagation()}
                                       >
                                         {link}
                                       </a>
                                     );
                                   })()}
                                 </div>
                               )}
                           </div>
                           </div>
                        </td>
                      </motion.tr>
                    )}
                  </AnimatePresence>
                );
              })}
              {clients.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-zinc-500">
                    {t("clients.noClientsFound")}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalItems > 0 && (
          <div className="flex flex-col items-center justify-between gap-4 border-t border-zinc-200 dark:border-zinc-800 p-4 sm:flex-row bg-white dark:bg-zinc-900/10">
            <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
              <span>{t("common.show")}</span>
              <select
                value={limit}
                onChange={(e) => {
                  setLimit(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded-md border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-2 py-1 text-zinc-600 dark:text-zinc-300 outline-none"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
                <option value={100}>100</option>
              </select>
              <span>{t("common.perPage")}</span>
              <span className="ms-4">
                {t("common.paginationClients", {
                  from: (page - 1) * limit + 1,
                  to: Math.min(page * limit, totalItems),
                  total: totalItems,
                })}
              </span>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40"
              >
                {t("common.previous")}
              </button>
              <span className="text-xs text-zinc-500 dark:text-zinc-400 px-2">
                {t("common.pageOf", { page, total: totalPages || 1 })}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 disabled:opacity-40"
              >
                {t("common.next")}
              </button>
            </div>
          </div>
        )}
      </Card>

      {/* Floating Bulk Actions Bar (Responsive) */}
      <AnimatePresence>
        {selectedCount > 0 && (
          <motion.div
            initial={{ y: 50, x: "-50%", opacity: 0 }}
            animate={{ y: 0, x: "-50%", opacity: 1 }}
            exit={{ y: 50, x: "-50%", opacity: 0 }}
            className="fixed bottom-6 left-1/2 z-40 w-max max-w-[95vw] px-4"
          >
            <div className="flex items-center justify-between gap-4 rounded-full border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/90 px-6 py-3 shadow-2xl backdrop-blur-md">
              <button 
                onClick={() => setSelectedClients({})}
                className="flex items-center gap-3 shrink-0 group cursor-pointer hover:opacity-80 transition-opacity outline-none"
                title={t("clients.clearSelection")}
              >
                <div className="relative flex h-5 w-5 items-center justify-center rounded-full bg-blue-500 overflow-hidden">
                  <span className="absolute inset-0 flex items-center justify-center transition-transform duration-200 group-hover:-translate-y-full text-[11px] font-bold text-white">
                    {selectedCount}
                  </span>
                  <span className="absolute inset-0 flex items-center justify-center translate-y-full transition-transform duration-200 group-hover:translate-y-0 bg-red-500 text-white">
                    <X size={12} strokeWidth={3} />
                  </span>
                </div>
                <span className="text-xs font-medium text-zinc-600 dark:text-zinc-300">{t("clients.selected")}</span>
              </button>

              {/* Desktop Actions */}
              <div className="hidden md:flex items-center gap-1.5 sm:gap-2 overflow-x-auto scrollbar-none py-1">
                <button
                  onClick={() => handleBulkAction("addTraffic")}
                  className="rounded-full border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 whitespace-nowrap"
                >
                  {t("clients.addTraffic")}
                </button>
                <button
                  onClick={() => handleBulkAction("resetTraffic")}
                  className="rounded-full border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 whitespace-nowrap"
                >
                  {t("clients.resetTraffic")}
                </button>
                <button
                  onClick={() => handleBulkAction("addDays")}
                  className="rounded-full border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 whitespace-nowrap"
                >
                  {t("clients.addDays")}
                </button>
                <button
                  onClick={() => handleBulkAction("enable")}
                  className="rounded-full border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 whitespace-nowrap"
                >
                  {t("clients.enable")}
                </button>
                <button
                  onClick={() => handleBulkAction("disable")}
                  className="rounded-full border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 whitespace-nowrap"
                >
                  {t("clients.disable")}
                </button>
                <button
                  onClick={() => handleBulkAction("assignInbounds")}
                  className="rounded-full border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 whitespace-nowrap"
                >
                  {t("clients.inbounds")}
                </button>
                <button
                  onClick={() => handleBulkAction("assignGroup")}
                  className="rounded-full border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 whitespace-nowrap"
                >
                  {t("clients.group")}
                </button>
                <button
                  onClick={() => handleBulkAction("exportSubs")}
                  className="rounded-full border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 whitespace-nowrap"
                >
                  {t("clients.exportSubs")}
                </button>
                <button
                  onClick={() => handleBulkAction("delete")}
                  className="rounded-full border border-red-900/35 bg-red-950/20 px-3 py-1.5 text-xs font-medium text-red-400 hover:bg-red-950/40 whitespace-nowrap"
                >
                  {t("common.delete")}
                </button>
                <button
                  onClick={() => setSelectedClients({})}
                  className="text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 p-1 ms-2 shrink-0"
                  title={t("clients.cancelSelection")}
                >
                  <X size={15} />
                </button>
              </div>

              {/* Mobile Actions (Icons Only) */}
              <div className="md:hidden flex items-center gap-1.5 overflow-x-auto scrollbar-none py-1 w-full justify-end px-2">
                <button
                  onClick={() => handleBulkAction("addTraffic")}
                  className="rounded-full p-2 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  title={t("clients.addTraffic")}
                >
                  <Database size={18} />
                </button>
                <button
                  onClick={() => handleBulkAction("resetTraffic")}
                  className="rounded-full p-2 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  title={t("clients.resetTraffic")}
                >
                  <RotateCcw size={18} />
                </button>
                <button
                  onClick={() => handleBulkAction("addDays")}
                  className="rounded-full p-2 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  title={t("clients.addDays")}
                >
                  <CalendarDays size={18} />
                </button>
                <button
                  onClick={() => handleBulkAction("enable")}
                  className="rounded-full p-2 text-emerald-500 hover:bg-emerald-500/10 transition-colors"
                  title={t("clients.enable")}
                >
                  <Play size={18} />
                </button>
                <button
                  onClick={() => handleBulkAction("disable")}
                  className="rounded-full p-2 text-amber-500 hover:bg-amber-500/10 transition-colors"
                  title={t("clients.disable")}
                >
                  <Square size={18} />
                </button>
                <button
                  onClick={() => handleBulkAction("assignInbounds")}
                  className="rounded-full p-2 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  title={t("clients.assignInbounds")}
                >
                  <Network size={18} />
                </button>
                <button
                  onClick={() => handleBulkAction("assignGroup")}
                  className="rounded-full p-2 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  title={t("clients.assignGroup")}
                >
                  <FolderPlus size={18} />
                </button>
                <button
                  onClick={() => handleBulkAction("exportSubs")}
                  className="rounded-full p-2 text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
                  title={t("clients.exportSubscriptionLinks")}
                >
                  <Download size={18} />
                </button>
                <button
                  onClick={() => handleBulkAction("delete")}
                  className="rounded-full p-2 text-red-500 hover:bg-red-500/10 transition-colors"
                  title={t("common.delete")}
                >
                  <Trash2 size={18} />
                </button>
                <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-800 mx-1"></div>
                <button
                  onClick={() => setSelectedClients({})}
                  className="rounded-full p-2 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
                  title={t("clients.clearSelection")}
                >
                  <X size={18} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Mobile Actions Bottom Sheet Drawer */}
      <AnimatePresence>
        {mobileActionsOpen && (
          <MobileActionsSheet
            onClose={() => setMobileActionsOpen(false)}
            selectedCount={selectedCount}
            onAction={handleBulkAction}
          />
        )}
      </AnimatePresence>

      {/* Add Client Modal */}
      <AnimatePresence>
        {addOpen && (
          <AddClientModal
            inbounds={inboundsList ?? []}
            isLoadingInbounds={isLoadingInbounds}
            panels={panelsList ?? []}
            isSuperAdmin={isSuperAdmin}
            onClose={() => setAddOpen(false)}
            onSaved={(client) => {
              setAddOpen(false);
              setTimeout(() => {
                qc.invalidateQueries({ queryKey: ["clients"] });
                qc.invalidateQueries({ queryKey: ["overview"] });
                qc.invalidateQueries({ queryKey: ["reseller-overview"] });
              }, 1500);
              if (client) {
                setConnectionDetailsClient(client);
              }
            }}
          />
        )}
      </AnimatePresence>

      {/* Bulk Create Clients Modal */}
      <AnimatePresence>
        {bulkCreateOpen && (
          <BulkCreateModal
            inboundsList={inboundsList ?? []}
            onClose={() => setBulkCreateOpen(false)}
          />
        )}
      </AnimatePresence>

      {/* Bulk Group Assign Modal */}
      {groupAssignModalOpen && (
        <BulkGroupAssignModal
          selectedCount={selectedCount}
          onClose={() => setGroupAssignModalOpen(false)}
          onConfirm={(grp) => {
            bulkMutation.mutate({
              ids: selectedIds,
              action: "assignGroup",
              groupName: grp,
            });
          }}
        />
      )}

      {/* Generic Bulk Confirm Modal */}
      {pendingBulkAction && (
        <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-black/60 pt-[10dvh] px-4 sm:pt-0 sm:p-4">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 mb-2">
              {t("clients.confirmBulkTitle", { action: bulkActionLabel(t, pendingBulkAction) })}
            </h3>
            <p className="text-sm text-zinc-500 mb-6">
              {t("clients.confirmBulkHint", { action: bulkActionLabel(t, pendingBulkAction), count: selectedCount })}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPendingBulkAction(null)}
                className="flex-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 py-3 font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-200 dark:hover:bg-zinc-600 transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => {
                  if (pendingBulkAction === "enable" || pendingBulkAction === "disable") {
                    bulkToggleMutation.mutate({ ids: selectedIds, action: pendingBulkAction });
                  } else {
                    bulkMutation.mutate({ ids: selectedIds, action: pendingBulkAction as any });
                  }
                  setPendingBulkAction(null);
                }}
                className="flex-1 rounded-xl bg-blue-600 py-3 font-semibold text-white hover:bg-blue-500 transition-colors"
              >
                {bulkActionLabel(t, pendingBulkAction)}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Assign Inbounds Modal */}
      {assignInboundsModalOpen && (
        <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-black/60 pt-[10dvh] px-4 sm:pt-0 sm:p-4">
          <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden flex flex-col max-h-[80vh]">
            <div className="p-6 pb-4 border-b border-zinc-200 dark:border-zinc-800">
              <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 mb-1">{t("clients.assignInboundsTitle")}</h3>
              <p className="text-sm text-zinc-500">
                {t("clients.assignInboundsHint", { count: selectedCount })}
              </p>
            </div>
            <div className="p-4 overflow-y-auto space-y-2 flex-1">
              {(inboundsList || []).map(inbound => {
                const isSelected = assignInboundIds.includes(inbound.id);
                return (
                  <button
                    key={inbound.id}
                    onClick={() => {
                      if (isSelected) setAssignInboundIds(assignInboundIds.filter(id => id !== inbound.id));
                      else setAssignInboundIds([...assignInboundIds, inbound.id]);
                    }}
                    className={clsx(
                      "w-full text-start p-3 rounded-xl border transition-all flex items-start gap-3",
                      isSelected 
                        ? "border-blue-500 bg-blue-50 dark:bg-blue-500/10" 
                        : "border-zinc-200 dark:border-zinc-800 hover:border-blue-300 dark:hover:border-blue-500/50"
                    )}
                  >
                    <div className={clsx("mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border", isSelected ? "border-blue-500 bg-blue-500" : "border-zinc-300 dark:border-zinc-600")}>
                      {isSelected && <Check size={12} className="text-white" />}
                    </div>
                    <div>
                      <div className="font-medium text-sm text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                        <span>{inbound.remark || inbound.tag}</span>
                        <NodeInboundBadge inbound={inbound} />
                        <span className="text-[10px] uppercase font-bold text-zinc-400 bg-zinc-100 dark:bg-zinc-800 px-1.5 py-0.5 rounded">{inbound.protocol}</span>
                      </div>
                      <div className="text-xs text-zinc-500 mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5">
                        <span>{t("clients.panelInboundLine", { panel: inbound.panel?.name || t("common.unknown"), tag: inbound.tag, port: inbound.port })}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="p-4 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 flex gap-2">
              <button
                onClick={() => {
                  setAssignInboundsModalOpen(false);
                  setAssignInboundIds([]);
                }}
                className="flex-1 rounded-xl bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 py-2.5 font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-200 dark:hover:bg-zinc-600 transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                disabled={assignInboundIds.length === 0}
                onClick={() => {
                  bulkMutation.mutate({ 
                    ids: selectedIds, 
                    action: "assignInbounds" as any, 
                    inboundIds: assignInboundIds,
                  });
                  setAssignInboundsModalOpen(false);
                  setAssignInboundIds([]);
                }}
                className="flex-1 rounded-xl bg-blue-600 py-2.5 font-semibold text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {t("clients.assignInboundsBtn")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Processing Loading Overlay */}
      <AnimatePresence>
        {(bulkMutation.isPending || bulkToggleMutation.isPending || bulkExportMutation.isPending) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[200] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          >
            <div className="bg-white dark:bg-zinc-900 rounded-2xl p-8 flex flex-col items-center shadow-2xl max-w-sm mx-4 text-center border border-zinc-200 dark:border-zinc-800">
              <svg className="animate-spin h-12 w-12 text-blue-600 mb-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <h3 className="text-zinc-900 dark:text-zinc-100 font-semibold text-lg">{t("clients.processingTitle")}</h3>
              <p className="text-zinc-500 dark:text-zinc-400 text-sm mt-2">
                {t("clients.processingHint")}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Client Modal */}
      <AnimatePresence>
        {editing && (
          <EditClientModal
            client={editing}
            inboundsList={inboundsList ?? []}
            onClose={() => setEditing(null)}
            onSaved={() => {
              setEditing(null);
              qc.invalidateQueries({ queryKey: ["clients"] });
              qc.invalidateQueries({ queryKey: ["reseller-overview"] });
              qc.invalidateQueries({ queryKey: ["overview"] });
            }}
          />
        )}
      </AnimatePresence>

      {/* Connection Details Modal */}
      <AnimatePresence>
        {connectionDetailsClient && (
          <ConnectionDetailsModal
            client={connectionDetailsClient}
            portalSettings={adminUser?.portalSettings}
            onClose={() => setConnectionDetailsClient(null)}
          />
        )}
      </AnimatePresence>

      {/* Bulk Result Summary Modal */}
      {bulkResult && (
        <BulkResultModal
          result={bulkResult}
          onClose={() => setBulkResult(null)}
        />
      )}

      {/* Bulk Delete Custom Confirmation Dialog */}
      {deleteConfirmOpen && (
        <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-black/60 pt-[10dvh] px-4 sm:pt-0 sm:p-4">
          <div className="w-full max-w-sm rounded-2xl border border-red-500/20 bg-white dark:bg-zinc-900 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 mb-2">{t("clients.confirmBulkDeleteTitle")}</h3>
            <p className="text-sm text-zinc-500 mb-4">
              {t("clients.confirmBulkDeleteHint")}
            </p>
            <div className="bg-red-500/5 border border-red-500/10 rounded-xl p-3.5 space-y-1.5 text-xs mb-6">
              <div className="flex justify-between">
                <span className="text-zinc-500">{t("clients.clientsSelected")}</span>
                <span className="font-bold text-red-400">{selectedCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-zinc-500">{t("clients.trafficImpact")}</span>
                <span className="font-bold text-zinc-800 dark:text-zinc-200">{formatBytes(totalAllocatedTraffic)}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setDeleteConfirmOpen(false)}
                className="flex-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 py-3 font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-200 dark:hover:bg-zinc-600 transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => {
                  setDeleteConfirmOpen(false);
                  bulkMutation.mutate({ ids: selectedIds, action: "delete" });
                }}
                className="flex-1 rounded-xl bg-red-600 py-3 font-semibold text-white hover:bg-red-500 transition-colors"
              >
                {t("clients.deleteClients")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Reset Traffic Confirmation Dialog */}
      {resetConfirmOpen && (
        <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-black/60 pt-[10dvh] px-4 sm:pt-0 sm:p-4">
          <div className="w-full max-w-sm rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 mb-2">{t("clients.resetTrafficTitle")}</h3>
            <p className="text-sm text-zinc-500 mb-4">
              {t("clients.resetTrafficHint", { count: selectedCount })}
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setResetConfirmOpen(false)}
                className="flex-1 rounded-xl bg-zinc-100 dark:bg-zinc-800 py-3 font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-200 dark:hover:bg-zinc-600 transition-colors"
              >
                {t("common.cancel")}
              </button>
              <button
                onClick={() => {
                  setResetConfirmOpen(false);
                  bulkMutation.mutate({ ids: selectedIds, action: "resetTraffic" });
                }}
                className="flex-1 rounded-xl bg-blue-600 py-3 font-semibold text-white hover:bg-blue-500 transition-colors"
              >
                {t("clients.confirmReset")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk Value Input Modal (Traffic / Days) */}
      {bulkValueModal && (
        <div
          className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-black/60 pt-[10dvh] px-4 sm:pt-0 sm:p-4"
        >
          <div
            className="w-full max-w-sm rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{bulkValueModal.title}</h3>
              <button
                onClick={() => setBulkValueModal(null)}
                className="text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"
              >
                <X size={16} />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm text-zinc-500 dark:text-zinc-400">
                  {bulkValueModal.label}
                </label>
                <input
                  type="number"
                  placeholder={bulkValueModal.placeholder}
                  value={bulkInputValue}
                  onChange={(e) => setBulkInputValue(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500"
                />
                {bulkValueModal.action === "addDays" && (
                  <div className="mt-2 flex gap-2">
                    {[30, 60, 90, 180].map(days => (
                      <button
                        key={days}
                        onClick={() => setBulkInputValue(days.toString())}
                        className="flex-1 rounded-md bg-zinc-100 dark:bg-zinc-800 py-1 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-200 dark:hover:bg-zinc-600 transition-colors"
                      >
                        +{days}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {bulkValueModal.action === "addTraffic" && bulkInputValue && (
                <div className="bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 p-3 rounded-xl space-y-1.5 text-xs">
                  <div className="flex justify-between">
                    <span className="text-zinc-500">{t("clients.totalRequired")}</span>
                    <span className="font-bold text-zinc-700 dark:text-zinc-300">{formatBytes(totalRequired)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-500">{t("clients.remainingBalance")}</span>
                    <span className="font-bold text-zinc-700 dark:text-zinc-300">{formatBytes(availableTraffic)}</span>
                  </div>
                  {trafficMode === 'ALLOCATION' && (
                    <div className="flex justify-between border-t border-zinc-200 dark:border-zinc-800 pt-1 mt-1">
                      <span className="text-zinc-500">{t("clients.balanceAfter")}</span>
                      <span className={`font-bold ${insufficientBalance ? 'text-red-400' : 'text-zinc-700 dark:text-zinc-300'}`}>
                        {insufficientBalance ? t("clients.negativeBalance") : formatBytes(balanceAfter)}
                      </span>
                    </div>
                  )}
                  {insufficientBalance && (
                    <div className="text-[10px] text-red-400 font-semibold bg-red-500/10 p-1.5 rounded mt-1.5 flex items-center gap-1">
                      <AlertTriangle size={12} />
                      {t("clients.insufficientBalance")}
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end gap-2 border-t border-zinc-200 dark:border-zinc-800 pt-4">
                <button
                  onClick={() => setBulkValueModal(null)}
                  className="rounded-lg px-4 py-2 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
                >
                  {t("common.cancel")}
                </button>
                <button
                  onClick={submitBulkValue}
                  disabled={bulkMutation.isPending || (bulkValueModal.action === "addTraffic" && insufficientBalance)}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {bulkMutation.isPending ? t("common.applying") : t("common.confirm")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

interface AddClientForm {
  email: string;
  inboundIds: string[];
  totalGB: string;
  expiryDays: string;
  remark: string;
  flow?: string;
  limitIp?: string;
}

function AddClientModal({
  inbounds,
  isLoadingInbounds,
  panels,
  isSuperAdmin,
  onClose,
  onSaved,
}: {
  inbounds: InboundRow[];
  isLoadingInbounds?: boolean;
  panels?: PanelRow[];
  isSuperAdmin?: boolean;
  onClose: () => void;
  onSaved: (client?: any) => void;
}) {
  const t = useT();
  const toast = useToast((s) => s.push);
  
  const derivedPanels = useMemo(() => {
    if (panels && panels.length > 0) return panels;
    const pMap = new Map();
    inbounds.forEach(i => {
      if (i.panel) pMap.set(i.panel.id, { id: i.panel.id, name: i.panel.name });
    });
    return Array.from(pMap.values());
  }, [panels, inbounds]);

  const [selectedPanelId, setSelectedPanelId] = useState<string>("");
  
  useEffect(() => {
    if (!selectedPanelId && derivedPanels.length > 0) {
      setSelectedPanelId(derivedPanels[0].id);
    }
  }, [derivedPanels, selectedPanelId]);
  
  const availableInbounds = (isSuperAdmin && selectedPanelId)
    ? inbounds.filter(i => i.panel?.id === selectedPanelId || (i as any).panelId === selectedPanelId)
    : inbounds;

  const [form, setForm] = useState<AddClientForm>({
    email: "",
    inboundIds: [],
    totalGB: "",
    expiryDays: "",
    remark: "",
    flow: "",
    limitIp: "",
  });

  useEffect(() => {
    if (availableInbounds.length > 0) {
      // Keep only selected IDs that are still in availableInbounds
      const stillAvailable = form.inboundIds.filter(id => availableInbounds.some(i => i.id === id));
      if (stillAvailable.length === 0) {
        try {
          const cached = JSON.parse(localStorage.getItem("lastSelectedInboundIds") || "[]");
          const validCached = cached.filter((id: string) => availableInbounds.some(i => i.id === id));
          if (validCached.length > 0) {
            setTimeout(() => setForm(f => ({ ...f, inboundIds: validCached })), 0);
          } else {
            setTimeout(() => setForm(f => ({ ...f, inboundIds: [availableInbounds[0].id] })), 0);
          }
        } catch {
          setTimeout(() => setForm(f => ({ ...f, inboundIds: [availableInbounds[0].id] })), 0);
        }
      } else if (stillAvailable.length !== form.inboundIds.length) {
        setTimeout(() => setForm(f => ({ ...f, inboundIds: stillAvailable })), 0);
      }
    }
  }, [availableInbounds, form.inboundIds]);

  const selectedInbounds = inbounds.filter((i) => form.inboundIds.includes(i.id));
  const isReality = selectedInbounds.some((i) => i.protocol === "vless" && i.streamSettings?.security === "reality");
  const [showAdvanced, setShowAdvanced] = useState(false);

  useEffect(() => {
    if (!isReality && form.flow) {
      setForm((f) => ({ ...f, flow: "" }));
      setShowAdvanced(false);
    }
  }, [isReality, form.flow]);

  const [createdClient, setCreatedClient] = useState<any>(null);

  const create = useMutation({
    mutationFn: async () => {
      let totalBytes = 0;
      if (form.totalGB && Number(form.totalGB) > 0) {
        totalBytes = Math.floor(Number(form.totalGB) * 1024 * 1024 * 1024);
      }
      
      let expiryTime = 0;
      if (form.expiryDays && Number(form.expiryDays) > 0) {
        expiryTime = Date.now() + Number(form.expiryDays) * 24 * 60 * 60 * 1000;
      }

      const dto = {
        email: form.email,
        inboundIds: form.inboundIds,
        total: totalBytes,
        expiryTime,
        enable: true,
        remark: form.remark || undefined,
        flow: form.flow || undefined,
        limitIp: form.limitIp ? Number(form.limitIp) : 0,
      };

      const res = await api.post<Client>("/clients", dto);
      return res.data;
    },
    onSuccess: (data) => {
      toast(t("clients.createSuccess"), "success");
      setCreatedClient(data);
    },
    onError: (err: any) => {
      toast(err?.response?.data?.message || t("clients.createFailed"), "error");
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (form.inboundIds.length === 0) {
      toast(t("clients.selectInboundRequired"), "error");
      return;
    }
    create.mutate();
  };

  if (createdClient) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-black/60 pt-[10dvh] px-4 sm:pt-0 sm:p-4"
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: "spring", bounce: 0, duration: 0.4 }}
          className="w-full max-w-sm rounded-2xl border border-emerald-500/20 bg-white dark:bg-zinc-900 p-6 text-center shadow-2xl"
        >
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/10">
            <CheckCircle2 size={32} className="text-emerald-500" />
          </div>
          <h2 className="mb-2 text-xl font-bold text-zinc-900 dark:text-zinc-50">{t("clients.createdTitle")}</h2>
          <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
            {t("clients.createdHint", { email: createdClient.email })}
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => onSaved(createdClient)}
              className="rounded-xl bg-blue-600 px-4 py-3 font-medium text-white hover:bg-blue-500 shadow-lg shadow-blue-500/20 transition-all"
            >
              {t("clients.viewConnectionDetails")}
            </button>
            <button
              onClick={() => onSaved()}
              className="rounded-xl bg-zinc-100 dark:bg-zinc-800 px-4 py-3 font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600 transition-colors"
            >
              {t("common.close")}
            </button>
          </div>
        </motion.div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-black/60 pt-[10dvh] px-4 sm:pt-0 sm:p-4"
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
        className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 max-h-[85dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{t("clients.addClientTitle")}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info Section */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 p-4 space-y-4">
            <h3 className="font-medium text-zinc-700 dark:text-zinc-200 text-sm">{t("clients.basicInfo")}</h3>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">{t("clients.usernameIdentifier")}</label>
              <input
                type="text"
                required
                placeholder={t("clients.usernamePlaceholder")}
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors"
              />
            </div>
            
            {isSuperAdmin && derivedPanels.length > 0 && (
              <div>
                <label className="mb-1 block text-xs text-zinc-500">{t("clients.panelServer")}</label>
                <select
                  value={selectedPanelId}
                  onChange={(e) => setSelectedPanelId(e.target.value)}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors"
                >
                  {derivedPanels.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs text-zinc-500 font-medium">{t("clients.assignedInbounds")}</label>
              <div className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 overflow-hidden">
                <div className="max-h-[160px] overflow-y-auto divide-y divide-zinc-200 dark:divide-zinc-800">
                  {isLoadingInbounds ? (
                    <div className="px-3 py-4 text-center text-sm text-zinc-500">{t("common.loadingInbounds")}</div>
                  ) : availableInbounds.length === 0 ? (
                    <div className="px-3 py-4 text-center text-sm text-zinc-500">{t("common.noInboundsAvailable")}</div>
                  ) : (
                    availableInbounds.map((i) => {
                      const isChecked = form.inboundIds.includes(i.id);
                      return (
                        <label
                          key={i.id}
                          className="flex items-center gap-3 px-3 py-2.5 text-sm text-zinc-800 dark:text-zinc-200 cursor-pointer hover:bg-zinc-50 dark:hover:bg-zinc-800/50 select-none"
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              const nextIds = isChecked
                                ? form.inboundIds.filter(id => id !== i.id)
                                : [...form.inboundIds, i.id];
                              setForm({ ...form, inboundIds: nextIds });
                              localStorage.setItem("lastSelectedInboundIds", JSON.stringify(nextIds));
                            }}
                            className="h-4 w-4 rounded border-zinc-300 dark:border-zinc-700 text-blue-600 focus:ring-blue-500 focus:ring-offset-white dark:focus:ring-offset-zinc-900 bg-transparent"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-center gap-2">
                              <span className="font-semibold text-zinc-800 dark:text-zinc-100 truncate inline-flex items-center gap-1.5 min-w-0">
                                <span className="truncate">{i.remark ? i.remark : i.tag}</span>
                                <NodeInboundBadge inbound={i} />
                              </span>
                              <span className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-500 font-bold shrink-0">
                                {i.protocol} : {i.port}
                              </span>
                            </div>
                            {i.remark && (
                              <div className="text-[10px] text-zinc-400 dark:text-zinc-500 truncate mt-0.5">
                                {t("common.tag")}: {i.tag}
                              </div>
                            )}
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
            

          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Traffic Section */}
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 p-4">
              <h3 className="mb-4 font-medium text-zinc-700 dark:text-zinc-200 text-sm">{t("clients.trafficLimit")}</h3>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">{t("clients.totalGb")}</label>
                <input
                  type="number"
                  min={0}
                  placeholder={t("clients.blankUnlimited")}
                  value={form.totalGB}
                  onChange={(e) => setForm({ ...form, totalGB: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors"
                />
                <p className="mt-1 text-[10px] text-zinc-500 dark:text-zinc-400">{t("clients.allocationDeductHint")}</p>
              </div>
              <div className="mt-4">
                <label className="mb-1 block text-xs text-zinc-500">{t("clients.ipLimit")}</label>
                <input
                  type="number"
                  min={0}
                  placeholder={t("clients.ipLimitPlaceholder")}
                  value={form.limitIp}
                  onChange={(e) => setForm({ ...form, limitIp: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>

            {/* Expiry Section */}
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 p-4">
              <h3 className="mb-4 font-medium text-zinc-700 dark:text-zinc-200 text-sm">{t("clients.duration")}</h3>
              <div>
                <label className="mb-1 block text-xs text-zinc-500">{t("clients.expiryDays")}</label>
                <input
                  type="number"
                  min={0}
                  placeholder={t("clients.blankNever")}
                  value={form.expiryDays}
                  onChange={(e) => setForm({ ...form, expiryDays: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Advanced Settings */}
          {isReality && (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 overflow-hidden transition-all">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex w-full items-center justify-between p-4 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
              >
                <span>{t("clients.advancedSettings")}</span>
                {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {showAdvanced && (
                <div className="p-4 pt-0 border-t border-zinc-200 dark:border-zinc-800/50 mt-1">
                  <label className="mb-1 block text-xs text-zinc-500">{t("clients.flowLabel")}</label>
                  <select
                    value={form.flow || ""}
                    onChange={(e) => setForm({ ...form, flow: e.target.value })}
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors"
                  >
                    <option value="">{t("common.none")}</option>
                    <option value="xtls-rprx-vision">xtls-rprx-vision</option>
                    <option value="xtls-rprx-vision-udp443">xtls-rprx-vision-udp443</option>
                  </select>
                  <p className="mt-1 text-xs text-zinc-500">{t("clients.flowHint")}</p>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-zinc-200 dark:border-zinc-800 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={create.isPending}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {create.isPending ? t("common.creating") : t("common.create")}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

export function EditClientModal({
  client,
  inboundsList,
  onClose,
  onSaved,
}: {
  client: Client;
  inboundsList: InboundRow[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const t = useT();
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);
  const sessionAdmin = useAuth((s) => s.admin);

  const expTime = Number(client.expiryTime);
  const isFirstUse = expTime < 0;
  
  const [trafficMode, setTrafficMode] = useState<"set" | "add" | "remove">("set");
  const [trafficInput, setTrafficInput] = useState("");
  const [expiryMode, setExpiryMode] = useState<"add" | "remove">("add");
  
  const inbound = (client as any).inbound;
  const isReality = inbound?.protocol === "vless" && inbound?.streamSettings?.security === "reality";
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [showInbounds, setShowInbounds] = useState(false);

  // Filter inbounds by the client's current panel
  const clientPanelId = (client as any).inbounds?.[0]?.panelId || inbound?.panelId || (client as any).inbounds?.[0]?.panel?.id || inbound?.panel?.id;
  const availableInbounds = clientPanelId 
    ? inboundsList.filter(i => (i as any).panelId === clientPanelId || i.panel?.id === clientPanelId)
    : inboundsList;

  const [form, setForm] = useState({
    expiryDays: "",
    remark: client.remark || "",
    flow: client.flow || "",
    limitIp: client.limitIp?.toString() || "",
    inboundIds: (client as any).inbounds?.map((i: any) => i.id) || [(client as any).inbound?.id].filter(Boolean),
  });

  const usedTraffic = Number(client.up) + Number(client.down);
  const totalTraffic = Number(client.total);
  const remainingTraffic = totalTraffic > 0 ? Math.max(0, totalTraffic - usedTraffic) : 0;

  const inputNum = Number(trafficInput) || 0;
  const inputBytes = inputNum * 1024 * 1024 * 1024;
  
  let previewTotalBytes = totalTraffic;
  let previewDiffBytes = 0;

  if (trafficInput) {
    if (trafficMode === "set") {
      previewTotalBytes = inputBytes;
      previewDiffBytes = inputBytes - totalTraffic;
    } else if (trafficMode === "add") {
      previewTotalBytes = totalTraffic + inputBytes;
      previewDiffBytes = inputBytes;
    } else if (trafficMode === "remove") {
      previewTotalBytes = Math.max(0, totalTraffic - inputBytes);
      previewDiffBytes = -inputBytes;
    }
  }

  const isTrafficDecrease = previewDiffBytes < 0;

  const update = useMutation({
    mutationFn: async () => {
      let expiryTimestamp = expTime;
      
      if (form.expiryDays) {
        const dayVal = Number(form.expiryDays);
        const addedMs = dayVal * 24 * 60 * 60 * 1000;
        if (isFirstUse) {
           // For first-use, negative expiry encodes duration
           expiryTimestamp = expiryMode === "add" ? expTime - addedMs : expTime + addedMs;
        } else {
           const baseTime = expTime > 0 ? expTime : Date.now();
           expiryTimestamp = expiryMode === "add" ? baseTime + addedMs : baseTime - addedMs;
        }
      }

      const newTotalBytes = trafficInput ? previewTotalBytes : totalTraffic;
      const hasTraffic = newTotalBytes === 0 || usedTraffic < newTotalBytes;
      const newExpiryTime = form.expiryDays ? expiryTimestamp : expTime;
      const hasTime = isFirstUse || newExpiryTime === 0 || newExpiryTime > Date.now();
      
      let enableOverride = undefined;
      if (!client.enable && hasTraffic && hasTime) {
         enableOverride = true;
      }

      return (
        await api.patch(`/clients/${client.id}`, {
          total: trafficInput ? previewTotalBytes : undefined,
          expiryTime: form.expiryDays ? expiryTimestamp : undefined,
          remark: form.remark ?? "",
          flow: isReality && form.flow ? form.flow : undefined,
          inboundIds: form.inboundIds,
          enable: enableOverride,
          limitIp: form.limitIp ? Number(form.limitIp) : 0,
        })
      ).data;
    },
    onSuccess: () => {
      toast(t("clients.updatedSuccess"));
      onSaved();
    },
    onError: (err: any) => {
      const msg = err.response?.data?.message || t("clients.updateFailed");
      toast(Array.isArray(msg) ? msg[0] : msg, "error");
    },
  });

  const resetUsage = useMutation({
    mutationFn: async () => (await api.post("/clients/bulk", { ids: [client.id], action: "resetUsage" })).data,
    onSuccess: () => {
      toast(t("clients.trafficResetSuccess"));
      qc.invalidateQueries({ queryKey: ["clients"] });
      qc.invalidateQueries({ queryKey: ["reseller-overview"] });
      qc.invalidateQueries({ queryKey: ["overview"] });
      onClose();
    },
    onError: () => toast(t("clients.trafficResetFailed"), "error")
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    update.mutate();
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-black/60 pt-[10dvh] px-4 sm:pt-0 sm:p-4"
    >
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ type: "spring", bounce: 0, duration: 0.4 }}
        className="w-full max-w-lg rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 md:p-6 max-h-[85dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">{t("clients.editClientTitle", { email: client.email })}</h2>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Traffic Section */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 p-4">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-medium text-zinc-700 dark:text-zinc-200 text-sm">{t("clients.trafficInfo")}</h3>
              <button
                type="button"
                onClick={() => {
                  if (confirm(t("clients.resetUsageConfirm", { used: formatBytes(usedTraffic) }))) {
                    resetUsage.mutate();
                  }
                }}
                disabled={resetUsage.isPending || usedTraffic === 0}
                className="text-xs text-red-400 hover:text-red-300 bg-red-400/10 hover:bg-red-400/20 px-2 py-1 rounded transition-colors disabled:opacity-50 font-medium"
              >
                {resetUsage.isPending ? t("clients.resetting") : t("clients.resetUsage")}
              </button>
            </div>
            
            <div className="grid grid-cols-3 gap-4 text-sm mb-4">
              <div className="flex flex-col p-2 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <span className="text-blue-400/80 text-xs uppercase tracking-wider font-semibold mb-1">{t("clients.allocated")}</span>
                <span className="font-medium text-blue-400">{totalTraffic > 0 ? formatBytes(totalTraffic) : t("common.unlimited")}</span>
              </div>
              <div className="flex flex-col p-2 rounded-lg bg-orange-500/10 border border-orange-500/20">
                <span className="text-orange-400/80 text-xs uppercase tracking-wider font-semibold mb-1">{t("clients.used")}</span>
                <span className="font-medium text-orange-400">{formatBytes(usedTraffic)}</span>
              </div>
              <div className="flex flex-col p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <span className="text-emerald-400/80 text-xs uppercase tracking-wider font-semibold mb-1">{t("clients.remaining")}</span>
                <span className="font-medium text-emerald-400">{totalTraffic > 0 ? formatBytes(remainingTraffic) : t("common.unlimited")}</span>
              </div>
            </div>

            <div className="space-y-3 pt-3 border-t border-zinc-200 dark:border-zinc-800/50">
              <div className="flex gap-2 p-1 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <button type="button" onClick={() => { setTrafficMode("set"); setTrafficInput(""); }} className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${trafficMode === "set" ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100" : "text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"}`}>{t("clients.setTotal")}</button>
                <button type="button" onClick={() => { setTrafficMode("add"); setTrafficInput(""); }} className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${trafficMode === "add" ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100" : "text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"}`}>{t("clients.addPlus")}</button>
                <button type="button" onClick={() => { setTrafficMode("remove"); setTrafficInput(""); }} className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${trafficMode === "remove" ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100" : "text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"}`}>{t("clients.removeMinus")}</button>
              </div>
              
              <div>
                <input
                  type="number"
                  min={0}
                  step={1}
                  placeholder={trafficMode === "set" ? t("clients.newTotalPlaceholder") : trafficMode === "add" ? t("clients.trafficToAddPlaceholder") : t("clients.trafficToRemovePlaceholder")}
                  value={trafficInput}
                  onChange={(e) => setTrafficInput(e.target.value)}
                  className={`w-full rounded-lg border bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none transition-colors border-zinc-300 dark:border-zinc-700 focus:border-blue-500`}
                />
              </div>

              {trafficInput && (
                <div className={`text-xs px-2 py-1.5 rounded flex justify-between items-center bg-zinc-100 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400`}>
                  <>
                    <span>{t("clients.preview")}</span>
                    <span className="font-medium text-zinc-700 dark:text-zinc-200">
                      {previewDiffBytes > 0
                        ? t("clients.previewAddTraffic", { amount: formatBytes(previewDiffBytes) })
                        : previewDiffBytes < 0
                          ? t("clients.previewReturnTraffic", { amount: formatBytes(Math.abs(previewDiffBytes)) })
                          : t("clients.previewNoChange")}
                    </span>
                  </>
                </div>
              )}

              <div className="mt-4">
                <label className="mb-1 block text-xs text-zinc-500">{t("clients.ipLimit")}</label>
                <input
                  type="number"
                  min={0}
                  placeholder={t("clients.ipLimitPlaceholder")}
                  value={form.limitIp}
                  onChange={(e) => setForm({ ...form, limitIp: e.target.value })}
                  className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Expiry Section */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 p-4">
            <h3 className="mb-3 font-medium text-zinc-700 dark:text-zinc-200 text-sm">{t("clients.expiryInfo")}</h3>
            
            <div className="mb-3 text-sm">
              {isFirstUse ? (
                <div className="flex justify-between items-center bg-blue-500/10 text-blue-400 px-3 py-2 rounded border border-blue-500/20">
                  <span className="font-medium">{t("clients.firstUse")}</span>
                  <span>{t("common.days", { count: Math.abs(expTime) / (24 * 60 * 60 * 1000) })}</span>
                </div>
              ) : expTime > 0 ? (
                <div className="flex justify-between items-center text-zinc-600 dark:text-zinc-300 px-1">
                  <span className="text-zinc-500">{t("clients.expiryRemaining")}</span>
                  <span className="font-medium text-emerald-400">{t("clients.daysRemainingShort", { count: Math.max(0, Math.ceil((expTime - Date.now()) / (24 * 60 * 60 * 1000))) })}</span>
                </div>
              ) : (
                <div className="flex justify-between items-center text-zinc-600 dark:text-zinc-300 px-1">
                  <span className="text-zinc-500">{t("clients.expiryLabel")}</span>
                  <span className="font-medium text-emerald-400">{t("common.unlimited")}</span>
                </div>
              )}
            </div>

            <div className="space-y-3 pt-3 border-t border-zinc-200 dark:border-zinc-800/50">
              <div className="flex gap-2 p-1 bg-white dark:bg-zinc-900 rounded-lg border border-zinc-200 dark:border-zinc-800">
                <button type="button" onClick={() => { setExpiryMode("add"); setForm({ ...form, expiryDays: "" }); }} className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${expiryMode === "add" ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100" : "text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"}`}>{t("clients.addDaysPlus")}</button>
                <button type="button" onClick={() => { setExpiryMode("remove"); setForm({ ...form, expiryDays: "" }); }} className={`flex-1 text-xs py-1.5 rounded-md transition-colors ${expiryMode === "remove" ? "bg-zinc-100 dark:bg-zinc-800 text-zinc-800 dark:text-zinc-100" : "text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300"}`}>{t("clients.removeDaysMinus")}</button>
              </div>

              <div className="flex gap-2">
                {[30, 60, 90].map((days) => (
                  <button
                    key={days}
                    type="button"
                    onClick={() => setForm({ ...form, expiryDays: days.toString() })}
                    className="flex-1 py-1.5 rounded-md bg-zinc-100 dark:bg-zinc-800 text-xs text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-600 hover:text-white transition-colors"
                  >
                    {expiryMode === "add" ? "+" : "-"}{days}
                  </button>
                ))}
              </div>
              <input
                type="number"
                min={0}
                placeholder={expiryMode === "add" ? t("clients.daysToAdd") : t("clients.daysToRemove")}
                value={form.expiryDays}
                onChange={(e) => setForm({ ...form, expiryDays: e.target.value })}
                className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors"
              />
              {form.expiryDays && (
                <div className={`text-xs px-2 py-1.5 rounded flex justify-between items-center ${expiryMode === "remove" ? "bg-amber-500/10 text-amber-500" : "bg-zinc-100 dark:bg-zinc-800/50 text-zinc-500 dark:text-zinc-400"}`}>
                  <span>{t("clients.preview")}</span>
                  <span className="font-medium">{expiryMode === "add" ? t("clients.previewDaysAdd", { days: form.expiryDays }) : t("clients.previewDaysRemove", { days: form.expiryDays })}</span>
                </div>
              )}
            </div>
          </div>

          {/* Advanced Settings */}
          {isReality && (
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 overflow-hidden transition-all">
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex w-full items-center justify-between p-4 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
              >
                <span>{t("clients.advancedSettings")}</span>
                {showAdvanced ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
              </button>
              {showAdvanced && (
                <div className="p-4 pt-0 border-t border-zinc-200 dark:border-zinc-800/50 mt-1">
                  <label className="mb-1 block text-xs text-zinc-500">{t("clients.flowLabel")}</label>
                  <select
                    value={form.flow || ""}
                    onChange={(e) => setForm({ ...form, flow: e.target.value })}
                    className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500 transition-colors"
                  >
                    <option value="">{t("common.none")}</option>
                    <option value="xtls-rprx-vision">xtls-rprx-vision</option>
                    <option value="xtls-rprx-vision-udp443">xtls-rprx-vision-udp443</option>
                  </select>
                  <p className="mt-1 text-xs text-zinc-500">{t("clients.flowHint")}</p>
                </div>
              )}
            </div>
          )}



          {/* Inbounds Selection */}
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950/50 overflow-hidden transition-all">
            <button
              type="button"
              onClick={() => setShowInbounds(!showInbounds)}
              className="flex w-full items-center justify-between p-4 text-sm font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-900/50"
            >
              <span>{t("clients.assignedInboundsCount", { count: form.inboundIds.length })}</span>
              {showInbounds ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
            {showInbounds && (
              <div className="p-4 pt-0 border-t border-zinc-200 dark:border-zinc-800/50 mt-1">
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {availableInbounds.map((i) => (
                    <label key={i.id} className="flex items-center justify-between gap-2 text-xs text-zinc-600 dark:text-zinc-300 hover:text-zinc-800 dark:hover:text-zinc-100 cursor-pointer p-2 rounded hover:bg-zinc-100 dark:hover:bg-zinc-800/80 transition-colors">
                      <div className="flex items-center gap-3">
                        <input type="checkbox" checked={form.inboundIds.includes(i.id)} onChange={(e) => {
                          const inb = e.target.checked ? [...form.inboundIds, i.id] : form.inboundIds.filter((x: string) => x !== i.id);
                          setForm({ ...form, inboundIds: inb });
                        }} className="rounded border-zinc-600 bg-white dark:bg-zinc-900 text-blue-500 focus:ring-0 focus:ring-offset-0" />
                        <span className="font-medium text-sm">{i.tag}</span>
                      </div>
                      <span className="text-xs bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded text-zinc-500 dark:text-zinc-400 font-mono">{i.protocol}:{i.port}</span>
                    </label>
                  ))}
                </div>
                {form.inboundIds.length === 0 && (
                  <p className="mt-2 text-xs text-red-500">{t("clients.selectInboundError")}</p>
                )}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-zinc-200 dark:border-zinc-800 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-zinc-500 dark:text-zinc-400 hover:text-zinc-700 dark:hover:text-zinc-200"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              disabled={update.isPending || form.inboundIds.length === 0}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {update.isPending ? t("common.saving") : t("common.saveChanges")}
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

function BulkResultModal({
  result,
  onClose,
}: {
  result: { success: number; failed: number; errors: string[]; action: string };
  onClose: () => void;
}) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-black/60 pt-[10dvh] px-4 sm:pt-0 sm:p-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-2xl">
        <h3 className="text-lg font-bold text-zinc-900 dark:text-zinc-50 mb-2">{t("clients.bulkResultTitle")}</h3>
        <p className="text-sm text-zinc-500 mb-4">{t("clients.bulkResultAction", { action: bulkActionLabel(t, result.action) })}</p>
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-center">
            <div className="text-xs text-zinc-500">{t("common.successCount")}</div>
            <div className="text-2xl font-bold text-emerald-500">{result.success}</div>
          </div>
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-center">
            <div className="text-xs text-zinc-500">{t("common.failedCount")}</div>
            <div className="text-2xl font-bold text-red-500">{result.failed}</div>
          </div>
        </div>
        {result.errors.length > 0 && (
          <div className="mb-4">
            <label className="text-xs font-semibold text-zinc-500 uppercase">{t("common.errors")}:</label>
            <div className="mt-1 max-h-40 overflow-y-auto border border-zinc-200 dark:border-zinc-800 rounded-lg p-2 bg-zinc-50 dark:bg-zinc-950 font-mono text-xs text-red-400 space-y-1">
              {result.errors.map((e, idx) => (
                <div key={idx}>{e}</div>
              ))}
            </div>
          </div>
        )}
        <button
          onClick={onClose}
          className="w-full rounded-xl bg-zinc-100 dark:bg-zinc-800 py-3 font-medium text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-200 dark:hover:bg-zinc-600 transition-colors"
        >
          {t("common.close")}
        </button>
      </div>
    </div>
  );
}

function BulkGroupAssignModal({
  selectedCount,
  onClose,
  onConfirm,
}: {
  selectedCount: number;
  onClose: () => void;
  onConfirm: (groupName: string) => void;
}) {
  const t = useT();
  const [groupName, setGroupName] = useState("");
  const { data: groups } = useQuery<string[]>({
    queryKey: ["xui-groups"],
    queryFn: async () => (await api.get<string[]>("/clients/groups")).data,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupName.trim()) return;
    onConfirm(groupName.trim());
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-start sm:items-center justify-center bg-black/60 pt-[10dvh] px-4 sm:pt-0 sm:p-4">
      <div className="w-full max-w-sm rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-base font-semibold text-zinc-900 dark:text-zinc-50">{t("clients.assignGroupTitle")}</h3>
          <button onClick={onClose} className="text-zinc-500 hover:text-zinc-65535"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-sm text-zinc-500">{t("clients.assignGroupHint", { count: selectedCount })}</p>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">{t("clients.groupName")}</label>
            <input
              type="text"
              list="xui-existing-groups"
              required
              placeholder={t("clients.groupNamePlaceholder")}
              value={groupName}
              onChange={(e) => setGroupName(e.target.value)}
              className="w-full rounded-lg border border-zinc-300 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-800 dark:text-zinc-100 outline-none focus:border-blue-500"
            />
            <datalist id="xui-existing-groups">
              {groups?.map((g) => (
                <option key={g} value={g} />
              ))}
            </datalist>
            <p className="mt-1 text-[10px] text-zinc-500">{t("clients.assignGroupAutoCreateHint")}</p>
          </div>

          <div className="flex justify-end gap-2 border-t border-zinc-200 dark:border-zinc-800 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm text-zinc-500 hover:text-zinc-700"
            >
              {t("common.cancel")}
            </button>
            <button
              type="submit"
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
            >
              {t("clients.assignGroup")}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function MobileActionsSheet({
  onClose,
  selectedCount,
  onAction,
}: {
  onClose: () => void;
  selectedCount: number;
  onAction: (action: string) => void;
}) {
  const t = useT();
  const mobileActions = useMemo(
    () => [
      { id: "addTraffic", label: t("clients.addTraffic"), icon: HardDrive },
      { id: "addDays", label: t("clients.addDays"), icon: CalendarDays },
      { id: "enable", label: t("clients.enable"), icon: Play },
      { id: "disable", label: t("clients.disable"), icon: Square },
      { id: "exportSubs", label: t("clients.exportSubscriptionLinks"), icon: Download },
      { id: "assignGroup", label: t("clients.assignGroup"), icon: Users },
      { id: "resetTraffic", label: t("clients.resetTrafficTitle"), icon: RotateCcw },
      { id: "delete", label: t("clients.deleteClients"), icon: Trash2, danger: true },
    ],
    [t],
  );

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-start justify-center bg-black/60 md:hidden pt-[10dvh] px-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "-100%" }}
        animate={{ y: 0 }}
        exit={{ y: "-100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 250 }}
        className="w-full rounded-2xl bg-white dark:bg-zinc-900 p-6 space-y-4 max-h-[85dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex justify-between items-center pb-2 border-b border-zinc-200 dark:border-zinc-800">
          <span className="font-bold text-zinc-800 dark:text-zinc-200">{selectedCount} {t("clients.selected")}</span>
          <button onClick={onClose} className="text-zinc-500 p-1"><X size={18} /></button>
        </div>

        <div className="grid grid-cols-1 gap-2">
          {mobileActions.map((a) => (
            <button
              key={a.id}
              onClick={() => {
                onClose();
                onAction(a.id);
              }}
              className={`flex w-full items-center gap-3 rounded-xl p-3.5 text-sm font-medium transition-colors ${
                a.danger
                  ? "text-red-400 bg-red-500/5 border border-red-500/10 hover:bg-red-500/10"
                  : "text-zinc-700 dark:text-zinc-200 hover:bg-zinc-100 dark:hover:bg-zinc-800"
              }`}
            >
              <a.icon size={16} />
              {a.label}
            </button>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
