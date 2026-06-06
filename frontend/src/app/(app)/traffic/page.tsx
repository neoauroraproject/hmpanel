"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowDownRight, ArrowUpRight, Search, ChevronLeft, ChevronRight, Activity } from "lucide-react";
import { api } from "@/lib/api";
import type { Admin, Paginated, Transaction } from "@/lib/types";
import { formatBytes, formatDateTime } from "@/lib/format";
import { Card, PageHeader, Badge, Spinner, ErrorBox } from "@/components/ui";
import { useAuth } from "@/store/auth";

type LedgerResponse = Paginated<Transaction> & {
  totals: {
    credit: string;
    debit: string;
  }
};

export default function TrafficPage() {
  const admin = useAuth((s) => s.admin);
  const isSuper = admin?.role === "SUPER_ADMIN";
  const [adminId, setAdminId] = useState<string>("");
  
  const [page, setPage] = useState(1);
  const [type, setType] = useState<string>("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");

  const adminsQuery = useQuery({
    queryKey: ["admins-mini"],
    queryFn: async () => (await api.get<Paginated<Admin>>("/admins?limit=100")).data,
    enabled: isSuper,
  });

  const basePath = isSuper ? (adminId ? `/traffic/ledger/${adminId}` : null) : "/traffic/ledger";
  
  const queryParams = new URLSearchParams({
    page: page.toString(),
    limit: "15",
    ...(type ? { type } : {}),
    ...(search ? { search } : {}),
  }).toString();

  const ledger = useQuery({
    queryKey: ["ledger", basePath, queryParams],
    queryFn: async () => (await api.get<LedgerResponse>(`${basePath}?${queryParams}`)).data,
    enabled: !!basePath,
  });

  const resellers = adminsQuery.data?.data.filter((a) => a.role === "RESELLER") ?? [];
  const totalPages = Math.ceil((ledger.data?.total || 0) / 15) || 1;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSearch(searchInput);
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Traffic Ledger"
        subtitle="Credits (top-ups), debits (provisioning) and usage charges"
        action={
          isSuper ? (
            <select
              value={adminId}
              onChange={(e) => {
                setAdminId(e.target.value);
                setPage(1);
              }}
              className="rounded-lg border border-zinc-300 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2 text-sm text-zinc-700 dark:text-zinc-200 outline-none focus:border-blue-500"
            >
              <option value="">Select a reseller…</option>
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
            Select a reseller above to view their transaction ledger.
          </p>
        </Card>
      ) : (
        <>
          {ledger.data && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Card>
                <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                  <ArrowUpRight size={16} className="text-emerald-500" /> Total Credits
                </div>
                <div className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                  {formatBytes(ledger.data.totals.credit)}
                </div>
              </Card>
              <Card>
                <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                  <ArrowDownRight size={16} className="text-amber-500" /> Total Debits
                </div>
                <div className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                  {formatBytes(ledger.data.totals.debit)}
                </div>
              </Card>
              <Card>
                <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
                  <Activity size={16} className="text-blue-500" /> Net Volume
                </div>
                <div className="mt-2 text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
                  {formatBytes(BigInt(ledger.data.totals.credit) - BigInt(ledger.data.totals.debit))}
                </div>
              </Card>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-4 justify-between items-center bg-white dark:bg-zinc-900/40 p-4 rounded-xl border border-zinc-200 dark:border-zinc-800">
            <form onSubmit={handleSearch} className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" size={16} />
              <input
                type="text"
                placeholder="Search description or client..."
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-sm rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 text-zinc-900 dark:text-zinc-100 outline-none focus:border-blue-500 dark:focus:border-blue-500"
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
                <option value="">All Types</option>
                <option value="CREDIT">Credits Only</option>
                <option value="DEBIT">Debits Only</option>
                <option value="USAGE_CHARGE">Usage Charges</option>
              </select>
            </div>
          </div>

          {ledger.isLoading ? (
            <Spinner />
          ) : ledger.error ? (
            <ErrorBox message="Failed to load ledger" />
          ) : (
            <Card className="overflow-hidden p-0">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-200 dark:border-zinc-800 text-left text-xs uppercase tracking-wide text-zinc-500">
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th className="px-4 py-3 font-medium">Amount</th>
                      <th className="px-4 py-3 font-medium">Description</th>
                      <th className="px-4 py-3 font-medium">Client</th>
                      <th className="px-4 py-3 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(ledger.data?.data ?? []).map((t) => {
                      const credit = t.type === "CREDIT";
                      return (
                        <tr
                          key={t.id}
                          className="border-b border-zinc-100 dark:border-zinc-800/60 last:border-0 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
                        >
                          <td className="px-4 py-3">
                            <Badge tone={credit ? "green" : t.type === "DEBIT" ? "amber" : "purple"}>
                              {t.type}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className={`flex items-center gap-1 font-medium ${credit ? "text-emerald-500 dark:text-emerald-400" : "text-amber-500 dark:text-amber-400"}`}
                            >
                              {credit ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                              {formatBytes(t.amount)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-zinc-700 dark:text-zinc-300">{t.description}</td>
                          <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">
                            {t.client?.email ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-zinc-500 dark:text-zinc-400">
                            {formatDateTime(t.createdAt)}
                          </td>
                        </tr>
                      );
                    })}
                    {(ledger.data?.data.length ?? 0) === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-zinc-500">
                          No transactions found matching your criteria.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              
              {/* Pagination Controls */}
              {ledger.data && ledger.data.total > 0 && (
                <div className="flex items-center justify-between border-t border-zinc-200 dark:border-zinc-800 px-4 py-3 sm:px-6">
                  <div className="hidden sm:block">
                    <p className="text-sm text-zinc-700 dark:text-zinc-300">
                      Showing <span className="font-medium">{(page - 1) * 15 + 1}</span> to{" "}
                      <span className="font-medium">
                        {Math.min(page * 15, ledger.data.total)}
                      </span>{" "}
                      of <span className="font-medium">{ledger.data.total}</span> results
                    </p>
                  </div>
                  <div className="flex flex-1 justify-between sm:justify-end gap-2">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="relative inline-flex items-center rounded-md px-3 py-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100 ring-1 ring-inset ring-zinc-300 dark:ring-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
                    >
                      <ChevronLeft size={16} />
                      <span className="sr-only">Previous</span>
                    </button>
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page >= totalPages}
                      className="relative inline-flex items-center rounded-md px-3 py-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100 ring-1 ring-inset ring-zinc-300 dark:ring-zinc-700 hover:bg-zinc-50 dark:hover:bg-zinc-800 disabled:opacity-50"
                    >
                      <ChevronRight size={16} />
                      <span className="sr-only">Next</span>
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
