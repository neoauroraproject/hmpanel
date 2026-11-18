"use client";

import { clsx } from "clsx";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowDownRight, ArrowUpRight, Database, Users } from "lucide-react";
import { formatBytes, formatDateTime } from "@/lib/format";
import { useT } from "@/i18n";
import {
  M_FOCUS,
  M_INK,
  M_MUTED,
  MAvatar,
  MEmpty,
  MFigure,
  MMixBar,
  MRing,
  MSectionTitle,
  MSurface,
} from "@/components/modern/kit";

type Reseller = { id: string; username: string; trafficMode?: string };

/** Avatar strip of resellers for super admins; replaces the dropdown. */
export function ResellerStrip({
  resellers,
  adminId,
  onPick,
}: {
  resellers: Reseller[];
  adminId: string;
  onPick: (id: string) => void;
}) {
  const t = useT();
  if (resellers.length === 0) return null;
  return (
    <div className="hide-scrollbar -mx-1 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label={t("traffic.selectReseller")}>
      {resellers.map((r) => {
        const active = r.id === adminId;
        return (
          <button
            key={r.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onPick(r.id)}
            className={clsx(
              "flex h-12 shrink-0 cursor-pointer items-center gap-2.5 rounded-full border ps-1.5 pe-4 transition-colors duration-150",
              M_FOCUS,
              active
                ? "hm-ink border-transparent"
                : "border-[var(--hm-line)] bg-[var(--hm-card)] hover:bg-[var(--hm-surface)]",
            )}
          >
            <MAvatar name={r.username} size={36} />
            <span className="flex flex-col items-start leading-tight">
              <span className={clsx("text-[13px] font-semibold", !active && M_INK)} dir="ltr">
                {r.username}
              </span>
              {r.trafficMode ? (
                <span className={clsx("text-[10.5px]", active ? "opacity-70" : M_MUTED)}>
                  {r.trafficMode === "USAGE" ? t("modernAdmins.modeUsage") : t("modernAdmins.modeAllocation")}
                </span>
              ) : null}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function PickResellerEmpty() {
  const t = useT();
  return (
    <MSurface>
      <MEmpty icon={Users} title={t("traffic.selectReseller")} hint={t("traffic.pickReseller")} />
    </MSurface>
  );
}

type Destination = { id: string; name: string; panelType: string; remainingBytes: number | null };
type Row = { id: string; createdAt: string; balanceAfter?: number | null; type: string; amount: string | number };

export function LedgerOverview({
  destinations,
  panelId,
  onSelect,
  unlimited,
  remaining,
  used,
  total,
  totals,
  rows,
  panelTypeLabel,
  sharedHint,
}: {
  destinations: Destination[];
  panelId: string;
  onSelect: (id: string) => void;
  unlimited: boolean;
  remaining: number | null | undefined;
  used: number | null | undefined;
  total: number | null | undefined;
  totals?: { credit: string; debit: string };
  rows: Row[];
  panelTypeLabel: (type: string) => string;
  sharedHint?: string | null;
}) {
  const t = useT();
  const usedPct = !unlimited && total && total > 0 && used != null ? (used / total) * 100 : null;
  const series = [...rows]
    .filter((r) => r.balanceAfter != null)
    .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
    .map((r) => ({ at: formatDateTime(r.createdAt), balance: Number(r.balanceAfter) }));

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <MSurface className="p-5 lg:col-span-7">
        <div className="flex flex-wrap items-center gap-6">
          <MRing pct={unlimited ? null : usedPct} size={112} stroke={9} label={
            <span className="flex flex-col items-center">
              <span className={clsx("hm-num text-xl", M_INK)}>{unlimited ? "∞" : `${Math.round(usedPct ?? 0)}%`}</span>
              <span className={clsx("mt-0.5 text-[10px] font-medium", M_MUTED)}>{t("traffic.usedTraffic")}</span>
            </span>
          } />
          <div className="min-w-0 flex-1 space-y-4">
            <div>
              <div className={clsx("text-xs font-medium", M_MUTED)}>{t("traffic.remainingTraffic")}</div>
              <div className="mt-1 text-3xl sm:text-4xl">
                {unlimited || remaining == null ? (
                  <span className={clsx("hm-num", M_INK)}>{t("traffic.unlimited")}</span>
                ) : (
                  <MFigure value={formatBytes(remaining)} />
                )}
              </div>
              {sharedHint ? <div className={clsx("mt-1 text-[11px]", M_MUTED)}>{sharedHint}</div> : null}
            </div>
            {!unlimited && total ? (
              <MMixBar
                parts={[
                  { label: t("traffic.usedTraffic"), value: Number(used || 0), tone: "ink" },
                  { label: t("traffic.remainingTraffic"), value: Number(remaining || 0), tone: "hatch" },
                ]}
              />
            ) : null}
          </div>
        </div>
        <div className="mt-5 grid grid-cols-3 gap-2">
          <div className="rounded-2xl bg-zinc-900/[0.035] px-3.5 py-3 dark:bg-white/[0.04]">
            <div className={clsx("text-[11px]", M_MUTED)}>{t("traffic.totalToDate")}</div>
            <div className={clsx("mt-1 text-sm font-semibold tabular-nums", M_INK)} dir="ltr">
              {unlimited || total == null ? "∞" : formatBytes(total)}
            </div>
          </div>
          <div className="rounded-2xl bg-emerald-500/[0.08] px-3.5 py-3">
            <div className="flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-300">
              <ArrowUpRight size={12} aria-hidden /> {t("traffic.creditsOnly")}
            </div>
            <div className={clsx("mt-1 text-sm font-semibold tabular-nums", M_INK)} dir="ltr">
              {formatBytes(totals?.credit ?? 0)}
            </div>
          </div>
          <div className="rounded-2xl bg-amber-500/[0.1] px-3.5 py-3">
            <div className="flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300">
              <ArrowDownRight size={12} aria-hidden /> {t("traffic.debitsOnly")}
            </div>
            <div className={clsx("mt-1 text-sm font-semibold tabular-nums", M_INK)} dir="ltr">
              {formatBytes(totals?.debit ?? 0)}
            </div>
          </div>
        </div>
      </MSurface>

      <div className="flex flex-col gap-4 lg:col-span-5">
        {destinations.length > 0 ? (
          <MSurface className="p-2">
            <div className={clsx("px-3 pb-1.5 pt-2 text-xs font-semibold", M_MUTED)}>{t("traffic.destinations")}</div>
            <div className="space-y-1">
              {destinations.map((d) => {
                const active = d.id === panelId;
                return (
                  <button
                    key={d.id}
                    type="button"
                    onClick={() => onSelect(d.id)}
                    aria-pressed={active}
                    className={clsx(
                      "flex w-full cursor-pointer items-center gap-3 rounded-[1.1rem] px-3 py-2.5 text-start transition-colors",
                      M_FOCUS,
                      active ? "hm-ink" : "hover:bg-zinc-900/[0.05] dark:hover:bg-white/[0.06]",
                    )}
                  >
                    <span className={clsx("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", active ? "bg-white/15" : "bg-zinc-900/[0.06] text-zinc-600 dark:bg-white/[0.08] dark:text-zinc-300")}>
                      <Database size={14} aria-hidden />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={clsx("block truncate text-[13px] font-semibold", !active && M_INK)} dir="auto">{d.name}</span>
                      <span className={clsx("block text-[11px]", active ? "opacity-70" : M_MUTED)}>{panelTypeLabel(d.panelType)}</span>
                    </span>
                    <span className={clsx("shrink-0 text-xs font-semibold tabular-nums", !active && M_INK)} dir="ltr">
                      {d.remainingBytes == null ? "∞" : formatBytes(d.remainingBytes)}
                    </span>
                  </button>
                );
              })}
            </div>
          </MSurface>
        ) : null}

        {series.length >= 2 ? (
          <MSurface className="flex-1 p-5">
            <MSectionTitle hint={t("modernTraffic.balanceHint")}>{t("modernTraffic.balanceTitle")}</MSectionTitle>
            <ResponsiveContainer width="100%" height={130}>
              <AreaChart data={series} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
                <defs>
                  <linearGradient id="hmBalance" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--hm-accent)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--hm-accent)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--hm-line)" strokeDasharray="3 5" />
                <XAxis dataKey="at" hide />
                <YAxis hide domain={["dataMin", "dataMax"]} />
                <Tooltip
                  formatter={(v) => [formatBytes(Number(v)), t("traffic.colBalance")]}
                  contentStyle={{ background: "var(--hm-ink)", border: "none", borderRadius: 14, padding: "8px 12px" }}
                  itemStyle={{ color: "var(--hm-ink-contrast)", fontSize: 12, fontWeight: 600 }}
                  labelStyle={{ color: "var(--hm-ink-contrast)", opacity: 0.65, fontSize: 11 }}
                />
                <Area type="monotone" dataKey="balance" stroke="var(--hm-accent)" strokeWidth={2.5} fill="url(#hmBalance)" />
              </AreaChart>
            </ResponsiveContainer>
          </MSurface>
        ) : null}
      </div>
    </div>
  );
}
