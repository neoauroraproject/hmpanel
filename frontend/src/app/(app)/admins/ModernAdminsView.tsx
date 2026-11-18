"use client";

import { useState } from "react";
import { clsx } from "clsx";
import { CalendarDays, Crown, Edit2, HardDrive, Plus, Power, Trash2, UserCog, Users, Zap } from "lucide-react";
import type { Admin } from "./page";
import { AdminPremiumChips } from "./AdminPremiumAccess";
import { formatBytes, formatDate } from "@/lib/format";
import { useT } from "@/i18n";
import {
  M_INK,
  M_MUTED,
  MAvatar,
  MBar,
  MStatStrip,
  MEmpty,
  MFigure,
  MHero,
  MIconButton,
  MMixBar,
  MPills,
  MPrimaryButton,
  MRing,
  MSearch,
  MStatusPill,
  MSurface,
} from "@/components/modern/kit";

const DAY = 86_400_000;

type Props = {
  admins: Admin[];
  activeTab: "active" | "disabled";
  onTab: (tab: "active" | "disabled") => void;
  search: string;
  onSearch: (v: string) => void;
  fetching: boolean;
  isOwner: boolean;
  roleLabel: (a: Admin) => string;
  onAdd: () => void;
  onEdit: (a: Admin) => void;
  onQuick: (a: Admin) => void;
  onToggle: (a: Admin) => void;
  onDelete: (a: Admin) => void;
};

function trafficOf(a: Admin) {
  const total = Number(a.totalAssigned || 0);
  // Per-panel admins keep their balance on each panel row; the account-level balance is 0.
  // The list carries the panels' total and usage, so derive what is left from those.
  const perPanel = a.quotaMode === "PER_PANEL";
  const left = perPanel
    ? Math.max(0, total - Number(a.usedTraffic || 0))
    : Math.max(0, Number(a.balance || 0));
  const used = Number(a.usedTraffic || Math.max(0, total - left));
  return { total, left, used, pct: total > 0 ? (used / total) * 100 : 0 };
}

function AdminCard({ a, canEdit, roleLabel, onEdit, onQuick, onToggle, onDelete }: {
  a: Admin;
  canEdit: boolean;
  roleLabel: string;
  onEdit: () => void;
  onQuick: () => void;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const t = useT();
  // Captured once per mount: render stays pure, and day counts only need day precision.
  const [now] = useState(() => Date.now());
  const isSuper = a.role === "SUPER_ADMIN";
  const clients = a._count?.clients ?? 0;
  const tr = trafficOf(a);
  const capPct = a.maxClients > 0 ? (clients / a.maxClients) * 100 : null;
  const days = a.expiryTime > 0 ? Math.ceil((a.expiryTime - now) / DAY) : null;
  const canDelete = !a.isOwner;
  const blockedByClients = clients > 0;
  const showPower = !isSuper || !a.isOwner;

  return (
    <MSurface className="group flex flex-col p-5">
      <div className="flex items-start gap-3">
        <MAvatar name={a.username} size={44} />
        <div className="min-w-0 flex-1">
          <button
            type="button"
            onClick={canEdit ? onEdit : undefined}
            disabled={!canEdit}
            className={clsx("block max-w-full truncate text-start text-[15px] font-semibold", M_INK, canEdit && "cursor-pointer hover:text-[var(--hm-accent)]")}
            dir="ltr"
          >
            {a.username}
          </button>
          <div className={clsx("mt-0.5 flex items-center gap-1.5 text-xs", M_MUTED)}>
            {isSuper ? <Crown size={12} aria-hidden /> : null}
            {roleLabel}
          </div>
        </div>
        <MStatusPill tone={a.status === "active" ? "live" : "off"}>
          {a.status === "active" ? t("common.active") : t("common.disabled")}
        </MStatusPill>
      </div>

      {isSuper ? (
        <div className={clsx("mt-5 flex flex-1 items-center rounded-2xl bg-zinc-900/[0.035] px-4 py-3 text-xs dark:bg-white/[0.04]", M_MUTED)}>
          {t("admins.noTrafficLimits")}
        </div>
      ) : (
        <div className="mt-5 flex flex-1 flex-col gap-4">
          <div className="flex items-center gap-4">
            <MRing pct={a.unlimitedTraffic ? null : tr.pct} size={52} stroke={5} />
            <div className="min-w-0">
              <div className={clsx("text-[11px] font-medium", M_MUTED)}>{t("modernAdmins.trafficLeft")}</div>
              <div className="mt-1 text-2xl">
                {a.unlimitedTraffic ? (
                  <span className={clsx("hm-num", M_INK)}>∞</span>
                ) : (
                  <MFigure value={formatBytes(tr.left)} />
                )}
              </div>
              <div className={clsx("mt-1 text-[11px]", M_MUTED)} dir="auto">
                {a.unlimitedTraffic
                  ? t("admins.unlimitedTrafficLabel")
                  : a.quotaMode === "PER_PANEL" && a.panelQuotaSummary
                    ? a.panelQuotaSummary
                    : `${t("modernAdmins.usedOf", { used: formatBytes(tr.used), total: formatBytes(tr.total) })}`}
              </div>
            </div>
          </div>

          <div>
            <div className={clsx("mb-1.5 flex items-center justify-between text-[11px] font-medium", M_MUTED)}>
              <span className="flex items-center gap-1.5">
                <Users size={12} aria-hidden /> {t("admins.colClients")}
              </span>
              <span className={M_INK} dir="ltr">
                {clients} / {a.maxClients > 0 ? a.maxClients : "∞"}
              </span>
            </div>
            <MBar pct={capPct ?? 0} tone={capPct == null ? "ink" : "auto"} />
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="inline-flex h-6 items-center gap-1 rounded-full bg-zinc-900/[0.05] px-2.5 text-[11px] font-medium text-zinc-700 dark:bg-white/[0.07] dark:text-zinc-200">
              <HardDrive size={11} aria-hidden />
              {a.trafficMode === "USAGE" ? t("modernAdmins.modeUsage") : t("modernAdmins.modeAllocation")}
            </span>
            <span className="inline-flex h-6 items-center rounded-full bg-zinc-900/[0.05] px-2.5 text-[11px] font-medium text-zinc-700 dark:bg-white/[0.07] dark:text-zinc-200">
              {a.unlimitedTraffic
                ? t("admins.unlimitedTrafficLabel")
                : a.quotaMode === "PER_PANEL"
                  ? t("admins.quotaModePerPanel")
                  : t("admins.quotaModeGlobal")}
            </span>
            {days != null ? (
              <span
                className={clsx(
                  "inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold",
                  days < 0
                    ? "bg-rose-500/12 text-rose-700 dark:text-rose-300"
                    : days <= 7
                      ? "bg-amber-500/14 text-amber-700 dark:text-amber-300"
                      : "bg-[var(--hm-accent-soft)] text-[var(--hm-accent)]",
                )}
                title={formatDate(new Date(a.expiryTime).toISOString())}
              >
                <CalendarDays size={11} aria-hidden />
                {days < 0
                  ? t("admins.expiredDaysAgo", { count: Math.abs(days) })
                  : t("admins.daysRemaining", { count: days })}
              </span>
            ) : null}
          </div>
        </div>
      )}

      {!isSuper ? (
        <div className="mt-3">
          <AdminPremiumChips adminId={a.id} />
        </div>
      ) : null}

      <div className="mt-5 flex items-center justify-between gap-2 border-t border-[var(--hm-line)] pt-3">
        {!isSuper && canEdit && !a.unlimitedTraffic ? (
          <button
            type="button"
            onClick={onQuick}
            className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-[var(--hm-accent-soft)] px-3.5 text-xs font-semibold text-[var(--hm-accent)] outline-none transition-colors hover:bg-[var(--hm-accent)] hover:text-white focus-visible:ring-2 focus-visible:ring-blue-500/60"
          >
            <Zap size={14} aria-hidden /> {t("adminTools.quickTopUp")}
          </button>
        ) : (
          <span className={clsx("text-[11px]", M_MUTED)}>
            {isSuper ? "" : t("modernAdmins.clientsCount", { count: clients })}
          </span>
        )}
        <div className="flex items-center gap-0.5">
          {showPower ? (
            <MIconButton
              label={a.status === "active" ? t("admins.disableAdmin") : t("admins.enableAdmin")}
              tone={a.status === "active" ? "live" : "default"}
              onClick={onToggle}
            >
              <Power size={16} />
            </MIconButton>
          ) : null}
          {canEdit ? (
            <MIconButton label={t("admins.editAdminTitle")} onClick={onEdit}>
              <Edit2 size={16} />
            </MIconButton>
          ) : null}
          {canDelete ? (
            <MIconButton
              label={blockedByClients ? t("admins.cannotDeleteWithClients") : t("admins.deleteAdmin")}
              tone="danger"
              onClick={blockedByClients ? () => undefined : onDelete}
              className={blockedByClients ? "cursor-not-allowed opacity-40" : undefined}
            >
              <Trash2 size={16} />
            </MIconButton>
          ) : null}
        </div>
      </div>
    </MSurface>
  );
}

export function ModernAdminsView(p: Props) {
  const t = useT();
  const resellers = p.admins.filter((a) => a.role !== "SUPER_ADMIN");
  const supers = p.admins.filter((a) => a.role === "SUPER_ADMIN");
  const totals = resellers.reduce(
    (acc, a) => {
      const tr = trafficOf(a);
      acc.assigned += tr.total;
      acc.used += tr.used;
      acc.left += tr.left;
      acc.clients += a._count?.clients ?? 0;
      return acc;
    },
    { assigned: 0, used: 0, left: 0, clients: 0 },
  );
  const sorted = [...supers, ...resellers];

  return (
    <div className="space-y-5 pb-6">
      <MHero
        title={t("admins.title")}
        subtitle={t("admins.subtitle")}
        actions={
          <MPrimaryButton onClick={p.onAdd}>
            <Plus size={16} /> {t("admins.addAdmin")}
          </MPrimaryButton>
        }
        aside={
          <MStatStrip
            items={[
              { icon: UserCog, value: resellers.length, label: t("modernAdmins.resellers") },
              { icon: Users, value: totals.clients, label: t("nav.clients") },
              {
                icon: HardDrive,
                value: <MFigure value={formatBytes(totals.assigned)} className="!text-[1em]" />,
                label: t("modernAdmins.assigned"),
              },
            ]}
          />
        }
      >
        {totals.assigned > 0 ? (
          <MMixBar
            parts={[
              { label: t("modernAdmins.used"), value: totals.used, tone: "ink" },
              { label: t("modernAdmins.left"), value: totals.left, tone: "hatch" },
            ]}
          />
        ) : null}
      </MHero>

      <MSurface className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
        <MPills
          value={p.activeTab}
          onChange={p.onTab}
          options={[
            { id: "active", label: t("admins.activeAdmins"), dot: "bg-emerald-500" },
            { id: "disabled", label: t("admins.disabledAdmins"), dot: "bg-zinc-400" },
          ]}
        />
        <MSearch value={p.search} onChange={p.onSearch} placeholder={t("admins.searchPlaceholder")} className="min-w-0 flex-1" />
      </MSurface>

      {sorted.length === 0 ? (
        <MSurface>
          <MEmpty icon={UserCog} title={t("admins.noAdmins")} />
        </MSurface>
      ) : (
        <div className={clsx("grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4", p.fetching && "opacity-70 transition-opacity")}>
          {sorted.map((a) => (
            <AdminCard
              key={a.id}
              a={a}
              canEdit={a.isOwner ? p.isOwner : true}
              roleLabel={p.roleLabel(a)}
              onEdit={() => p.onEdit(a)}
              onQuick={() => p.onQuick(a)}
              onToggle={() => p.onToggle(a)}
              onDelete={() => p.onDelete(a)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
