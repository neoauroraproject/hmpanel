"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
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
} from "lucide-react";
import { api } from "@/lib/api";
import type { Admin, Paginated, Transaction } from "@/lib/types";
import { formatBytes, formatDateTime } from "@/lib/format";
import { Card, PageHeader, Badge, Spinner, ErrorBox } from "@/components/ui";
import { useAuth } from "@/store/auth";
import { useT } from "@/i18n";

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
  const admin = useAuth((s) => s.admin);
  const isSuper = admin?.role === "SUPER_ADMIN";
  const [adminId, setAdminId] = useState<string>("");
  const [panelId, setPanelId] = useState<string>("");

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

  const queryParams = new URLSearchParams({
    page: page.toString(),
    limit: "15",
    ...(type ? { type } : {}),
    ...(search ? { search } : {}),
    ...(panelId ? { panelId } : {}),
  }).toString();

  const ledger = useQuery({
    queryKey: ["ledger", basePath, queryParams],
    queryFn: async () => (await api.get<LedgerResponse>(`${basePath}?${queryParams}`)).data,
    enabled: !!basePath && !destQuery.isLoading && (destinations.length === 0 || !!panelId),
  });

  const resellers = (adminsQuery.data?.data ?? []).filter(
    (a) => a.role === "RESELLER" && a.status === "active",
  );
  const totalPages = Math.ceil((ledger.data?.total || 0) / 15) || 1;
  const quota = ledger.data?.quota;
  const remainingBytes =
    quota?.unlimitedTraffic
      ? null
      : (quota?.availableTraffic ??
        destinations.find((d) => d.id === panelId)?.remainingBytes);
  const usedBytes = quota?.unlimitedTraffic ? null : quota?.usedTraffic;
  const totalBytes = quota?.unlimitedTraffic ? null : quota?.allTimeTraffic;

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
          {destinations.length > 0 && (
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

          {ledger.data && (
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

          <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white dark:bg-zinc-900/40 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <form onSubmit={handleSearch} className="relative w-full sm:w-64">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
              <input
                type="text"
                placeholder={t("traffic.searchPlaceholder")}
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full ps-9 pe-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 outline-none focus:border-blue-500 dark:focus:border-blue-500"
              />
            </form>
            
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
          </div>

          {ledger.isLoading ? (
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
                              "—"
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
                <div className="flex items-center justify-between border-t border-zinc-200 dark:border-zinc-800 px-4 py-3 sm:px-6">
                  <div className="hidden sm:block">
                    <p className="text-sm text-zinc-700 dark:text-zinc-300">
                      {t("common.paginationResults", {
                        from: (page - 1) * 15 + 1,
                        to: Math.min(page * 15, ledger.data.total),
                        total: ledger.data.total,
                      })}
                    </p>
                  </div>
                  <div className="flex flex-1 justify-between sm:justify-end gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="relative inline-flex items-center rounded-md px-3 py-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100 ring-1 ring-inset ring-zinc-300 dark:ring-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
                    >
                      <ChevronLeft size={16} />
                      <span className="sr-only">{t("common.srPrevious")}</span>
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="relative inline-flex items-center rounded-md px-3 py-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100 ring-1 ring-inset ring-zinc-300 dark:ring-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
                    >
                      <ChevronRight size={16} />
                      <span className="sr-only">{t("common.srNext")}</span>
                    </button>
                  </div>
                </div>
              )}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
