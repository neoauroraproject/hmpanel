"use client";

import { clsx } from "clsx";
import { useRouter } from "next/navigation";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  Activity, ArchiveX, ArrowUpRight, CalendarDays, HardDrive, Server, UserCog, Users, Wifi,
} from "lucide-react";
import { formatBytes } from "@/lib/format";
import { Spinner } from "@/components/ui";
import { useT } from "@/i18n";

/* Modern-look dashboard views. Data fetching stays in page.tsx; these only render. */

type Icon = typeof Server;
type Slice = { name: string; bytes: number };

const SURFACE =
  "rounded-[1.625rem] border border-[var(--hm-line)] bg-[var(--hm-card)] shadow-[var(--hm-shadow-card)]";
const MUTED = "text-zinc-500 dark:text-zinc-400";
const INK_TEXT = "text-zinc-900 dark:text-zinc-50";
const DONUT_COLORS = ["var(--hm-accent)", "var(--hm-ink)", "#8fb0ff", "#a0a6b1", "#38bdf8", "#cfd4dc"];

const tooltipProps = {
  contentStyle: {
    background: "var(--hm-ink)",
    border: "none",
    borderRadius: 14,
    padding: "8px 12px",
    boxShadow: "0 12px 30px -12px rgb(0 0 0 / 0.45)",
  },
  itemStyle: { color: "var(--hm-ink-contrast)", fontWeight: 600, fontSize: 12 },
  labelStyle: { color: "var(--hm-ink-contrast)", opacity: 0.65, fontSize: 11, marginBottom: 2 },
};

/** "147 GB" → big figure + small unit. */
function Figure({ value, className }: { value: string | number; className?: string }) {
  const [num, ...rest] = String(value).split(" ");
  return (
    <span className={clsx("hm-num inline-flex items-baseline gap-1.5", INK_TEXT, className)} dir="ltr">
      {num}
      {rest.length ? <span className="text-[0.38em] font-medium tracking-normal text-zinc-500">{rest.join(" ")}</span> : null}
    </span>
  );
}

function Pills<T extends string>({
  value, options, onChange, size = "md",
}: {
  value: T;
  options: { id: T; label: string }[];
  onChange: (next: T) => void;
  size?: "sm" | "md";
}) {
  return (
    <div className="flex shrink-0 rounded-full border border-[var(--hm-line)] bg-zinc-100/70 p-0.5 dark:bg-white/[0.04]">
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          onClick={() => onChange(opt.id)}
          aria-pressed={opt.id === value}
          className={clsx(
            "cursor-pointer whitespace-nowrap rounded-full outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-blue-500/60",
            size === "sm" ? "px-2.5 py-1 text-[11px]" : "px-3.5 py-1.5 text-xs",
            opt.id === value ? "hm-ink font-semibold" : clsx("font-medium hover:text-zinc-900 dark:hover:text-zinc-100", MUTED),
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/** Labelled proportional strip: solid ink, accent, then hatched remainder. */
function MixBar({ parts }: { parts: { label: string; value: number; tone: "ink" | "accent" | "hatch" | "outline" }[] }) {
  const total = parts.reduce((sum, p) => sum + p.value, 0);
  if (total <= 0) return null;
  return (
    <div className="flex w-full max-w-2xl gap-1.5">
      {parts.map((p) => {
        const pct = (p.value / total) * 100;
        return (
          <div key={p.label} className="min-w-[4.5rem]" style={{ flex: `${Math.max(pct, 1)} 1 0%` }}>
            <div className={clsx("mb-1.5 truncate ps-1 text-xs font-medium", MUTED)}>{p.label}</div>
            <div
              className={clsx(
                "flex h-10 items-center rounded-full px-3.5 text-xs font-semibold tabular-nums",
                p.tone === "ink" && "hm-ink",
                p.tone === "accent" && "bg-[var(--hm-accent)] text-white",
                p.tone === "hatch" && clsx("hm-hatch", INK_TEXT),
                p.tone === "outline" && clsx("border border-zinc-400/70", INK_TEXT),
              )}
            >
              <span dir="ltr">{pct >= 10 ? pct.toFixed(0) : pct.toFixed(pct > 0 && pct < 1 ? 1 : 0)}%</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function HeroStat({ icon: Icon, value, label, hint }: { icon: Icon; value: React.ReactNode; label: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-end gap-2.5">
        <span className="mb-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-900/[0.06] text-zinc-600 dark:bg-white/[0.08] dark:text-zinc-300">
          <Icon size={15} aria-hidden />
        </span>
        <span className={clsx("hm-num text-3xl sm:text-4xl", INK_TEXT)} dir="ltr">{value}</span>
      </div>
      <div className={clsx("mt-2 text-xs font-medium", INK_TEXT)}>{label}</div>
      {hint ? <div className={clsx("mt-0.5 text-[11px]", MUTED)}>{hint}</div> : null}
    </div>
  );
}

function Tile({
  icon: Icon, label, value, children, className,
}: {
  icon: Icon; label: string; value: React.ReactNode; children?: React.ReactNode; className?: string;
}) {
  return (
    <div className={clsx(SURFACE, "flex flex-col justify-between gap-5 p-5", className)}>
      <div className="flex items-center justify-between gap-2">
        <span className={clsx("text-sm font-medium", MUTED)}>{label}</span>
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-zinc-900/[0.05] text-zinc-600 dark:bg-white/[0.07] dark:text-zinc-300">
          <Icon size={16} aria-hidden />
        </span>
      </div>
      <div className="flex items-end justify-between gap-3">
        <div className="text-2xl sm:text-3xl">{value}</div>
        {children}
      </div>
    </div>
  );
}

function Meter({ label, pct, onDark = false }: { label: string; pct: number; onDark?: boolean }) {
  const safe = Math.max(0, Math.min(100, Number(pct) || 0));
  const color = onDark
    ? safe > 85 ? "bg-[#fb7185]" : safe > 65 ? "bg-[#fbbf24]" : "bg-white"
    : safe > 85 ? "bg-rose-500" : safe > 65 ? "bg-amber-500" : "bg-[var(--hm-accent)]";
  return (
    <div>
      <div className={clsx("mb-1.5 flex justify-between text-[11px] font-medium", onDark ? "text-white/60" : MUTED)}>
        <span>{label}</span>
        <span className={onDark ? "text-white" : INK_TEXT} dir="ltr">{safe.toFixed(0)}%</span>
      </div>
      <div className={clsx("h-1.5 w-full overflow-hidden rounded-full", onDark ? "bg-white/[0.12]" : "bg-zinc-900/[0.08] dark:bg-white/10")}>
        <div className={clsx("h-full rounded-full", color)} style={{ width: `${safe}%` }} />
      </div>
    </div>
  );
}

function DonutCard({
  title, data, range, onRange,
}: {
  title: string; data: Slice[]; range: "allTime" | "24h"; onRange: (r: "allTime" | "24h") => void;
}) {
  const t = useT();
  const total = data.reduce((sum, d) => sum + d.bytes, 0);
  return (
    <div className={clsx(SURFACE, "p-5")}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className={clsx("text-[15px] font-semibold", INK_TEXT)}>{title}</h2>
        <Pills
          size="sm"
          value={range}
          onChange={onRange}
          options={[
            { id: "allTime", label: t("dashboard.allTime") },
            { id: "24h", label: t("dashboard.last24h") },
          ]}
        />
      </div>
      {data.length === 0 ? (
        <div className={clsx("flex h-44 items-center justify-center text-sm", MUTED)}>{t("dashboard.noData")}</div>
      ) : (
        <div className="flex items-center gap-5">
          <div className="relative h-40 w-40 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={data} dataKey="bytes" nameKey="name" innerRadius={54} outerRadius={76} paddingAngle={3} cornerRadius={6} stroke="none">
                  {data.map((_, i) => (
                    <Cell key={i} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip {...tooltipProps} formatter={(val, name) => [formatBytes(Number(val)), name]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <Figure value={formatBytes(total)} className="flex-col !gap-0.5 text-2xl [&>span]:text-[11px]" />
            </div>
          </div>
          <ul className="min-w-0 flex-1 space-y-2">
            {data.map((d, i) => (
              <li key={d.name} className="flex items-center gap-2 text-xs">
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                <span className="flex min-w-0 flex-1" title={d.name}>
                  <span className={clsx("truncate", MUTED)} dir="auto">{d.name}</span>
                </span>
                <span className={clsx("shrink-0 font-semibold tabular-nums", INK_TEXT)} dir="ltr">{formatBytes(d.bytes)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function ModernSuperDashboard({
  username, overview: o, sys, mon, seriesData, totalRangeTraffic, range, setRange,
  pieRange, setPieRange, adminData, inboundData, newClients, livePanels, revenueSlot,
}: {
  username: string;
  overview: any;
  sys: any;
  mon: any;
  seriesData: { label: string; bytes: number }[];
  totalRangeTraffic: number;
  range: "24h" | "7d" | "30d";
  setRange: (r: "24h" | "7d" | "30d") => void;
  pieRange: "allTime" | "24h";
  setPieRange: (r: "allTime" | "24h") => void;
  adminData: Slice[];
  inboundData: Slice[];
  newClients: { date: string; count: number }[];
  livePanels: any[];
  revenueSlot: React.ReactNode;
}) {
  const t = useT();
  const router = useRouter();

  const clientsTotal = Number(o.clients.total) || 0;
  const clientsActive = Number(o.clients.active) || 0;
  const clientsExpired = Number(o.clients.expired) || 0;
  const clientsOther = Math.max(0, clientsTotal - clientsActive - clientsExpired);

  const xray: any[] = (mon?.xray ?? []).filter((x: any) => x.panelType !== "eylan" && x.panelType !== "pasarguard");
  const offline = xray.filter((x) => x.status !== "running");
  const failedJobs = Number(mon?.failedJobs ?? 0);
  const healthy = offline.length === 0 && failedJobs === 0;
  const peak = newClients.reduce((max, d) => Math.max(max, d.count), 0);
  const cleanup = Number(o.clients.cleanupCandidates ?? 0);

  return (
    <div className="space-y-4 pb-4">
      {/* Greeting + the three numbers an operator checks first */}
      <section className="flex flex-col gap-8 px-1 pb-3 pt-2 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0 flex-1">
          <h1 className={clsx("hm-page-title", INK_TEXT)}>{t("dashboard.welcomeBack", { username })}</h1>
          <p className={clsx("mt-1.5 text-sm", MUTED)}>{t("dashboard.superSubtitle")}</p>
          <div className="mt-6">
            <MixBar
              parts={[
                { label: t("common.active"), value: clientsActive, tone: "ink" },
                { label: t("common.expired"), value: clientsExpired, tone: "accent" },
                { label: t("common.disabled"), value: clientsOther, tone: "hatch" },
              ]}
            />
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-x-10 gap-y-6">
          <HeroStat
            icon={Server}
            value={o.panels.total}
            label={t("nav.panels")}
            hint={t("dashboardModern.panelsOnline", { online: o.panels.online, total: o.panels.total })}
          />
          <HeroStat
            icon={UserCog}
            value={o.admins.total}
            label={t("nav.admins")}
            hint={`${o.admins.active} ${t("common.active")}`}
          />
          <HeroStat
            icon={Users}
            value={clientsTotal}
            label={t("nav.clients")}
            hint={`${clientsActive} ${t("common.active")}`}
          />
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Traffic */}
        <div className={clsx(SURFACE, "p-5 lg:col-span-8")}>
          <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className={clsx("text-[15px] font-semibold", INK_TEXT)}>{t("dashboard.trafficVolume")}</h2>
              <div className="mt-2 flex items-baseline gap-2.5">
                <Figure value={formatBytes(totalRangeTraffic)} className="text-3xl sm:text-4xl" />
                <span className={clsx("text-xs", MUTED)}>{t("dashboard.totalInPeriod")}</span>
              </div>
            </div>
            <Pills
              value={range}
              onChange={setRange}
              options={[
                { id: "24h", label: t("dashboard.last24hLong") },
                { id: "7d", label: t("dashboard.last7Days") },
                { id: "30d", label: t("dashboard.last30Days") },
              ]}
            />
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <AreaChart data={seriesData} margin={{ top: 16, right: 8, left: 8, bottom: 0 }}>
              <defs>
                <linearGradient id="hmTraffic" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--hm-accent)" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="var(--hm-accent)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="var(--hm-line)" strokeDasharray="3 5" />
              <XAxis dataKey="label" tick={{ fill: "var(--hm-muted)", fontSize: 11 }} axisLine={false} tickLine={false} dy={10} minTickGap={30} />
              <YAxis tickFormatter={(v) => formatBytes(Number(v))} tick={{ fill: "var(--hm-muted)", fontSize: 11 }} axisLine={false} tickLine={false} dx={-6} width={72} />
              <Tooltip
                {...tooltipProps}
                formatter={(val) => [formatBytes(Number(val)), t("dashboard.traffic")]}
                cursor={{ stroke: "var(--hm-ink)", strokeWidth: 1, strokeDasharray: "3 4" }}
              />
              <Area
                type="monotone"
                dataKey="bytes"
                stroke="var(--hm-accent)"
                strokeWidth={2.5}
                fill="url(#hmTraffic)"
                activeDot={{ r: 5, fill: "var(--hm-accent)", stroke: "var(--hm-surface)", strokeWidth: 2.5 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* System health — the one dark surface on the page */}
        <div className="hm-ink-card flex flex-col rounded-[1.625rem] p-5 lg:col-span-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-semibold">{t("dashboardModern.systemHealth")}</h2>
            <span className="hm-num text-2xl" dir="ltr">
              {o.panels.online}
              <span className="text-white/45">/{o.panels.total}</span>
            </span>
          </div>

          {sys ? (
            <div className="mt-5">
              <div className="mb-3 text-[11px] font-medium text-white/55">{t("dashboardModern.hostLoad")}</div>
              <div className="grid grid-cols-3 gap-4">
                <Meter onDark label={t("dashboard.cpu")} pct={sys.cpu} />
                <Meter onDark label={t("dashboard.ram")} pct={sys.ram} />
                <Meter onDark label={t("dashboard.disk")} pct={sys.disk} />
              </div>
            </div>
          ) : null}

          <div className="mt-5 max-h-72 flex-1 space-y-1.5 overflow-y-auto">
            {xray.map((p) => {
              const up = p.status === "running";
              return (
                <div key={p.panel} className="flex items-center gap-3 rounded-2xl bg-white/[0.06] px-3 py-2.5">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10">
                    <Server size={14} aria-hidden />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-start text-[13px] font-medium"><bdi>{p.panel}</bdi></span>
                  <span className={clsx("flex items-center gap-1.5 text-[11px] font-medium", up ? "text-[#6ee7b7]" : "text-[#fda4af]")}>
                    <span className={clsx("h-1.5 w-1.5 rounded-full", up ? "bg-[#34d399]" : "bg-[#fb7185]")} />
                    {up ? t("common.online") : t("common.offline")}
                  </span>
                </div>
              );
            })}
            {failedJobs > 0 ? (
              <div className="rounded-2xl bg-[#fbbf24]/15 px-3 py-2.5 text-[13px] font-medium text-[#fde68a]">
                {t("dashboard.failedSyncJobs", { count: failedJobs })}
              </div>
            ) : null}
          </div>

          {healthy ? (
            <p className="mt-4 flex items-start gap-2 text-xs leading-relaxed text-white/65">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#34d399]" />
              {t("dashboard.allSystemsNormal")}
            </p>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Tile icon={Activity} label={t("dashboard.todaysUsage")}
          value={o.usage?.today != null ? <Figure value={formatBytes(Number(o.usage.today))} /> : <span className={MUTED}>—</span>} />
        <Tile icon={CalendarDays} label={t("dashboard.monthlyUsage")}
          value={o.usage?.monthly != null ? <Figure value={formatBytes(Number(o.usage.monthly))} /> : <span className={MUTED}>—</span>} />
        <Tile icon={ArchiveX} label={t("dashboard.cleanupReady")} value={<Figure value={cleanup} />}>
          <button
            type="button"
            onClick={() => router.push("/cleanup")}
            className={clsx(
              "flex min-h-9 cursor-pointer items-center gap-1 rounded-full border border-[var(--hm-line)] px-3 text-xs font-semibold outline-none transition-colors hover:bg-zinc-900/[0.05] focus-visible:ring-2 focus-visible:ring-blue-500/60 dark:hover:bg-white/[0.08]",
              INK_TEXT,
            )}
          >
            {t("dashboard.cleanUp")}
            <ArrowUpRight size={13} aria-hidden className="rtl:-scale-x-100" />
          </button>
        </Tile>
        {revenueSlot}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className={clsx(SURFACE, "p-5")}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className={clsx("text-[15px] font-semibold", INK_TEXT)}>{t("dashboard.newClients30d")}</h2>
            <Figure value={newClients.reduce((sum, d) => sum + d.count, 0)} className="text-2xl" />
          </div>
          <ResponsiveContainer width="100%" height={176}>
            <BarChart data={newClients} margin={{ top: 4, right: 0, left: -28, bottom: 0 }} barCategoryGap="28%">
              <CartesianGrid vertical={false} stroke="var(--hm-line)" strokeDasharray="3 5" />
              <XAxis dataKey="date" tick={{ fill: "var(--hm-muted)", fontSize: 10 }} axisLine={false} tickLine={false} dy={8} minTickGap={24} />
              <YAxis tick={{ fill: "var(--hm-muted)", fontSize: 10 }} allowDecimals={false} axisLine={false} tickLine={false} />
              <Tooltip {...tooltipProps} cursor={{ fill: "var(--hm-line)" }} />
              <Bar dataKey="count" name={t("nav.clients")} radius={[6, 6, 6, 6]} maxBarSize={12}>
                {newClients.map((d, i) => (
                  <Cell key={i} fill={peak > 0 && d.count === peak ? "var(--hm-accent)" : "var(--hm-ink)"} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <DonutCard title={t("dashboard.usageByAdmin")} data={adminData} range={pieRange} onRange={setPieRange} />
        <DonutCard title={t("dashboard.usageByInbound")} data={inboundData} range={pieRange} onRange={setPieRange} />
      </div>

      {/* Live nodes */}
      <div className={clsx(SURFACE, "p-5")}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className={clsx("flex items-center gap-2 text-[15px] font-semibold", INK_TEXT)}>
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-60 motion-safe:animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            {t("dashboard.liveNodes")}
          </h2>
          <span className={clsx("text-xs", MUTED)}>{t("dashboard.liveStreamHint")}</span>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
          {livePanels.map((p) => (
            <div key={p.panelId} className="rounded-3xl border border-[var(--hm-line)] bg-zinc-50/70 p-4 dark:bg-white/[0.03]">
              <div className="mb-4 flex items-center justify-between gap-2">
                <span className={clsx("min-w-0 truncate text-sm font-semibold", INK_TEXT)} dir="auto">{p.panelName}</span>
                <span className={clsx("flex shrink-0 items-center gap-1.5 text-[11px] font-medium", p.online ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400")}>
                  <span className={clsx("h-1.5 w-1.5 rounded-full", p.online ? "bg-emerald-500" : "bg-rose-500")} />
                  {p.online ? t("common.online") : t("common.offline")}
                </span>
              </div>
              {p.online ? (
                <>
                  <div className="space-y-3">
                    <Meter label={t("dashboard.cpu")} pct={p.cpu} />
                    <Meter label={t("dashboard.ram")} pct={p.ram} />
                    <Meter label={t("dashboard.disk")} pct={p.disk} />
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                    <div className="rounded-2xl bg-[var(--hm-surface)] px-3 py-2">
                      <div className={MUTED}>↑ {t("common.upload")}</div>
                      <div className={clsx("mt-0.5 font-semibold tabular-nums", INK_TEXT)} dir="ltr">{(p.up / (1024 * 1024)).toFixed(2)} MB/s</div>
                    </div>
                    <div className="rounded-2xl bg-[var(--hm-surface)] px-3 py-2">
                      <div className={MUTED}>↓ {t("common.download")}</div>
                      <div className={clsx("mt-0.5 font-semibold tabular-nums", INK_TEXT)} dir="ltr">{(p.down / (1024 * 1024)).toFixed(2)} MB/s</div>
                    </div>
                  </div>
                  <div className={clsx("mt-3 flex justify-between text-[11px]", MUTED)}>
                    <span>
                      {t("dashboard.xray")}{" "}
                      <span className={p.xrayStatus === "running" ? "font-medium text-emerald-600 dark:text-emerald-400" : "font-medium text-rose-600 dark:text-rose-400"}>{p.xrayStatus}</span>
                    </span>
                    <span dir="ltr">v{p.panelVersion}{p.latencyMs > 0 ? ` · ${p.latencyMs}ms` : ""}</span>
                  </div>
                </>
              ) : (
                <div className={clsx("flex flex-col items-center gap-2.5 py-9 text-center text-xs", MUTED)}>
                  <Wifi size={20} aria-hidden className="opacity-50" />
                  {t("dashboard.panelUnreachable")}
                </div>
              )}
            </div>
          ))}
          {livePanels.length === 0 ? (
            <div className={clsx("col-span-full py-12 text-center text-sm", MUTED)}>
              <Spinner size={18} className="mx-auto mb-3" />
              {t("dashboard.connectingStream")}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Reseller greeting: quota strip + the three limits that decide what they can still sell. */
export function ModernResellerHero({
  username, account: a, clientCount, expiryLabel,
}: {
  username: string;
  account: any;
  clientCount: number;
  expiryLabel: string;
}) {
  const t = useT();
  const used = Number(a.usedTraffic || 0);
  const available = Math.max(0, Number(a.availableTraffic || 0));

  return (
    <section className="flex flex-col gap-8 px-1 pb-2 pt-2 xl:flex-row xl:items-end xl:justify-between">
      <div className="min-w-0 flex-1">
        <h1 className={clsx("hm-page-title", INK_TEXT)}>{t("dashboard.welcomeBack", { username })}</h1>
        <p className={clsx("mt-1.5 text-sm leading-relaxed", MUTED)}>{t("dashboard.resellerSubtitle")}</p>
        {!a.unlimitedTraffic && used + available > 0 ? (
          <div className="mt-6">
            <MixBar
              parts={[
                { label: t("dashboardModern.used"), value: used, tone: "ink" },
                { label: t("dashboardModern.remaining"), value: available, tone: "hatch" },
              ]}
            />
          </div>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap gap-x-10 gap-y-6">
        <HeroStat
          icon={HardDrive}
          value={a.unlimitedTraffic ? "∞" : <Figure value={formatBytes(available)} className="!text-[1em]" />}
          label={t("clients.availableTraffic")}
          hint={a.unlimitedTraffic ? t("dashboard.unlimitedTrafficNote") : t("clients.outOf", { total: formatBytes(a.allTimeTraffic) })}
        />
        <HeroStat
          icon={Users}
          value={`${clientCount}/${a.clientCapacity === 0 ? "∞" : a.clientCapacity}`}
          label={t("clients.clientCapacity")}
          hint={t("dashboard.totalAllowedClients")}
        />
        <HeroStat
          icon={CalendarDays}
          value={<span dir="auto" className="text-2xl sm:text-3xl">{expiryLabel}</span>}
          label={t("clients.subscriptionExpiry")}
          hint={t("dashboard.untilAccountExpiration")}
        />
      </div>
    </section>
  );
}
