"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Wallet, Zap } from "lucide-react";
import { clsx } from "clsx";
import { api } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import { useT } from "@/i18n";
import { TOPUP_HREF } from "@/components/TopUpNavButton";

type CatalogPlan = {
  id: string;
  name: string;
  price?: number | string | null;
  currency?: string | null;
  trafficBytes?: number | string | null;
  expiryDays?: number | null;
  adminTemplate?: { payg?: { pricePerGb?: number } | null } | null;
};
type Catalog = { plans?: CatalogPlan[]; autoApprove?: boolean };

/**
 * Reseller dashboard: account top-up front and center — what is left, a big button
 * straight into the top-up flow, and the first plans as one-tap shortcuts to checkout.
 */
export function ResellerTopUpCard({ account: a, pending }: { account: any; pending: number }) {
  const t = useT();
  const { data } = useQuery<Catalog>({
    queryKey: ["admin-recharge-catalog"],
    queryFn: async () => (await api.get<Catalog>("/premium-modules/admin-recharge/catalog")).data,
    retry: false,
    staleTime: 60_000,
  });
  const plans = (data?.plans || []).slice(0, 3);
  const used = Number(a?.usedTraffic || 0);
  const available = Math.max(0, Number(a?.availableTraffic || 0));
  const total = used + available;
  const pct = a?.unlimitedTraffic || total <= 0 ? null : Math.round((available / total) * 100);
  const low = pct != null && pct < 15;

  return (
    <section
      className={clsx(
        "overflow-hidden rounded-3xl border p-5",
        low
          ? "border-rose-300/60 bg-gradient-to-br from-rose-50 to-white dark:border-rose-900/50 dark:from-rose-950/30 dark:to-zinc-900"
          : "border-blue-200/70 bg-gradient-to-br from-blue-50 to-white dark:border-blue-900/40 dark:from-blue-950/30 dark:to-zinc-900",
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 font-semibold text-zinc-700 dark:text-zinc-200">
              <Wallet size={14} aria-hidden /> {t("dashboard.topUp.title")}
            </span>
            {data?.autoApprove ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 font-semibold text-amber-700 dark:text-amber-300">
                <Zap size={12} aria-hidden /> {t("dashboard.topUp.instant")}
              </span>
            ) : null}
            {pending > 0 ? (
              <span className="rounded-full bg-blue-500/10 px-2 py-0.5 font-medium text-blue-700 dark:text-blue-300">
                {t("dashboard.topUp.pending", { count: pending })}
              </span>
            ) : null}
          </div>
          <div
            className={clsx(
              "mt-2 text-2xl font-bold tabular-nums",
              low ? "text-rose-600 dark:text-rose-400" : "text-zinc-900 dark:text-zinc-50",
            )}
            dir="ltr"
          >
            {a?.unlimitedTraffic ? "∞" : formatBytes(available)}
          </div>
          <div className="text-xs text-zinc-500">
            {low ? t("dashboard.topUp.low") : t("dashboard.topUp.left")}
          </div>
          {pct != null ? (
            <div className="mt-2 h-1.5 max-w-sm overflow-hidden rounded-full bg-zinc-200/80 dark:bg-zinc-800">
              <div
                className={clsx("h-full rounded-full", low ? "bg-rose-500" : pct < 35 ? "bg-amber-500" : "bg-emerald-500")}
                style={{ width: `${pct}%` }}
              />
            </div>
          ) : null}
        </div>
        <Link
          href={TOPUP_HREF}
          className="inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-2xl bg-blue-600 px-6 text-sm font-bold text-white shadow-lg shadow-blue-600/25 transition hover:bg-blue-500 active:scale-[0.98]"
        >
          <Wallet size={17} aria-hidden /> {t("dashboard.topUp.button")}
        </Link>
      </div>

      {plans.length ? (
        <div className="mt-4 border-t border-zinc-200/70 pt-4 dark:border-zinc-800">
          <div className="mb-2 text-xs font-medium text-zinc-500">{t("dashboard.topUp.quick")}</div>
          <div className="grid gap-2 sm:grid-cols-3">
            {plans.map((p) => {
              const payg = !!p.adminTemplate?.payg?.pricePerGb;
              const bytes = Number(p.trafficBytes || 0);
              const price = Number(p.price || 0);
              return (
                <Link
                  key={p.id}
                  href={`${TOPUP_HREF}&plan=${encodeURIComponent(p.id)}`}
                  className="group flex items-center gap-2 rounded-2xl border border-zinc-200 bg-white/80 px-3.5 py-2.5 transition hover:border-blue-400 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900/70"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold text-zinc-800 dark:text-zinc-100">{p.name}</span>
                    <span className="block truncate text-xs text-zinc-500">
                      {payg
                        ? t("dashboard.topUp.payg")
                        : [bytes > 0 ? formatBytes(bytes) : "", p.expiryDays ? t("common.days", { count: p.expiryDays }) : ""]
                            .filter(Boolean)
                            .join(" · ")}
                      {price > 0 && !payg ? ` · ${price.toLocaleString()} ${p.currency === "USD" ? "$" : t("dashboard.topUp.toman")}` : ""}
                    </span>
                  </span>
                  <ArrowLeft size={15} className="shrink-0 text-zinc-400 transition group-hover:text-blue-600 ltr:rotate-180" aria-hidden />
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
    </section>
  );
}
