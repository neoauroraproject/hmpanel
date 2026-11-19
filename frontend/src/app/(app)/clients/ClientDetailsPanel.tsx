"use client";

import { useState } from "react";
import { clsx } from "clsx";
import {
  ArrowDown,
  ArrowUp,
  CalendarClock,
  Check,
  Copy,
  Edit2,
  ExternalLink,
  Globe,
  Link2,
  Network,
  QrCode,
  Server,
} from "lucide-react";
import type { Client } from "@/lib/types";
import { formatBytes, formatExpiry, isExpired } from "@/lib/format";
import { copyToClipboard } from "@/lib/clipboard";
import { useToast } from "@/components/toast";
import { useT } from "@/i18n";

type InboundLike = { tag?: string; protocol?: string; streamSettings?: { network?: string } | null };
type PanelLike = { name?: string; url?: string; subUrl?: string | null };
/** The list endpoint adds these relations; the shared Client type does not declare them all. */
type ClientWithPlacement = Client & { inbound?: (InboundLike & { panel?: PanelLike | null }) | null; inbounds?: InboundLike[] };

/** Panel subscription URL: the panel's own sub URL when set, else <origin>/sub/<id>. */
function panelSubLink(c: ClientWithPlacement): string | null {
  const panel = c.inbound?.panel;
  if (!panel?.url) return null;
  const sub = encodeURIComponent(c.subId || c.email || "");
  if (panel.subUrl) return `${panel.subUrl.endsWith("/") ? panel.subUrl : `${panel.subUrl}/`}${sub}`;
  try {
    return `${new URL(panel.url).origin}/sub/${sub}`;
  } catch {
    return `${panel.url.endsWith("/") ? panel.url : `${panel.url}/`}sub/${sub}`;
  }
}

function LinkRow({ icon: Icon, label, url }: { icon: typeof Link2; label: string; url: string }) {
  const t = useT();
  const toast = useToast((s) => s.push);
  const [copied, setCopied] = useState(false);
  const btn =
    "grid h-8 w-8 shrink-0 place-items-center rounded-lg text-zinc-500 outline-none transition-colors hover:bg-zinc-900/[0.06] hover:text-zinc-900 focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:text-zinc-400 dark:hover:bg-white/[0.08] dark:hover:text-zinc-50";
  return (
    <div className="group flex items-center gap-2.5 rounded-xl border border-zinc-200/80 bg-white px-3 py-2 dark:border-zinc-800 dark:bg-zinc-950/60">
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400">
        <Icon size={15} aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">{label}</div>
        <div className="truncate font-mono text-[12px] text-zinc-800 dark:text-zinc-200" dir="ltr" title={url}>
          {url}
        </div>
      </div>
      <button
        type="button"
        className={clsx(btn, copied && "text-emerald-600 dark:text-emerald-400")}
        aria-label={t("common.copy")}
        title={t("common.copy")}
        onClick={async (e) => {
          e.stopPropagation();
          try {
            await copyToClipboard(url);
            setCopied(true);
            toast(t("clientDetails.copied"), "success");
            window.setTimeout(() => setCopied(false), 1500);
          } catch {
            toast(t("clientDetails.copyFailed"), "error");
          }
        }}
      >
        {copied ? <Check size={15} /> : <Copy size={15} />}
      </button>
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={btn}
        aria-label={t("clientDetails.open")}
        title={t("clientDetails.open")}
      >
        <ExternalLink size={15} />
      </a>
    </div>
  );
}

/**
 * The panel that opens under a client row: usage at a glance, where the client
 * lives (panel, inbounds), and its subscription links with copy/open buttons.
 */
export function ClientDetailsPanel({
  client: c,
  online,
  onShowConnection,
  onEdit,
}: {
  client: Client;
  online?: boolean;
  onShowConnection: () => void;
  onEdit: () => void;
}) {
  const t = useT();
  const up = Number(c.up || 0);
  const down = Number(c.down || 0);
  const used = up + down;
  const total = Number(c.total || 0);
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const upShare = used > 0 ? (up / used) * 100 : 50;
  const expired = isExpired(c.expiryTime);
  const expiryMs = Number(c.expiryTime || 0);
  const [now] = useState(() => Date.now());
  const daysLeft = expiryMs > 0 ? Math.ceil((expiryMs - now) / 86_400_000) : null;

  const placed = c as ClientWithPlacement;
  const inbounds: InboundLike[] = placed.inbounds?.length ? placed.inbounds : placed.inbound ? [placed.inbound] : [];
  const panelName = placed.inbound?.panel?.name || t("common.unknown");
  const systemLink = typeof window !== "undefined" ? `${window.location.origin}/s/${c.subId || c.email}` : "";
  const panelLink = panelSubLink(placed);

  const card = "rounded-2xl border border-zinc-200/80 bg-zinc-50/70 p-4 dark:border-zinc-800 dark:bg-zinc-900/40";
  const heading = "mb-3 flex items-center gap-2 text-[11.5px] font-bold uppercase tracking-wide text-zinc-500 dark:text-zinc-400";

  return (
    <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.4fr]" onClick={(e) => e.stopPropagation()}>
      {/* Usage */}
      <section className={card}>
        <div className={heading}>
          <ArrowDown size={13} aria-hidden /> {t("clients.trafficSpecifics")}
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">{formatBytes(used)}</span>
          <span className="text-[12px] text-zinc-500">/ {total > 0 ? formatBytes(total) : t("common.unlimited")}</span>
        </div>
        {total > 0 ? (
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800">
            <div
              className={clsx("h-full rounded-full", pct >= 90 ? "bg-rose-500" : pct >= 70 ? "bg-amber-500" : "bg-blue-500")}
              style={{ width: `${pct}%` }}
            />
          </div>
        ) : null}
        <div className="mt-3 flex h-1.5 overflow-hidden rounded-full" aria-hidden>
          <div className="bg-emerald-500" style={{ width: `${upShare}%` }} />
          <div className="bg-sky-500" style={{ width: `${100 - upShare}%` }} />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2 text-[12px]">
          <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
            <ArrowUp size={13} className="text-emerald-500" aria-hidden /> {t("clients.uploadLabel")}
            <b className="ms-auto tabular-nums text-zinc-900 dark:text-zinc-100">{formatBytes(up)}</b>
          </div>
          <div className="flex items-center gap-1.5 text-zinc-600 dark:text-zinc-300">
            <ArrowDown size={13} className="text-sky-500" aria-hidden /> {t("clients.downloadLabel")}
            <b className="ms-auto tabular-nums text-zinc-900 dark:text-zinc-100">{formatBytes(down)}</b>
          </div>
        </div>
        <div
          className={clsx(
            "mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-[12.5px] font-medium",
            expired
              ? "bg-rose-500/10 text-rose-700 dark:text-rose-300"
              : daysLeft != null && daysLeft <= 3
                ? "bg-amber-500/12 text-amber-700 dark:text-amber-300"
                : "bg-zinc-900/[0.04] text-zinc-700 dark:bg-white/[0.05] dark:text-zinc-200",
          )}
        >
          <CalendarClock size={14} aria-hidden />
          <span className="truncate">{formatExpiry(c.expiryTime)}</span>
          {daysLeft != null && !expired ? (
            <span className="ms-auto shrink-0 tabular-nums">{t("clientDetails.daysLeft", { count: daysLeft })}</span>
          ) : null}
        </div>
      </section>

      {/* Where it lives */}
      <section className={card}>
        <div className={heading}>
          <Network size={13} aria-hidden /> {t("clients.connectionDetails")}
        </div>
        <div className="flex items-center gap-2.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-zinc-900 text-white dark:bg-white dark:text-zinc-900">
            <Server size={16} aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-zinc-900 dark:text-zinc-50">{panelName}</div>
            <div className="flex items-center gap-1.5 text-[11.5px] text-zinc-500">
              <span className={clsx("h-1.5 w-1.5 rounded-full", online ? "bg-emerald-500" : "bg-zinc-400")} aria-hidden />
              {online ? t("clientDetails.onlineNow") : c.enable ? t("common.active") : t("common.disabled")}
            </div>
          </div>
        </div>
        <div className="mt-3 text-[11px] font-semibold text-zinc-500 dark:text-zinc-400">
          {t("clients.inboundLabel")} · {inbounds.length}
        </div>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {inbounds.length ? (
            inbounds.slice(0, 8).map((i, idx) => (
              <span
                key={`${i.tag}-${idx}`}
                className="inline-flex max-w-full items-center gap-1 rounded-lg border border-zinc-200 bg-white px-2 py-1 text-[11.5px] dark:border-zinc-700 dark:bg-zinc-950"
                dir="ltr"
              >
                <span className="truncate font-medium text-zinc-800 dark:text-zinc-100">{i.tag || "—"}</span>
                {i.protocol ? (
                  <span className="shrink-0 rounded bg-blue-500/10 px-1 text-[10px] font-semibold uppercase text-blue-700 dark:text-blue-300">
                    {i.protocol}
                    {i.streamSettings?.network ? ` · ${i.streamSettings.network}` : ""}
                  </span>
                ) : null}
              </span>
            ))
          ) : (
            <span className="text-[12px] text-zinc-500">{t("common.unknown")}</span>
          )}
          {inbounds.length > 8 ? (
            <span className="inline-flex items-center rounded-lg bg-zinc-900/[0.05] px-2 py-1 text-[11px] font-semibold text-zinc-600 dark:bg-white/[0.06] dark:text-zinc-300">
              +{inbounds.length - 8}
            </span>
          ) : null}
        </div>
      </section>

      {/* Links */}
      <section className={card}>
        <div className={heading}>
          <Link2 size={13} aria-hidden /> {t("clients.subscriptionLinks")}
        </div>
        <div className="space-y-2">
          {systemLink ? <LinkRow icon={Globe} label={t("clientDetails.systemLink")} url={systemLink} /> : null}
          {panelLink ? <LinkRow icon={Server} label={t("clientDetails.panelLink")} url={panelLink} /> : null}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onShowConnection();
            }}
            className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 text-[13px] font-semibold text-white outline-none transition-colors hover:bg-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500/50"
          >
            <QrCode size={15} aria-hidden /> {t("clientDetails.qrAndConfigs")}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onEdit();
            }}
            className="inline-flex h-9 items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 text-[13px] font-medium text-zinc-700 outline-none transition-colors hover:bg-zinc-50 focus-visible:ring-2 focus-visible:ring-blue-500/50 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-200 dark:hover:bg-zinc-900"
          >
            <Edit2 size={14} aria-hidden /> {t("common.edit")}
          </button>
        </div>
      </section>
    </div>
  );
}
