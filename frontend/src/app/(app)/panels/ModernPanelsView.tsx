"use client";

import { clsx } from "clsx";
import {
  Activity, Network, Pencil, PlugZap, Plus, Power, RefreshCw, Scale, ScrollText, Server, Trash2, Users,
} from "lucide-react";
import { formatDateTime } from "@/lib/format";
import { useT } from "@/i18n";
import { PluginSlot } from "@/components/PluginSlot";
import {
  M_FOCUS,
  M_INK,
  M_MUTED,
  MStatStrip,
  MEmpty,
  MHero,
  MIconButton,
  MMixBar,
  MPrimaryButton,
  MStatusPill,
  MSurface,
} from "@/components/modern/kit";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Panel = any;

type Props = {
  panels: Panel[];
  syncStatus: Record<string, "Started" | "Running" | "Finished" | undefined>;
  onAdd: () => void;
  onTest: (p: Panel) => void;
  onSync: (p: Panel) => void;
  onRestart: (p: Panel) => void;
  onVolumes: (p: Panel) => void;
  onInbounds: (p: Panel) => void;
  onLogs: (p: Panel) => void;
  onEdit: (p: Panel) => void;
  onDelete: (p: Panel) => void;
};

function hostOf(url: string) {
  try {
    const u = new URL(url);
    return u.host + (u.pathname !== "/" ? u.pathname : "");
  } catch {
    return url;
  }
}

function PanelCard({ p, sync, ...h }: Omit<Props, "panels" | "syncStatus" | "onAdd"> & { p: Panel; sync?: string }) {
  const t = useT();
  const online = p.status === "online";
  const isXui = !p.panelType || p.panelType === "3x-ui";
  const frozen = p.operable === false;
  const latency = p.syncState?.latencyMs;

  return (
    <MSurface className="relative flex flex-col overflow-hidden">
      <div
        aria-hidden
        className={clsx(
          "pointer-events-none absolute inset-x-0 top-0 h-28",
          online
            ? "bg-[radial-gradient(120%_100%_at_100%_0%,rgb(16_185_129/0.14),transparent_70%)]"
            : "bg-[radial-gradient(120%_100%_at_100%_0%,rgb(244_63_94/0.14),transparent_70%)]",
        )}
      />
      <div className="relative flex items-start gap-3 p-5 pb-0">
        <span
          className={clsx(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl",
            online ? "hm-ink" : "bg-zinc-900/[0.06] text-zinc-500 dark:bg-white/[0.08] dark:text-zinc-300",
          )}
        >
          <Server size={18} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className={clsx("truncate text-[15px] font-semibold", M_INK)} dir="auto">
            {p.name}
          </div>
          <div className={clsx("mt-0.5 truncate font-mono text-[11px]", M_MUTED)} dir="ltr" title={p.url}>
            {hostOf(p.url)}
          </div>
        </div>
        {frozen ? (
          <MStatusPill tone="warn">{p.connectionHealth === "DISABLED" ? t("panels.disconnected") : t("panels.premiumUnavailable")}</MStatusPill>
        ) : (
          <MStatusPill tone={online ? "live" : "bad"} pulse={online}>
            {online ? t("common.online") : p.status === "offline" ? t("common.offline") : p.status}
          </MStatusPill>
        )}
      </div>

      <div className="relative mt-4 flex flex-wrap gap-1.5 px-5">
        <span className="inline-flex h-6 items-center gap-1.5 rounded-full bg-zinc-900/[0.05] px-2.5 text-[11px] font-medium text-zinc-700 dark:bg-white/[0.07] dark:text-zinc-200" dir="ltr">
          {p.panelType || "3x-ui"}
          {p.version ? <span className="opacity-60">v{p.version}</span> : null}
        </span>
        <span className="inline-flex h-6 items-center rounded-full bg-zinc-900/[0.05] px-2.5 text-[11px] font-medium text-zinc-700 dark:bg-white/[0.07] dark:text-zinc-200">
          {p.server?.name ?? t("common.localServer")}
        </span>
        {latency != null ? (
          <span className="inline-flex h-6 items-center gap-1 rounded-full bg-[var(--hm-accent-soft)] px-2.5 text-[11px] font-semibold text-[var(--hm-accent)]" dir="ltr">
            <Activity size={11} aria-hidden /> {latency}ms
          </span>
        ) : null}
      </div>

      <div className="relative mt-4 grid grid-cols-3 divide-x divide-[var(--hm-line)] border-y border-[var(--hm-line)]">
        <div className="px-5 py-3">
          <div className={clsx("flex items-center gap-1 text-[11px]", M_MUTED)}>
            <Users size={11} aria-hidden /> {t("panels.clients")}
          </div>
          <div className={clsx("hm-num mt-1 text-xl", M_INK)}>{p.clientCount ?? 0}</div>
        </div>
        <div className="px-5 py-3">
          <div className={clsx("flex items-center gap-1 text-[11px]", M_MUTED)}>
            <Network size={11} aria-hidden /> {t("panels.inbounds")}
          </div>
          <div className={clsx("hm-num mt-1 text-xl", M_INK)}>{p.inboundCount ?? 0}</div>
        </div>
        <div className="min-w-0 px-5 py-3">
          <div className={clsx("text-[11px]", M_MUTED)}>{t("panels.lastSync")}</div>
          <div className={clsx("mt-1 truncate text-[12px] font-medium", M_INK)}>
            {p.lastSync ? formatDateTime(p.lastSync) : t("common.neverLower")}
          </div>
          {p.syncState?.status ? (
            <div className={clsx("text-[10.5px] font-medium", p.syncState.status === "success" ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
              {p.syncState.status}
            </div>
          ) : null}
        </div>
      </div>

      <div className="relative flex flex-wrap items-center gap-2 p-3">
        <button
          type="button"
          disabled={frozen}
          onClick={() => h.onTest(p)}
          className={clsx(
            "flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-[var(--hm-line)] px-3.5 text-xs font-semibold text-zinc-800 transition-colors hover:bg-zinc-900/[0.04] disabled:opacity-40 dark:text-zinc-100 dark:hover:bg-white/[0.06]",
            M_FOCUS,
          )}
        >
          <PlugZap size={14} aria-hidden /> {t("common.testConnection")}
        </button>
        <button
          type="button"
          disabled={!!sync || frozen}
          onClick={() => h.onSync(p)}
          className={clsx(
            "hm-ink flex h-9 cursor-pointer items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition-opacity hover:opacity-90 disabled:opacity-60",
            M_FOCUS,
          )}
        >
          <RefreshCw size={14} aria-hidden className={sync === "Running" || sync === "Started" ? "motion-safe:animate-spin" : undefined} />
          {sync === "Started"
            ? t("panels.syncStarted")
            : sync === "Running"
              ? t("panels.syncRunning")
              : sync === "Finished"
                ? t("panels.syncFinished")
                : t("panels.runSync")}
        </button>
        <div className="ms-auto flex items-center">
          {isXui ? (
            <MIconButton label={t("panels.restartXray")} onClick={() => !frozen && h.onRestart(p)}>
              <Power size={15} />
            </MIconButton>
          ) : null}
          {isXui ? (
            <MIconButton label={t("panels.volumeConflicts")} onClick={() => !frozen && h.onVolumes(p)}>
              <Scale size={15} />
            </MIconButton>
          ) : null}
          <PluginSlot name="panels.row.actions" props={{ panel: p }} />
          <MIconButton label={t("panels.inbounds")} onClick={() => h.onInbounds(p)}>
            <Network size={15} />
          </MIconButton>
          {isXui ? (
            <MIconButton label={t("panels.viewLogs")} onClick={() => h.onLogs(p)}>
              <ScrollText size={15} />
            </MIconButton>
          ) : null}
          <MIconButton label={t("common.edit")} onClick={() => h.onEdit(p)}>
            <Pencil size={15} />
          </MIconButton>
          <MIconButton label={t("common.delete")} tone="danger" onClick={() => h.onDelete(p)}>
            <Trash2 size={15} />
          </MIconButton>
        </div>
      </div>
    </MSurface>
  );
}

export function ModernPanelsView({ panels, syncStatus, onAdd, ...handlers }: Props) {
  const t = useT();
  const online = panels.filter((p) => p.status === "online").length;
  const clients = panels.reduce((sum, p) => sum + Number(p.clientCount || 0), 0);
  const inbounds = panels.reduce((sum, p) => sum + Number(p.inboundCount || 0), 0);

  return (
    <div className="space-y-5 pb-6">
      <MHero
        title={t("panels.title")}
        subtitle={t(panels.length === 1 ? "panels.subtitle" : "panels.subtitle_plural", { count: panels.length })}
        actions={
          <MPrimaryButton onClick={onAdd}>
            <Plus size={16} /> {t("panels.addPanel")}
          </MPrimaryButton>
        }
        aside={
          <MStatStrip
            items={[
              { icon: Server, value: `${online}/${panels.length}`, label: t("common.online") },
              { icon: Users, value: clients, label: t("panels.clients") },
              { icon: Network, value: inbounds, label: t("panels.inbounds") },
            ]}
          />
        }
      >
        {panels.length > 0 ? (
          <MMixBar
            parts={[
              { label: t("common.online"), value: online, tone: "ink" },
              { label: t("common.offline"), value: panels.length - online, tone: "hatch" },
            ]}
          />
        ) : null}
      </MHero>

      {panels.length === 0 ? (
        <MSurface>
          <MEmpty
            icon={Server}
            title={t("panels.noPanels")}
            action={
              <MPrimaryButton onClick={onAdd}>
                <Plus size={16} /> {t("panels.addPanel")}
              </MPrimaryButton>
            }
          />
        </MSurface>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {panels.map((p) => (
            <PanelCard key={p.id} p={p} sync={syncStatus[p.id]} {...handlers} />
          ))}
        </div>
      )}
    </div>
  );
}
