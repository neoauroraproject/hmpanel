"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownRight,
  ArrowUpRight,
  Search,
  ChevronLeft,
  ChevronRight,
  Activity,
  Database,
  Network,
  Gauge,
  ScrollText,
  Trash2,
  CheckSquare,
  Square,
} from "lucide-react";
import { api } from "@/lib/api";
import type { Admin, Paginated, Transaction } from "@/lib/types";
import { formatBytes, formatDateTime } from "@/lib/format";
import { Card, PageHeader, Badge, Spinner, ErrorBox } from "@/components/ui";
import { useAuth } from "@/store/auth";
import { useLocale, useT } from "@/i18n";
import { useToast } from "@/components/toast";

type LedgerQuota = {
  quotaMode: string;
  unlimitedTraffic: boolean;
  availableTraffic: number;
  usedTraffic: number;
  allTimeTraffic: number;
  sharedRemaining?: boolean;
};

type LedgerResponse = Paginated<Transaction> & {
  totals: {
    credit: string;
    debit: string;
  };
  quota?: LedgerQuota;
};

type LedgerDestination = {
  id: string;
  name: string;
  panelType: string;
  remainingBytes: number | null;
  usedBytes?: number | null;
  totalBytes?: number | null;
};

type ActionLogRow = {
  id: string;
  action: string;
  entityId: string | null;
  createdAt: string;
  actor: { id: string; username: string } | null;
  clientEmail: string | null;
  details: Record<string, unknown>;
};

type ActionLogResponse = {
  data: ActionLogRow[];
  total: number;
  page: number;
  limit: number;
};

function panelTypeLabel(
  type: string | null | undefined,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  if (type === "eylan") return t("panels.typeEylan");
  if (type === "pasarguard") return t("panels.typePasarguard");
  return t("panels.typeXui");
}

function txTypeLabel(
  type: string,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  if (type === "CREDIT") return t("traffic.typeCredit");
  if (type === "DEBIT") return t("traffic.typeDebit");
  if (type === "USAGE_CHARGE") return t("traffic.typeUsage");
  return type;
}

function actionLabel(
  action: string,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  switch (action) {
    case "CLIENT_CREATED":
      return t("traffic.actionCreated");
    case "CLIENT_UPDATED":
      return t("traffic.actionUpdated");
    case "CLIENT_DELETED":
      return t("traffic.actionDeleted");
    case "CLIENT_CLEANUP":
      return t("traffic.actionCleanup");
    case "CLIENT_ASSIGNED_ADMIN":
      return t("traffic.actionAssigned");
    case "BULK_CLIENT_CREATED":
      return t("traffic.actionBulkCreated");
    case "BULK_ASSIGNADMIN":
      return t("traffic.actionBulkAssigned");
    default:
      return action;
  }
}

function actionTone(action: string): "green" | "amber" | "purple" | "red" | "blue" {
  if (action.includes("CREATED") || action.includes("ASSIGN")) return "green";
  if (action.includes("DELETED") || action.includes("CLEANUP")) return "red";
  if (action.includes("UPDATED")) return "amber";
  return "blue";
}

type ActionChange = { field: string; from: unknown; to: unknown };

function fieldLabel(
  field: string,
  t: (key: string, params?: Record<string, string | number>) => string,
) {
  const map: Record<string, string> = {
    email: "traffic.fieldEmail",
    enable: "traffic.fieldEnable",
    total: "traffic.fieldTotal",
    expiryTime: "traffic.fieldExpiryTime",
    remark: "traffic.fieldRemark",
    limitIp: "traffic.fieldLimitIp",
    flow: "traffic.fieldFlow",
    subId: "traffic.fieldSubId",
    inbounds: "traffic.fieldInbounds",
  };
  return map[field] ? t(map[field]) : field;
}

function formatChangeValue(
  field: string,
  value: unknown,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  if (value == null || value === "") return "—";
  if (field === "enable") {
    return value ? t("traffic.enabled") : t("traffic.disabled");
  }
  if (field === "total") {
    const n = Number(value);
    return Number.isFinite(n) ? formatBytes(n) : String(value);
  }
  if (field === "expiryTime") {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) return "—";
    return formatDateTime(n);
  }
  if (field === "inbounds" && typeof value === "object") {
    const rec = value as { added?: string[]; removed?: string[] };
    const parts: string[] = [];
    if (rec.added?.length) parts.push(`${t("traffic.inboundsAdded")}: ${rec.added.length}`);
    if (rec.removed?.length) parts.push(`${t("traffic.inboundsRemoved")}: ${rec.removed.length}`);
    return parts.join(" · ") || "—";
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function getActionChanges(details: Record<string, unknown>): ActionChange[] {
  const raw = details.changes;
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (c): c is ActionChange =>
      !!c && typeof c === "object" && typeof (c as ActionChange).field === "string",
  );
}

function actionSummary(
  row: ActionLogRow,
  t: (key: string, params?: Record<string, string | number>) => string,
): string {
  const details = row.details || {};
  const changes = getActionChanges(details);
  if (changes.length) {
    return changes.map((c) => fieldLabel(c.field, t)).join(" · ");
  }
  if (row.action === "CLIENT_ASSIGNED_ADMIN") {
    const from = details.fromAdminUsername ? String(details.fromAdminUsername) : "—";
    const to = details.toAdminUsername ? String(details.toAdminUsername) : "—";
    return `${from} → ${to}`;
  }
  if (row.action === "CLIENT_DELETED" || row.action === "CLIENT_CLEANUP") {
    return t("traffic.actionDeleted");
  }
  if (row.action === "CLIENT_CREATED" && Array.isArray(details.panelsProvisioned)) {
    return `${t("traffic.createdOnPanels")}: ${details.panelsProvisioned.length}`;
  }
  if (row.action === "BULK_CLIENT_CREATED" && details.count != null) {
    return String(details.count);
  }
  return "—";
}

const ACTION_FILTERS = [
  { value: "", labelKey: "traffic.actionFilterAll" },
  { value: "CLIENT_CREATED", labelKey: "traffic.actionFilterCreated" },
  { value: "CLIENT_UPDATED", labelKey: "traffic.actionFilterUpdated" },
  { value: "CLIENT_DELETED", labelKey: "traffic.actionFilterDeleted" },
  { value: "CLIENT_ASSIGNED_ADMIN", labelKey: "traffic.actionFilterAssigned" },
  { value: "BULK_CLIENT_CREATED", labelKey: "traffic.actionFilterBulk" },
] as const;

const TRAFFIC_PANEL_TAB_KEY = "hmpanel.traffic.panelId";

function storageKey(adminId: string) {
  return `${TRAFFIC_PANEL_TAB_KEY}:${adminId}`;
}

function readStoredPanelTab(adminId: string) {
  if (typeof window === "undefined" || !adminId) return "";
  try {
    return sessionStorage.getItem(storageKey(adminId)) || "";
  } catch {
    return "";
  }
}

function writeStoredPanelTab(adminId: string, id: string) {
  try {
    if (adminId && id) sessionStorage.setItem(storageKey(adminId), id);
  } catch {
    /* ignore */
  }
}

export default function TrafficPage() {
  const t = useT();
  const { dir } = useLocale();
  const PrevIcon = dir === "rtl" ? ChevronRight : ChevronLeft;
  const NextIcon = dir === "rtl" ? ChevronLeft : ChevronRight;
  const admin = useAuth((s) => s.admin);
  const isSuper = admin?.role === "SUPER_ADMIN";
  const qc = useQueryClient();
  const toast = useToast((s) => s.push);
  const [adminId, setAdminId] = useState<string>("");
  const [panelId, setPanelId] = useState<string>("");
  const [viewTab, setViewTab] = useState<"ledger" | "actions">("ledger");
  const [expandedActionId, setExpandedActionId] = useState<string | null>(null);
  const [selectedLogIds, setSelectedLogIds] = useState<Record<string, boolean>>({});
  const [actionFilter, setActionFilter] = useState("");

  const [page, setPage] = useState(1);
  const [type, setType] = useState<string>("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const selectedAdminId = isSuper ? adminId : admin?.id || "";

  const adminsQuery = useQuery({
    queryKey: ["admins-mini"],
    queryFn: async () => (await api.get<Paginated<Admin>>("/admins?limit=100")).data,
    enabled: isSuper,
  });

  const destPath = isSuper
    ? adminId
      ? `/traffic/destinations/${adminId}`
      : null
    : "/traffic/destinations";

  const destQuery = useQuery({
    queryKey: ["traffic-destinations", destPath],
    queryFn: async () =>
      (await api.get<{ destinations: LedgerDestination[] }>(destPath!)).data,
    enabled: !!destPath,
  });

  const destinations = destQuery.data?.destinations ?? [];

  useEffect(() => {
    if (!selectedAdminId || destQuery.isLoading) return;
    const dests = destQuery.data?.destinations;
    if (!dests?.length) {
      setPanelId((current) => (current ? "" : current));
      return;
    }
    const stored = readStoredPanelTab(selectedAdminId);
    if (stored && dests.some((d) => d.id === stored)) {
      setPanelId((current) => (current === stored ? current : stored));
      return;
    }
    const next = dests[0].id;
    setPanelId((current) => {
      if (current && dests.some((d) => d.id === current)) return current;
      writeStoredPanelTab(selectedAdminId, next);
      return next;
    });
  }, [selectedAdminId, destQuery.data, destQuery.isLoading]);

  const basePath = isSuper ? (adminId ? `/traffic/ledger/${adminId}` : null) : "/traffic/ledger";
  const actionsPath = isSuper
    ? adminId
      ? `/traffic/actions/${adminId}`
      : null
    : "/traffic/actions";

  const queryParams = new URLSearchParams({
    page: page.toString(),
    limit: "15",
    ...(type ? { type } : {}),
    ...(search ? { search } : {}),
    ...(panelId ? { panelId } : {}),
  }).toString();

  const actionsParams = new URLSearchParams({
    page: page.toString(),
    limit: "15",
    ...(search ? { search } : {}),
    ...(actionFilter ? { action: actionFilter } : {}),
  }).toString();

  const ledger = useQuery({
    queryKey: ["ledger", basePath, queryParams],
    queryFn: async () => (await api.get<LedgerResponse>(`${basePath}?${queryParams}`)).data,
    enabled:
      viewTab === "ledger" &&
      !!basePath &&
      !destQuery.isLoading &&
      (destinations.length === 0 || !!panelId),
  });

  const actions = useQuery({
    queryKey: ["traffic-actions", actionsPath, actionsParams],
    queryFn: async () =>
      (await api.get<ActionLogResponse>(`${actionsPath}?${actionsParams}`)).data,
    enabled: viewTab === "actions" && !!actionsPath,
  });

  const purgePath = isSuper
    ? adminId
      ? `/traffic/actions/${adminId}/purge`
      : null
    : "/traffic/actions/purge";

  const purgeMutation = useMutation({
    mutationFn: async (body: {
      ids?: string[];
      actions?: string[];
      search?: string;
      all?: boolean;
    }) => (await api.post<{ deleted: number }>(purgePath!, body)).data,
    onSuccess: (res) => {
      toast(t("traffic.deleteLogsDone", { count: res.deleted }), "success");
      setSelectedLogIds({});
      setExpandedActionId(null);
      qc.invalidateQueries({ queryKey: ["traffic-actions"] });
    },
    onError: (err: any) => {
      toast(err.response?.data?.message || t("traffic.deleteLogsFailed"), "error");
    },
  });

  const pageLogIds = useMemo(
    () => (actions.data?.data ?? []).map((r) => r.id),
    [actions.data?.data],
  );
  const selectedCount = pageLogIds.filter((id) => selectedLogIds[id]).length;
  const allPageSelected =
    pageLogIds.length > 0 && pageLogIds.every((id) => selectedLogIds[id]);

  const resellers = (adminsQuery.data?.data ?? []).filter(
    (a) => a.role === "RESELLER" && a.status === "active",
  );
  const activeTotal = viewTab === "actions" ? actions.data?.total || 0 : ledger.data?.total || 0;
  const totalPages = Math.ceil(activeTotal / 15) || 1;
  const quota = ledger.data?.quota;
  const remainingBytes =
    quota?.unlimitedTraffic
      ? null
      : (quota?.availableTraffic ??
        destinations.find((d) => d.id === panelId)?.remainingBytes);
  const usedBytes = quota?.unlimitedTraffic ? null : quota?.usedTraffic;
  const totalBytes = quota?.unlimitedTraffic ? null : quota?.allTimeTraffic;

  // Unlimited admins land on Action Log once per selected admin.
  const tabInitFor = useRef<string>("");
  useEffect(() => {
    if (!selectedAdminId) return;
    if (tabInitFor.current === selectedAdminId) return;
    const dests = destQuery.data?.destinations;
    if (dests === undefined) return;
    tabInitFor.current = selectedAdminId;
    const allUnlimited =
      dests.length > 0 && dests.every((d) => d.remainingBytes == null);
    setViewTab(allUnlimited ? "actions" : "ledger");
  }, [selectedAdminId, destQuery.data?.destinations]);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  const selectDestination = (id: string) => {
    setPanelId(id);
    setPage(1);
    if (selectedAdminId) writeStoredPanelTab(selectedAdminId, id);
  };

  const switchTab = (tab: "ledger" | "actions") => {
    setViewTab(tab);
    setPage(1);
    setSearch("");
    setSearchInput("");
    setType("");
    setActionFilter("");
    setSelectedLogIds({});
    setExpandedActionId(null);
  };

  const toggleLog = (id: string) => {
    setSelectedLogIds((prev) => {
      const next = { ...prev };
      if (next[id]) delete next[id];
      else next[id] = true;
      return next;
    });
  };

  const toggleAllPageLogs = () => {
    setSelectedLogIds((prev) => {
      if (allPageSelected) {
        const next = { ...prev };
        for (const id of pageLogIds) delete next[id];
        return next;
      }
      const next = { ...prev };
      for (const id of pageLogIds) next[id] = true;
      return next;
    });
  };

  const deleteSelectedLogs = () => {
    const ids = Object.keys(selectedLogIds);
    if (!ids.length || !purgePath) return;
    if (!confirm(t("traffic.deleteLogsConfirmSelected", { count: ids.length }))) return;
    purgeMutation.mutate({ ids });
  };

  const deleteCategoryLogs = () => {
    if (!purgePath) return;
    if (!confirm(t("traffic.deleteLogsConfirmCategory"))) return;
    if (actionFilter) {
      purgeMutation.mutate({
        actions: actionFilter === "CLIENT_DELETED"
          ? ["CLIENT_DELETED", "CLIENT_CLEANUP"]
          : [actionFilter],
        ...(search ? { search } : {}),
      });
      return;
    }
    purgeMutation.mutate({
      all: true,
      ...(search ? { search } : {}),
    });
  };

  const deleteAllLogs = () => {
    if (!purgePath) return;
    if (!confirm(t("traffic.deleteLogsConfirmAll"))) return;
    purgeMutation.mutate({ all: true });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={t("traffic.title")}
        subtitle={t("traffic.subtitle")}
        action={
          isSuper ? (
            <select
              value={adminId}
              onChange={(e) => {
                setAdminId(e.target.value);
                setPage(1);
                setPanelId("");
                tabInitFor.current = "";
              }}
              className="rounded-lg border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200 outline-none focus:border-blue-500"
            >
              <option value="">{t("traffic.selectReseller")}</option>
              {resellers.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.username} ({r.trafficMode})
                </option>
              ))}
            </select>
          ) : undefined
        }
      />

      {isSuper && !adminId ? (
        <Card>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            {t("traffic.pickReseller")}
          </p>
        </Card>
      ) : (
        <>
          <div className="flex gap-2 border-b border-zinc-200 dark:border-zinc-800 pb-px">
            <button
              type="button"
              onClick={() => switchTab("ledger")}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                viewTab === "ledger"
                  ? "border-blue-600 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              <Database size={16} />
              {t("traffic.tabLedger")}
            </button>
            <button
              type="button"
              onClick={() => switchTab("actions")}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${
                viewTab === "actions"
                  ? "border-blue-600 text-blue-600 dark:text-blue-400"
                  : "border-transparent text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300"
              }`}
            >
              <ScrollText size={16} />
              {t("traffic.tabActions")}
            </button>
          </div>

          {viewTab === "ledger" && destinations.length > 0 && (
            <div className="rounded-2xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900/50 p-3">
              <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                <Network size={14} /> {t("traffic.destinations")}
              </div>
              <div className="flex overflow-x-auto hide-scrollbar items-center gap-2">
                {destinations.map((d) => (
                  <button
                    type="button"
                    key={d.id}
                    onClick={() => selectDestination(d.id)}
                    className={`whitespace-nowrap px-4 py-2 rounded-xl text-sm font-semibold transition-colors border inline-flex items-center gap-2 ${
                      panelId === d.id
                        ? "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-500/20 ring-2 ring-blue-500/30"
                        : "bg-zinc-50 dark:bg-zinc-950 text-zinc-600 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-800"
                    }`}
                  >
                    <Database size={14} className={panelId === d.id ? "text-white" : "text-zinc-400"} />
                    <span className="flex flex-col items-start leading-tight">
                      <span>{d.name}</span>
                      <span className={`text-[10px] font-medium ${panelId === d.id ? "text-blue-100" : "text-zinc-400"}`}>
                        {panelTypeLabel(d.panelType, t)}
                        {d.remainingBytes == null
                          ? ` · ${t("traffic.unlimited")}`
                          : ` · ${formatBytes(d.remainingBytes)}`}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {viewTab === "ledger" && ledger.data && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Card>
                <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                  <Gauge size={16} className="text-sky-500" /> {t("traffic.remainingTraffic")}
                </div>
                <div className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                  {remainingBytes == null || quota?.unlimitedTraffic
                    ? t("traffic.unlimited")
                    : formatBytes(remainingBytes)}
                </div>
                {quota?.sharedRemaining && !quota.unlimitedTraffic ? (
                  <p className="mt-1 text-[11px] text-zinc-400">{t("traffic.sharedPoolHint")}</p>
                ) : null}
              </Card>
              <Card>
                <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                  <ArrowDownRight size={16} className="text-amber-500" /> {t("traffic.usedTraffic")}
                </div>
                <div className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                  {usedBytes == null || quota?.unlimitedTraffic
                    ? t("traffic.unlimited")
                    : formatBytes(usedBytes)}
                </div>
              </Card>
              <Card>
                <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                  <Activity size={16} className="text-blue-500" /> {t("traffic.totalToDate")}
                </div>
                <div className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                  {totalBytes == null || quota?.unlimitedTraffic
                    ? t("traffic.unlimited")
                    : formatBytes(totalBytes)}
                </div>
              </Card>
            </div>
          )}

          {viewTab === "actions" && (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              {t("traffic.actionsSubtitle")} · {t("traffic.selectLogsHint")}
            </p>
          )}

          <div className="flex flex-col gap-3 bg-white dark:bg-zinc-900/40 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <div className="flex flex-col sm:flex-row gap-3 justify-between items-stretch sm:items-center">
              <form onSubmit={handleSearch} className="relative w-full sm:w-72">
                <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
                <input
                  type="text"
                  placeholder={
                    viewTab === "actions"
                      ? t("traffic.actionsSearchPlaceholder")
                      : t("traffic.searchPlaceholder")
                  }
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  className="w-full ps-9 pe-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 outline-none focus:border-blue-500 dark:focus:border-blue-500"
                />
              </form>

              {viewTab === "ledger" ? (
                <div className="flex gap-2 w-full sm:w-auto">
                  <select
                    value={type}
                    onChange={(e) => {
                      setType(e.target.value);
                      setPage(1);
                    }}
                    className="w-full sm:w-auto rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200 outline-none focus:border-blue-500"
                  >
                    <option value="">{t("traffic.allTypes")}</option>
                    <option value="CREDIT">{t("traffic.creditsOnly")}</option>
                    <option value="DEBIT">{t("traffic.debitsOnly")}</option>
                    <option value="USAGE_CHARGE">{t("traffic.usageCharges")}</option>
                  </select>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2 w-full sm:w-auto">
                  <select
                    value={actionFilter}
                    onChange={(e) => {
                      setActionFilter(e.target.value);
                      setPage(1);
                      setSelectedLogIds({});
                    }}
                    className="flex-1 sm:flex-none rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200 outline-none focus:border-blue-500"
                  >
                    {ACTION_FILTERS.map((f) => (
                      <option key={f.value || "all"} value={f.value}>
                        {t(f.labelKey)}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            {viewTab === "actions" && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={!selectedCount || purgeMutation.isPending}
                  onClick={deleteSelectedLogs}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40"
                >
                  <Trash2 size={14} />
                  {t("traffic.deleteSelectedLogs")}
                  {selectedCount ? ` (${selectedCount})` : ""}
                </button>
                <button
                  type="button"
                  disabled={purgeMutation.isPending || !(actions.data?.total)}
                  onClick={deleteCategoryLogs}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-1.5 text-xs font-medium text-zinc-700 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-40"
                >
                  <Trash2 size={14} />
                  {t("traffic.deleteCategoryLogs")}
                </button>
                <button
                  type="button"
                  disabled={purgeMutation.isPending || !(actions.data?.total)}
                  onClick={deleteAllLogs}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-1.5 text-xs font-medium text-red-500 hover:bg-red-500/10 disabled:opacity-40"
                >
                  <Trash2 size={14} />
                  {t("traffic.deleteAllLogs")}
                </button>
              </div>
            )}
          </div>

          {viewTab === "ledger" ? (
            ledger.isLoading ? (
              <Spinner />
            ) : ledger.error ? (
              <ErrorBox message={t("traffic.loadFailed")} />
            ) : (
              <Card className="overflow-hidden p-0 bg-transparent md:bg-zinc-50 dark:bg-zinc-950 border-0 md:border md:border-zinc-200 dark:border-zinc-800">
                <div className="min-w-0">
                  <table className="w-full text-sm block md:table">
                    <thead className="hidden md:table-header-group">
                      <tr className="border-b border-zinc-200 dark:border-zinc-800 text-start text-xs uppercase tracking-wide text-zinc-500">
                        <th className="px-4 py-3 font-medium">{t("traffic.colType")}</th>
                        <th className="px-4 py-3 font-medium">{t("traffic.colAmount")}</th>
                        <th className="px-4 py-3 font-medium">{t("traffic.colBalance")}</th>
                        <th className="px-4 py-3 font-medium">{t("traffic.colPanel")}</th>
                        <th className="px-4 py-3 font-medium">{t("traffic.colDescription")}</th>
                        <th className="px-4 py-3 font-medium">{t("traffic.colClient")}</th>
                        <th className="px-4 py-3 font-medium">{t("traffic.colDate")}</th>
                      </tr>
                    </thead>
                    <tbody className="block md:table-row-group space-y-3 md:space-y-0">
                      {(ledger.data?.data ?? []).map((tx) => {
                        const credit = tx.type === "CREDIT";
                        return (
                          <tr
                            key={tx.id}
                            className="block md:table-row bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 md:border-b md:border-x-0 md:border-t-0 md:border-zinc-100 dark:md:border-zinc-800/60 rounded-xl md:rounded-none last:border-b-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                          >
                            <td className="block md:table-cell px-4 py-3">
                              <div className="flex items-center justify-between gap-2 md:block">
                                <Badge tone={credit ? "green" : tx.type === "DEBIT" ? "amber" : "purple"}>
                                  {txTypeLabel(tx.type, t)}
                                </Badge>
                                <span className="md:hidden text-xs text-zinc-500">{formatDateTime(tx.createdAt)}</span>
                              </div>
                            </td>
                            <td className="block md:table-cell px-4 py-2 md:py-3">
                              <div className="md:hidden text-[10px] uppercase text-zinc-500 font-semibold mb-1 tracking-wider">{t("traffic.colAmount")}</div>
                              <span
                                className={`flex items-center gap-1 font-medium ${credit ? "text-emerald-500 dark:text-emerald-400" : "text-amber-500 dark:text-amber-400"}`}
                              >
                                {credit ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                                {formatBytes(tx.amount)}
                              </span>
                            </td>
                            <td className="block md:table-cell px-4 py-2 md:py-3 text-zinc-500 dark:text-zinc-400 text-xs">
                              <div className="md:hidden text-[10px] uppercase text-zinc-500 font-semibold mb-1 tracking-wider">{t("traffic.colBalance")}</div>
                              {tx.balanceBefore != null && tx.balanceAfter != null ? (
                                <div className="flex flex-col">
                                  <span className="text-zinc-400">{formatBytes(tx.balanceBefore)} &rarr;</span>
                                  <span className="font-medium text-zinc-700 dark:text-zinc-200">{formatBytes(tx.balanceAfter)}</span>
                                </div>
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="block md:table-cell px-4 py-2 md:py-3 text-zinc-700 dark:text-zinc-300">
                              <div className="md:hidden text-[10px] uppercase text-zinc-500 font-semibold mb-1 tracking-wider">{t("traffic.colPanel")}</div>
                              {tx.panel?.name ? (
                                <span className="inline-flex flex-col">
                                  <span className="font-medium">{tx.panel.name}</span>
                                  <span className="text-[11px] text-zinc-400">{panelTypeLabel(tx.panel.panelType, t)}</span>
                                </span>
                              ) : (
                                <span className="font-medium text-blue-600 dark:text-blue-400">{t("traffic.globalPoolPanel")}</span>
                              )}
                            </td>
                            <td className="block md:table-cell px-4 py-2 md:py-3 text-zinc-700 dark:text-zinc-300">
                              <div className="md:hidden text-[10px] uppercase text-zinc-500 font-semibold mb-1 tracking-wider">{t("traffic.colDescription")}</div>
                              {tx.description}
                            </td>
                            <td className="block md:table-cell px-4 py-2 md:py-3 text-zinc-500 dark:text-zinc-400">
                              <div className="md:hidden text-[10px] uppercase text-zinc-500 font-semibold mb-1 tracking-wider">{t("traffic.colClient")}</div>
                              {tx.client?.email ?? "—"}
                            </td>
                            <td className="hidden md:table-cell px-4 py-3 text-zinc-500 dark:text-zinc-400">
                              {formatDateTime(tx.createdAt)}
                            </td>
                          </tr>
                        );
                      })}
                      {(ledger.data?.data.length ?? 0) === 0 && (
                        <tr className="block md:table-row">
                          <td colSpan={7} className="block md:table-cell px-4 py-10 text-center text-zinc-500">
                            {t("traffic.noTransactions")}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {ledger.data && ledger.data.total > 0 && (
                  <PaginationBar
                    page={page}
                    totalPages={totalPages}
                    total={ledger.data.total}
                    onPrev={() => setPage((p) => Math.max(1, p - 1))}
                    onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
                    PrevIcon={PrevIcon}
                    NextIcon={NextIcon}
                    t={t}
                  />
                )}
              </Card>
            )
          ) : actions.isLoading ? (
            <Spinner />
          ) : actions.error ? (
            <ErrorBox message={t("traffic.actionsLoadFailed")} />
          ) : (
            <Card className="overflow-hidden p-0 bg-transparent md:bg-zinc-50 dark:bg-zinc-950 border-0 md:border md:border-zinc-200 dark:border-zinc-800">
              <div className="min-w-0">
                <table className="w-full text-sm block md:table">
                  <thead className="hidden md:table-header-group">
                    <tr className="border-b border-zinc-200 dark:border-zinc-800 text-start text-xs uppercase tracking-wide text-zinc-500">
                      <th className="px-3 py-3 font-medium w-10">
                        <button
                          type="button"
                          onClick={toggleAllPageLogs}
                          className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200"
                        >
                          {allPageSelected ? (
                            <CheckSquare size={16} className="text-blue-500" />
                          ) : (
                            <Square size={16} />
                          )}
                        </button>
                      </th>
                      <th className="px-4 py-3 font-medium">{t("traffic.colAction")}</th>
                      <th className="px-4 py-3 font-medium">{t("traffic.colClient")}</th>
                      <th className="px-4 py-3 font-medium">{t("traffic.colActor")}</th>
                      <th className="px-4 py-3 font-medium">{t("traffic.colDescription")}</th>
                      <th className="px-4 py-3 font-medium">{t("traffic.colDate")}</th>
                    </tr>
                  </thead>
                  <tbody className="block md:table-row-group space-y-3 md:space-y-0">
                    {(actions.data?.data ?? []).map((row) => {
                      const details = row.details || {};
                      const changes = getActionChanges(details);
                      const open = expandedActionId === row.id;
                      const checked = !!selectedLogIds[row.id];
                      return (
                        <Fragment key={row.id}>
                          <tr
                            onClick={() =>
                              setExpandedActionId(open ? null : row.id)
                            }
                            className={`block md:table-row bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 md:border-b md:border-x-0 md:border-t-0 md:border-zinc-100 dark:md:border-zinc-800/60 rounded-xl md:rounded-none last:border-b-0 hover:bg-zinc-100 dark:hover:bg-zinc-800/50 transition-colors cursor-pointer ${
                              open ? "bg-white dark:bg-zinc-900/40" : ""
                            }`}
                          >
                            <td
                              className="hidden md:table-cell px-3 py-3"
                              onClick={(e) => {
                                e.stopPropagation();
                                toggleLog(row.id);
                              }}
                            >
                              <button
                                type="button"
                                className="text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-200"
                              >
                                {checked ? (
                                  <CheckSquare size={16} className="text-blue-500" />
                                ) : (
                                  <Square size={16} />
                                )}
                              </button>
                            </td>
                            <td className="block md:table-cell px-4 py-3">
                              <div className="flex items-center justify-between gap-2 md:block">
                                <div className="flex items-center gap-2">
                                  <button
                                    type="button"
                                    className="md:hidden text-zinc-500"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleLog(row.id);
                                    }}
                                  >
                                    {checked ? (
                                      <CheckSquare size={16} className="text-blue-500" />
                                    ) : (
                                      <Square size={16} />
                                    )}
                                  </button>
                                  <Badge tone={actionTone(row.action)}>
                                    {actionLabel(row.action, t)}
                                  </Badge>
                                </div>
                                <span className="md:hidden text-xs text-zinc-500">
                                  {formatDateTime(row.createdAt)}
                                </span>
                              </div>
                            </td>
                            <td className="block md:table-cell px-4 py-2 md:py-3 text-zinc-700 dark:text-zinc-200 font-medium">
                              <div className="md:hidden text-[10px] uppercase text-zinc-500 font-semibold mb-1 tracking-wider">
                                {t("traffic.colClient")}
                              </div>
                              {row.clientEmail ??
                                (typeof details.prefix === "string"
                                  ? `${details.prefix}*`
                                  : "—")}
                            </td>
                            <td className="block md:table-cell px-4 py-2 md:py-3 text-zinc-500 dark:text-zinc-400">
                              <div className="md:hidden text-[10px] uppercase text-zinc-500 font-semibold mb-1 tracking-wider">
                                {t("traffic.colActor")}
                              </div>
                              {row.actor?.username ?? "—"}
                            </td>
                            <td className="block md:table-cell px-4 py-2 md:py-3 text-zinc-500 dark:text-zinc-400 text-xs">
                              <div className="md:hidden text-[10px] uppercase text-zinc-500 font-semibold mb-1 tracking-wider">
                                {t("traffic.colDescription")}
                              </div>
                              {actionSummary(row, t)}
                            </td>
                            <td className="hidden md:table-cell px-4 py-3 text-zinc-500 dark:text-zinc-400">
                              {formatDateTime(row.createdAt)}
                            </td>
                          </tr>
                          {open && (
                            <tr className="block md:table-row bg-zinc-50/80 dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 md:border-b md:border-x-0 md:border-t-0 rounded-xl md:rounded-none">
                              <td
                                colSpan={6}
                                className="block md:table-cell px-4 py-4"
                              >
                                <ActionDetailsPanel
                                  row={row}
                                  changes={changes}
                                  t={t}
                                />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                    {(actions.data?.data.length ?? 0) === 0 && (
                      <tr className="block md:table-row">
                        <td colSpan={6} className="block md:table-cell px-4 py-10 text-center text-zinc-500">
                          {t("traffic.actionsEmpty")}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {actions.data && actions.data.total > 0 && (
                <PaginationBar
                  page={page}
                  totalPages={totalPages}
                  total={actions.data.total}
                  onPrev={() => setPage((p) => Math.max(1, p - 1))}
                  onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
                  PrevIcon={PrevIcon}
                  NextIcon={NextIcon}
                  t={t}
                />
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}

function PaginationBar({
  page,
  totalPages,
  total,
  onPrev,
  onNext,
  PrevIcon,
  NextIcon,
  t,
}: {
  page: number;
  totalPages: number;
  total: number;
  onPrev: () => void;
  onNext: () => void;
  PrevIcon: typeof ChevronLeft;
  NextIcon: typeof ChevronRight;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <div className="flex items-center justify-between border-t border-zinc-200 dark:border-zinc-800 px-4 py-3 sm:px-6">
      <div className="hidden sm:block">
        <p className="text-sm text-zinc-700 dark:text-zinc-300">
          {t("common.paginationResults", {
            from: (page - 1) * 15 + 1,
            to: Math.min(page * 15, total),
            total,
          })}
        </p>
      </div>
      <div className="flex flex-1 justify-between sm:justify-end gap-2">
        <button
          type="button"
          onClick={onPrev}
          disabled={page === 1}
          aria-label={t("common.srPrevious")}
          className="relative inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md px-3 py-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100 ring-1 ring-inset ring-zinc-300 dark:ring-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <PrevIcon size={16} aria-hidden />
        </button>
        <button
          type="button"
          onClick={onNext}
          disabled={page >= totalPages}
          aria-label={t("common.srNext")}
          className="relative inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center rounded-md px-3 py-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100 ring-1 ring-inset ring-zinc-300 dark:ring-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <NextIcon size={16} aria-hidden />
        </button>
      </div>
    </div>
  );
}

function ActionDetailsPanel({
  row,
  changes,
  t,
}: {
  row: ActionLogRow;
  changes: ActionChange[];
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const details = row.details || {};

  if (changes.length > 0) {
    return (
      <div className="space-y-3">
        <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
          {t("traffic.actionDetails")}
        </div>
        <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-zinc-100/80 dark:bg-zinc-800/60 text-xs uppercase tracking-wide text-zinc-500">
                <th className="px-3 py-2 text-start font-medium">{t("traffic.changeField")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("traffic.changeFrom")}</th>
                <th className="px-3 py-2 text-start font-medium">{t("traffic.changeTo")}</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((c) => (
                <tr
                  key={c.field}
                  className="border-t border-zinc-200 dark:border-zinc-800"
                >
                  <td className="px-3 py-2 font-medium text-zinc-700 dark:text-zinc-200">
                    {fieldLabel(c.field, t)}
                  </td>
                  <td className="px-3 py-2 text-zinc-500 dark:text-zinc-400 break-all">
                    {formatChangeValue(c.field, c.from, t)}
                  </td>
                  <td className="px-3 py-2 text-zinc-800 dark:text-zinc-100 break-all font-medium">
                    {formatChangeValue(c.field, c.to, t)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  const metaRows: Array<{ label: string; value: string }> = [];
  if (row.action === "CLIENT_ASSIGNED_ADMIN") {
    metaRows.push({
      label: t("traffic.assignedFromTo"),
      value: `${details.fromAdminUsername ?? "—"} → ${details.toAdminUsername ?? "—"}`,
    });
    if (details.groupName) {
      metaRows.push({
        label: t("traffic.fieldGroup"),
        value: String(details.groupName),
      });
    }
  }
  if (row.action === "CLIENT_DELETED" || row.action === "CLIENT_CLEANUP") {
    if (row.clientEmail || details.clientEmail) {
      metaRows.push({
        label: t("traffic.colClient"),
        value: String(row.clientEmail || details.clientEmail),
      });
    }
  }
  if (row.action === "CLIENT_CREATED" && Array.isArray(details.panelsProvisioned)) {
    metaRows.push({
      label: t("traffic.createdOnPanels"),
      value: String(details.panelsProvisioned.length),
    });
  }
  if (row.action === "BULK_CLIENT_CREATED") {
    if (details.count != null) {
      metaRows.push({ label: t("traffic.actionBulkCreated"), value: String(details.count) });
    }
    if (details.prefix) {
      metaRows.push({ label: t("traffic.fieldEmail"), value: `${details.prefix}*` });
    }
  }
  // Legacy CLIENT_UPDATED: only show allocation when it actually changed.
  if (row.action === "CLIENT_UPDATED") {
    if (
      details.previousAllocation != null &&
      details.newAllocation != null &&
      String(details.previousAllocation) !== String(details.newAllocation)
    ) {
      metaRows.push({
        label: t("traffic.fieldTotal"),
        value: `${formatChangeValue("total", details.previousAllocation, t)} → ${formatChangeValue("total", details.newAllocation, t)}`,
      });
    }
  }

  if (!metaRows.length) {
    return (
      <p className="text-sm text-zinc-500">{t("traffic.actionNoDetails")}</p>
    );
  }

  return (
    <div className="space-y-2">
      <div className="text-xs font-semibold uppercase tracking-wide text-zinc-500">
        {t("traffic.actionDetails")}
      </div>
      <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {metaRows.map((r) => (
          <div
            key={r.label}
            className="rounded-lg border border-zinc-200 dark:border-zinc-800 px-3 py-2"
          >
            <dt className="text-[10px] uppercase tracking-wide text-zinc-500">{r.label}</dt>
            <dd className="mt-0.5 text-sm font-medium text-zinc-800 dark:text-zinc-100 break-all">
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
