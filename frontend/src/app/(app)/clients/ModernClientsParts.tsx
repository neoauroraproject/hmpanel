"use client";

/* Modern-look pieces of the clients page. State and data stay in page.tsx. */

import { useState } from "react";
import { clsx } from "clsx";
import { CalendarDays, Database, HardDrive, Infinity as InfinityIcon, RotateCcw, Users, Wifi } from "lucide-react";
import { formatBytes, formatDate } from "@/lib/format";
import { useT } from "@/i18n";
import {
  M_FOCUS,
  M_INK,
  M_MUTED,
  MAvatar,
  MBar,
  MFigure,
  MHero,
  MPills,
  MRing,
  MSearch,
  MStatusPill,
  MSurface,
  type MTone,
} from "@/components/modern/kit";

const DAY = 86_400_000;

export function clientStatus(c: { enable: boolean; up: string; down: string; total: string; expiryTime: string }, online: boolean) {
  const used = Number(c.up) + Number(c.down);
  const cap = Number(c.total);
  const exp = Number(c.expiryTime);
  if (!c.enable) return "disabled" as const;
  if (cap > 0 && used >= cap) return "depleted" as const;
  if (exp > 0 && exp < Date.now()) return "expired" as const;
  if (online) return "online" as const;
  return "active" as const;
}

export function ModernClientsTop({
  totalItems,
  actions,
  status,
  onStatus,
  counts,
  search,
  onSearch,
  selects,
  canReset,
  onReset,
}: {
  totalItems: number | null;
  actions: React.ReactNode;
  status: string;
  onStatus: (next: string) => void;
  counts: Partial<Record<"online" | "traffic-low" | "expiring-soon" | "disabled" | "expired" | "depleted", number>>;
  search: string;
  onSearch: (next: string) => void;
  selects: React.ReactNode;
  canReset: boolean;
  onReset: () => void;
}) {
  const t = useT();
  const options = [
    { id: "", label: t("clients.filterAll"), count: totalItems },
    { id: "online", label: t("clients.filterOnline"), count: counts.online ?? null, dot: "bg-emerald-500" },
    { id: "expiring-soon", label: t("clients.filterExpiringSoon"), count: counts["expiring-soon"] ?? null, dot: "bg-amber-500" },
    { id: "traffic-low", label: t("clients.filterLowTraffic"), count: counts["traffic-low"] ?? null, dot: "bg-orange-500" },
    { id: "depleted", label: t("clients.filterNoTraffic"), count: counts.depleted ?? null, dot: "bg-rose-500" },
    { id: "expired", label: t("clients.filterExpired"), count: counts.expired ?? null, dot: "bg-rose-400" },
    { id: "disabled", label: t("clients.filterDisabled"), count: counts.disabled ?? null, dot: "bg-zinc-400" },
  ];

  return (
    <div className="space-y-4">
      <MHero
        title={t("clients.title")}
        subtitle={totalItems != null ? t(totalItems === 1 ? "clients.subtitle" : "clients.subtitle_plural", { count: totalItems }) : undefined}
        actions={actions}
      />
      <MSurface className="space-y-3 p-3">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
          <MSearch
            value={search}
            onChange={onSearch}
            placeholder={t("clients.searchExtendedPlaceholder")}
            className="min-w-0 flex-1"
          />
          <div className="flex flex-wrap items-center gap-2 [&>select]:min-w-0 [&>select]:flex-1 lg:[&>select]:flex-none">
            {selects}
            {canReset ? (
              <button
                type="button"
                onClick={onReset}
                className={clsx(
                  "flex h-11 cursor-pointer items-center gap-1.5 rounded-full px-4 text-xs font-semibold text-[var(--hm-accent)] hover:bg-[var(--hm-accent-soft)]",
                  M_FOCUS,
                )}
              >
                <RotateCcw size={14} aria-hidden /> {t("clients.resetFilters")}
              </button>
            ) : null}
          </div>
        </div>
        <MPills value={status} onChange={onStatus} options={options} label={t("clients.filtersLabel")} />
      </MSurface>
    </div>
  );
}

export type Destination = { id: string; name: string; note?: string; count?: number };

/** Destination switcher (panels / provider types) + the caller's account card. */
export function ModernClientsRail({
  destinations,
  panelId,
  onSelect,
  extraSlot,
  account,
}: {
  destinations: Destination[];
  panelId: string;
  onSelect: (id: string) => void;
  extraSlot?: React.ReactNode;
  account: React.ReactNode;
}) {
  const t = useT();
  return (
    <aside className="space-y-4 xl:sticky xl:top-2">
      {destinations.length > 0 || extraSlot ? (
        <MSurface className="p-2">
          <div className={clsx("px-3 pb-2 pt-2 text-xs font-semibold", M_MUTED)}>{t("clients.panelSelectorLabel")}</div>
          <div className="hide-scrollbar flex gap-1 overflow-x-auto xl:flex-col xl:overflow-visible">
            {destinations.map((d) => {
              const active = d.id === panelId;
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => onSelect(d.id)}
                  aria-pressed={active}
                  className={clsx(
                    "flex min-h-12 shrink-0 cursor-pointer items-center gap-3 rounded-[1.1rem] px-3 py-2 text-start transition-colors duration-150 xl:w-full",
                    M_FOCUS,
                    active ? "hm-ink" : "hover:bg-zinc-900/[0.05] dark:hover:bg-white/[0.06]",
                  )}
                >
                  <span
                    className={clsx(
                      "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                      active ? "bg-white/15" : "bg-zinc-900/[0.06] text-zinc-600 dark:bg-white/[0.08] dark:text-zinc-300",
                    )}
                  >
                    <Database size={15} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={clsx("block truncate text-[13px] font-semibold", !active && M_INK)} dir="auto">
                      {d.name}
                    </span>
                    {d.note ? (
                      <span className={clsx("block truncate text-[11px]", active ? "opacity-70" : M_MUTED)}>{d.note}</span>
                    ) : null}
                  </span>
                </button>
              );
            })}
            {extraSlot}
          </div>
        </MSurface>
      ) : null}
      {account}
    </aside>
  );
}

/** Dark account card: what the caller can still sell. */
export function ModernAccountCard({
  admin,
  clientCount,
  onlineCount,
  isSuperAdmin,
  expiryLabel,
}: {
  admin: {
    unlimitedTraffic?: boolean;
    availableTraffic: number;
    allTimeTraffic?: number;
    clientCapacity: number;
    expiryTime: number;
    quotaMode?: string;
  };
  clientCount: number;
  onlineCount: number;
  isSuperAdmin: boolean;
  expiryLabel: string;
}) {
  const t = useT();
  const unlimited = !!admin.unlimitedTraffic;
  const total = Number(admin.allTimeTraffic || 0);
  const available = Math.max(0, Number(admin.availableTraffic || 0));
  const usedPct = unlimited || total <= 0 ? null : ((total - available) / total) * 100;
  const capPct = admin.clientCapacity > 0 ? (clientCount / admin.clientCapacity) * 100 : null;

  return (
    <div className="hm-ink-card hidden rounded-[1.625rem] p-5 xl:block">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[11px] font-medium text-white/60">
            <HardDrive size={13} aria-hidden /> {t("clients.availableTraffic")}
          </div>
          <div className="mt-2 text-3xl">
            {unlimited ? (
              <InfinityIcon size={40} strokeWidth={1.5} aria-label={t("common.unlimited")} />
            ) : (
              <MFigure value={formatBytes(available)} className="!text-white [&>span]:!text-white/55" />
            )}
          </div>
          <div className="mt-1 text-[11px] text-white/55">
            {unlimited ? t("common.unlimited") : t("clients.outOf", { total: formatBytes(total) })}
          </div>
        </div>
        {unlimited ? null : <MRing pct={usedPct} size={58} stroke={5} tone="onDark" />}
      </div>

      <div className="mt-5 space-y-4">
        <div>
          <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-white/60">
            <span className="flex items-center gap-1.5">
              <Users size={13} aria-hidden /> {t("clients.clientCapacity")}
            </span>
            <span className="text-white" dir="ltr">
              {clientCount} / {admin.clientCapacity > 0 ? admin.clientCapacity : "∞"}
            </span>
          </div>
          <MBar pct={capPct ?? 0} onDark tone={capPct == null ? "ink" : "auto"} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-white/[0.07] px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-[11px] text-white/55">
              <Wifi size={12} aria-hidden /> {t("clients.onlineClients")}
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums">
              {onlineCount}
              {isSuperAdmin ? <span className="ms-1 text-[10px] font-normal text-white/50">{t("clients.global")}</span> : null}
            </div>
          </div>
          <div className="rounded-2xl bg-white/[0.07] px-3 py-2.5">
            <div className="flex items-center gap-1.5 text-[11px] text-white/55">
              <CalendarDays size={12} aria-hidden /> {t("clients.subscriptionExpiry")}
            </div>
            <div className="mt-1 truncate text-lg font-semibold">{expiryLabel}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function ClientIdentity({
  name,
  remark,
  online,
  ipCount,
  onSessions,
  panelName,
}: {
  name: string;
  remark?: string | null;
  online: boolean;
  ipCount: number;
  onSessions: (e: React.MouseEvent) => void;
  panelName?: string | null;
}) {
  const t = useT();
  return (
    <div className="flex min-w-0 items-center gap-3">
      <MAvatar name={name} online={online} size={38} />
      <div className="min-w-0">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className={clsx("truncate text-[13.5px] font-semibold", M_INK)} dir="ltr">
            {name}
          </span>
          {online && ipCount > 0 ? (
            <button
              type="button"
              onClick={onSessions}
              className={clsx("shrink-0 cursor-pointer rounded-full bg-emerald-500/12 px-1.5 py-px text-[10px] font-semibold text-emerald-700 hover:bg-emerald-500/20 dark:text-emerald-300", M_FOCUS)}
              title={t("clients.ipsConnected", { count: ipCount })}
            >
              {t("clients.ipShort", { count: ipCount })}
            </button>
          ) : null}
        </div>
        {remark || panelName ? (
          <div className={clsx("mt-0.5 flex min-w-0 items-center gap-1.5 text-[11.5px]", M_MUTED)}>
            {remark ? (
              <span className="truncate" dir="auto" title={remark}>
                {remark}
              </span>
            ) : null}
            {panelName ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-zinc-900/[0.05] px-1.5 py-px text-[10px] dark:bg-white/[0.07]">
                <Database size={9} aria-hidden /> {panelName}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function ClientUsage({ up, down, total }: { up: string; down: string; total: string }) {
  const t = useT();
  const used = Number(up) + Number(down);
  const cap = Number(total);
  const pct = cap > 0 ? (used / cap) * 100 : null;
  return (
    <div className="flex items-center gap-3">
      <MRing pct={pct} size={38} stroke={4} />
      <div className="min-w-0 leading-tight">
        <div className={clsx("text-[13px] font-semibold tabular-nums", M_INK)} dir="ltr">
          {formatBytes(used)}
        </div>
        <div className={clsx("text-[11px] tabular-nums", M_MUTED)} dir="ltr">
          / {cap > 0 ? formatBytes(cap) : t("common.unlimited")}
        </div>
      </div>
    </div>
  );
}

export function ClientExpiry({ expiryTime }: { expiryTime: string }) {
  const t = useT();
  const [now] = useState(() => Date.now());
  const ms = Number(expiryTime);
  if (!ms) {
    return <span className={clsx("text-[13px]", M_MUTED)}>{t("common.never")}</span>;
  }
  if (ms < 0) {
    const days = Math.ceil(Math.abs(ms) / DAY);
    return (
      <div className="leading-tight">
        <div className={clsx("text-[13px] font-semibold", M_INK)}>{t("common.days", { count: days })}</div>
        <div className={clsx("text-[11px]", M_MUTED)}>{t("modernClients.firstUse")}</div>
      </div>
    );
  }
  const days = Math.ceil((ms - now) / DAY);
  const tone: MTone = days < 0 ? "bad" : days <= 3 ? "warn" : "off";
  return (
    <div className="flex items-center gap-2.5 leading-tight">
      <span
        className={clsx(
          "flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-2xl",
          tone === "bad" && "bg-rose-500/12 text-rose-700 dark:text-rose-300",
          tone === "warn" && "bg-amber-500/14 text-amber-700 dark:text-amber-300",
          tone === "off" && "bg-zinc-900/[0.05] text-zinc-700 dark:bg-white/[0.07] dark:text-zinc-200",
        )}
      >
        <span className="text-[14px] font-semibold tabular-nums leading-none" dir="ltr">
          {days < 0 ? "!" : days}
        </span>
        {days >= 0 ? <span className="mt-0.5 text-[8.5px] font-medium leading-none opacity-75">{t("modernClients.daysShort")}</span> : null}
      </span>
      <span className={clsx("text-[12px]", days < 0 ? "font-medium text-rose-700 dark:text-rose-300" : M_MUTED)}>
        {days < 0 ? t("common.expired") : formatDate(ms)}
      </span>
    </div>
  );
}

export function ClientStatus({
  status,
  ipCount,
  onSessions,
}: {
  status: ReturnType<typeof clientStatus>;
  ipCount: number;
  onSessions: (e: React.MouseEvent) => void;
}) {
  const t = useT();
  if (status === "online") {
    return (
      <button type="button" onClick={onSessions} className={clsx("cursor-pointer rounded-full", M_FOCUS)}>
        <MStatusPill tone="live" pulse>
          {t("common.online")}
          {ipCount > 0 ? ` · ${ipCount}` : ""}
        </MStatusPill>
      </button>
    );
  }
  if (status === "disabled") return <MStatusPill tone="off">{t("common.disabled")}</MStatusPill>;
  if (status === "depleted") return <MStatusPill tone="bad">{t("clients.noTraffic")}</MStatusPill>;
  if (status === "expired") return <MStatusPill tone="bad">{t("common.expired")}</MStatusPill>;
  return <MStatusPill tone="ok">{t("common.active")}</MStatusPill>;
}

export function OwnerChip({ name }: { name?: string | null }) {
  const t = useT();
  if (!name) {
    return <span className={clsx("text-[12px]", M_MUTED)}>{t("clients.directPanel")}</span>;
  }
  return (
    <span className="inline-flex max-w-full items-center gap-2">
      <MAvatar name={name} size={24} />
      <span className={clsx("truncate text-[12.5px] font-medium", M_INK)} dir="ltr">
        {name}
      </span>
    </span>
  );
}
