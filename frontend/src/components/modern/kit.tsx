"use client";

/**
 * Building blocks for the "modern" look. Pages use these only when useUiStyle().modern is
 * true, so the classic layout keeps its own markup. Colours come from the --hm-* tokens in
 * ui-modern.css, which exist only under html[data-ui="modern"].
 */

import { clsx } from "clsx";
import { Search, X } from "lucide-react";

export const M_SURFACE =
  "rounded-[1.625rem] border border-[var(--hm-line)] bg-[var(--hm-card)] shadow-[var(--hm-shadow-card)]";
export const M_MUTED = "text-zinc-500 dark:text-zinc-400";
export const M_INK = "text-zinc-900 dark:text-zinc-50";
export const M_FOCUS = "outline-none focus-visible:ring-2 focus-visible:ring-blue-500/60";

export function MSurface({
  children,
  className,
  as: Tag = "div",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "div" | "section";
}) {
  return <Tag className={clsx(M_SURFACE, className)}>{children}</Tag>;
}

/** Title block used at the top of every modern page. */
export function MHero({
  title,
  subtitle,
  actions,
  aside,
  children,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  /** Right-hand (end) content on wide screens, usually big numbers. */
  aside?: React.ReactNode;
  /** Content under the title, e.g. a proportion strip or filter pills. */
  children?: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-6 px-1 pb-1 pt-2 xl:flex-row xl:items-end xl:justify-between">
      <div className="min-w-0 flex-1">
        <h1 className={clsx("hm-page-title", M_INK)}>{title}</h1>
        {subtitle ? <p className={clsx("mt-1.5 text-sm leading-relaxed", M_MUTED)}>{subtitle}</p> : null}
        {actions ? <div className="mt-4 flex flex-wrap items-center gap-2 xl:hidden">{actions}</div> : null}
        {children ? <div className="mt-5">{children}</div> : null}
      </div>
      {aside || actions ? (
        <div className="flex shrink-0 flex-col items-stretch gap-5 xl:items-end">
          {actions ? <div className="hidden flex-wrap items-center gap-2 xl:flex">{actions}</div> : null}
          {aside}
        </div>
      ) : null}
    </section>
  );
}

/** Big light numeral with a small caption — the signature stat. */
export function MBigStat({
  value,
  label,
  hint,
  icon: Icon,
  size = "lg",
}: {
  value: React.ReactNode;
  label: string;
  hint?: React.ReactNode;
  icon?: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
  size?: "md" | "lg";
}) {
  return (
    <div className="min-w-0">
      <div className="flex items-end gap-2.5">
        {Icon ? (
          <span className="mb-1.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-zinc-900/[0.06] text-zinc-600 dark:bg-white/[0.08] dark:text-zinc-300">
            <Icon size={15} aria-hidden />
          </span>
        ) : null}
        <span className={clsx("hm-num", M_INK, size === "lg" ? "text-3xl sm:text-4xl" : "text-2xl sm:text-3xl")} dir="ltr">
          {value}
        </span>
      </div>
      <div className={clsx("mt-2 text-xs font-medium", M_INK)}>{label}</div>
      {hint ? <div className={clsx("mt-0.5 text-[11px]", M_MUTED)}>{hint}</div> : null}
    </div>
  );
}

/**
 * Row of headline numbers for a hero: label on top, number below, hairline dividers.
 * Stays three columns on phones with smaller numerals so it never wraps awkwardly.
 */
export function MStatStrip({
  items,
  className,
}: {
  items: {
    label: string;
    value: React.ReactNode;
    hint?: React.ReactNode;
    icon?: React.ComponentType<{ size?: number; "aria-hidden"?: boolean }>;
    tone?: "default" | "alert";
  }[];
  className?: string;
}) {
  return (
    <div
      className={clsx(
        "grid w-full grid-cols-2 gap-y-3 rounded-[1.5rem] border border-[var(--hm-line)] bg-[var(--hm-card)] py-3.5 shadow-[var(--hm-shadow-card)] sm:[grid-template-columns:repeat(var(--hm-n),minmax(0,1fr))] sm:gap-y-0 sm:divide-x sm:divide-[var(--hm-line)] xl:w-auto",
        items.length === 1 && "grid-cols-1",
        className,
      )}
      style={{ ["--hm-n" as string]: items.length }}
    >
      {items.map(({ label, value, hint, icon: Icon, tone }, index) => (
        <div
          key={label}
          className={clsx(
            "min-w-0 px-4 sm:px-5 xl:min-w-[8.5rem]",
            items.length % 2 === 1 && index === items.length - 1 && items.length > 1 && "col-span-2 sm:col-span-1",
          )}
        >
          <div className={clsx("flex items-center gap-1.5 text-[11px] font-medium sm:text-xs", M_MUTED)}>
            {Icon ? <Icon size={13} aria-hidden /> : null}
            <span className="truncate">{label}</span>
          </div>
          <div
            className={clsx(
              "hm-num mt-1.5 text-[1.375rem] sm:text-[1.875rem]",
              tone === "alert" ? "text-rose-600 dark:text-rose-400" : M_INK,
            )}
            dir="ltr"
            style={{ textAlign: "start" }}
          >
            {value}
          </div>
          {hint ? <div className={clsx("mt-1 truncate text-[11px]", M_MUTED)}>{hint}</div> : null}
        </div>
      ))}
    </div>
  );
}

/** "147 GB" → big figure + small unit. */
export function MFigure({ value, className }: { value: string | number; className?: string }) {
  const [num, ...rest] = String(value).split(" ");
  return (
    <span className={clsx("hm-num inline-flex items-baseline gap-1.5", M_INK, className)} dir="ltr">
      {num}
      {rest.length ? (
        <span className="text-[0.4em] font-medium tracking-normal text-zinc-500">{rest.join(" ")}</span>
      ) : null}
    </span>
  );
}

/** Labelled proportional strip: solid ink, accent, hatched remainder. */
export function MMixBar({
  parts,
  className,
}: {
  parts: { label: string; value: number; tone: "ink" | "accent" | "hatch" | "outline" }[];
  className?: string;
}) {
  const total = parts.reduce((sum, p) => sum + Math.max(0, p.value), 0);
  if (total <= 0) return null;
  return (
    <div className={clsx("flex w-full max-w-2xl gap-1.5", className)}>
      {parts
        .filter((p) => p.value > 0)
        .map((p) => {
          const pct = (p.value / total) * 100;
          return (
            <div key={p.label} className="min-w-[4.5rem]" style={{ flex: `${Math.max(pct, 1)} 1 0%` }}>
              <div className={clsx("mb-1.5 truncate ps-1 text-xs font-medium", M_MUTED)}>{p.label}</div>
              <div
                className={clsx(
                  "flex h-10 items-center rounded-full px-3.5 text-xs font-semibold tabular-nums",
                  p.tone === "ink" && "hm-ink",
                  p.tone === "accent" && "bg-[var(--hm-accent)] text-white",
                  p.tone === "hatch" && clsx("hm-hatch", M_INK),
                  p.tone === "outline" && clsx("border border-zinc-400/70", M_INK),
                )}
              >
                <span dir="ltr">{pct >= 10 ? pct.toFixed(0) : pct.toFixed(pct < 1 ? 1 : 0)}%</span>
              </div>
            </div>
          );
        })}
    </div>
  );
}

/** Small circular progress. `pct` null = unlimited (full faint ring with ∞). */
export function MRing({
  pct,
  size = 40,
  stroke = 4,
  label,
  tone,
}: {
  pct: number | null;
  size?: number;
  stroke?: number;
  label?: React.ReactNode;
  tone?: "auto" | "accent" | "ink" | "onDark";
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const safe = pct == null ? 0 : Math.max(0, Math.min(100, pct));
  const auto = tone === undefined || tone === "auto";
  const color =
    tone === "onDark"
      ? "#ffffff"
      : tone === "ink"
        ? "var(--hm-ink)"
        : auto && safe >= 90
          ? "#e11d48"
          : auto && safe >= 70
            ? "#d97706"
            : "var(--hm-accent)";
  return (
    <span className="relative inline-flex shrink-0 items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          stroke={tone === "onDark" ? "rgb(255 255 255 / 0.14)" : "var(--hm-line)"}
          strokeDasharray={pct == null ? "2 4" : undefined}
        />
        {pct != null ? (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            strokeWidth={stroke}
            stroke={color}
            strokeLinecap="round"
            strokeDasharray={`${(safe / 100) * c} ${c}`}
          />
        ) : null}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[10px] font-semibold tabular-nums" dir="ltr">
        {label ?? (pct == null ? "∞" : `${Math.round(safe)}%`)}
      </span>
    </span>
  );
}

/** Pill tabs / filters. Each option may carry a count. */
export function MPills<T extends string>({
  value,
  options,
  onChange,
  size = "md",
  className,
  label,
}: {
  value: T;
  options: { id: T; label: string; count?: number | null; dot?: string }[];
  onChange: (next: T) => void;
  size?: "sm" | "md";
  className?: string;
  label?: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className={clsx(
        "hide-scrollbar flex max-w-full gap-0.5 overflow-x-auto rounded-full border border-[var(--hm-line)] bg-zinc-100/70 p-1 dark:bg-white/[0.04]",
        className,
      )}
    >
      {options.map((opt) => {
        const active = opt.id === value;
        return (
          <button
            key={opt.id || "all"}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.id)}
            className={clsx(
              "flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-full transition-colors duration-150",
              M_FOCUS,
              size === "sm" ? "h-7 px-2.5 text-[11px]" : "h-8 px-3.5 text-xs",
              active
                ? "hm-ink font-semibold"
                : clsx("font-medium hover:text-zinc-900 dark:hover:text-zinc-100", M_MUTED),
            )}
          >
            {opt.dot ? <span className={clsx("h-1.5 w-1.5 rounded-full", opt.dot)} aria-hidden /> : null}
            {opt.label}
            {opt.count != null ? (
              <span
                className={clsx(
                  "min-w-5 rounded-full px-1.5 py-px text-center text-[10px] font-semibold tabular-nums",
                  active ? "bg-white/20" : "bg-zinc-900/[0.06] dark:bg-white/10",
                )}
              >
                {opt.count}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function MSearch({
  value,
  onChange,
  placeholder,
  className,
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <label className={clsx("relative block", className)}>
      <Search size={16} className="pointer-events-none absolute start-4 top-1/2 -translate-y-1/2 text-zinc-400" aria-hidden />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-11 w-full rounded-full border border-[var(--hm-line)] bg-[var(--hm-surface)] ps-11 pe-10 text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-50 [&::-webkit-search-cancel-button]:hidden"
      />
      {value ? (
        <button
          type="button"
          onClick={() => onChange("")}
          aria-label="Clear"
          className={clsx("absolute end-2.5 top-1/2 flex h-7 w-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-zinc-400 hover:bg-zinc-900/[0.06] hover:text-zinc-700 dark:hover:bg-white/10", M_FOCUS)}
        >
          <X size={14} />
        </button>
      ) : null}
    </label>
  );
}

export function MSelect({
  value,
  onChange,
  children,
  className,
  label,
}: {
  value: string;
  onChange: (next: string) => void;
  children: React.ReactNode;
  className?: string;
  label: string;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
      className={clsx(
        "h-11 cursor-pointer rounded-full border border-[var(--hm-line)] bg-[var(--hm-surface)] px-4 text-sm text-zinc-700 outline-none dark:text-zinc-200",
        className,
      )}
    >
      {children}
    </select>
  );
}

const AVATAR_TONES = [
  "bg-[#dbe6ff] text-[#1d4ed8] dark:bg-[#1e3a8a]/50 dark:text-[#bfd2ff]",
  "bg-[#e9e2ff] text-[#6d28d9] dark:bg-[#4c1d95]/50 dark:text-[#ddd0ff]",
  "bg-[#d9f2ea] text-[#047857] dark:bg-[#064e3b]/60 dark:text-[#b7ebd8]",
  "bg-[#fde9d7] text-[#b45309] dark:bg-[#78350f]/50 dark:text-[#fbd7b0]",
  "bg-[#e4e7ec] text-[#383d47] dark:bg-white/10 dark:text-zinc-200",
];

function hashString(text: string) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Initials avatar; the colour is stable per name. */
export function MAvatar({
  name,
  size = 36,
  online,
  className,
}: {
  name: string;
  size?: number;
  online?: boolean;
  className?: string;
}) {
  const clean = (name || "?").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  const words = clean.split(" ").filter((w) => /^\p{L}/u.test(w));
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : (words[0] || clean).slice(0, 1)).toUpperCase();
  return (
    <span
      className={clsx(
        "relative inline-flex shrink-0 items-center justify-center rounded-full font-semibold",
        AVATAR_TONES[hashString(name) % AVATAR_TONES.length],
        className,
      )}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      aria-hidden
    >
      {initials || "?"}
      {online ? (
        <span className="absolute -bottom-0.5 -end-0.5 h-3 w-3 rounded-full border-2 border-[var(--hm-surface)] bg-emerald-500" />
      ) : null}
    </span>
  );
}

export type MTone = "ok" | "live" | "warn" | "bad" | "off" | "info";

const PILL_TONES: Record<MTone, string> = {
  ok: "bg-[var(--hm-accent-soft)] text-[var(--hm-accent)]",
  live: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  warn: "bg-amber-500/14 text-amber-700 dark:text-amber-300",
  bad: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
  off: "bg-zinc-900/[0.06] text-zinc-600 dark:bg-white/[0.08] dark:text-zinc-300",
  info: "bg-violet-500/12 text-violet-700 dark:text-violet-300",
};
const DOT_TONES: Record<MTone, string> = {
  ok: "bg-[var(--hm-accent)]",
  live: "bg-emerald-500",
  warn: "bg-amber-500",
  bad: "bg-rose-500",
  off: "bg-zinc-400",
  info: "bg-violet-500",
};

export function MStatusPill({
  tone,
  children,
  pulse,
  className,
}: {
  tone: MTone;
  children: React.ReactNode;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex h-6 items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 text-[11px] font-semibold",
        PILL_TONES[tone],
        className,
      )}
    >
      <span className="relative flex h-1.5 w-1.5">
        {pulse ? (
          <span className={clsx("absolute inline-flex h-full w-full rounded-full opacity-60 motion-safe:animate-ping", DOT_TONES[tone])} />
        ) : null}
        <span className={clsx("relative inline-flex h-1.5 w-1.5 rounded-full", DOT_TONES[tone])} />
      </span>
      {children}
    </span>
  );
}

/** Round icon button used for row actions. */
export function MIconButton({
  label,
  onClick,
  children,
  tone = "default",
  className,
}: {
  label: string;
  onClick: (e: React.MouseEvent) => void;
  children: React.ReactNode;
  tone?: "default" | "danger" | "accent" | "live";
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={clsx(
        "flex h-9 w-9 shrink-0 cursor-pointer items-center justify-center rounded-full transition-colors duration-150",
        M_FOCUS,
        tone === "danger" && "text-zinc-500 hover:bg-rose-500/10 hover:text-rose-600 dark:text-zinc-400 dark:hover:text-rose-400",
        tone === "accent" && "text-zinc-500 hover:bg-[var(--hm-accent-soft)] hover:text-[var(--hm-accent)] dark:text-zinc-400",
        tone === "live" && "text-emerald-600 hover:bg-emerald-500/10 dark:text-emerald-400",
        tone === "default" && "text-zinc-500 hover:bg-zinc-900/[0.06] hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-white/[0.08] dark:hover:text-zinc-50",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function MPrimaryButton({
  children,
  onClick,
  disabled,
  title,
  variant = "primary",
}: {
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
  variant?: "primary" | "ghost" | "ink";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={clsx(
        "flex h-11 cursor-pointer items-center gap-2 rounded-full px-5 text-sm font-semibold transition-colors duration-150 disabled:pointer-events-none disabled:opacity-50",
        M_FOCUS,
        variant === "primary" && "bg-blue-600 text-white hover:bg-blue-500",
        variant === "ink" && "hm-ink hover:opacity-90",
        variant === "ghost" &&
          "border border-[var(--hm-line)] bg-[var(--hm-surface)] text-zinc-800 hover:bg-zinc-50 dark:text-zinc-100 dark:hover:bg-white/[0.06]",
      )}
    >
      {children}
    </button>
  );
}

/** Thin labelled progress bar. */
export function MBar({
  pct,
  tone = "auto",
  className,
  onDark,
}: {
  pct: number;
  tone?: "auto" | "accent" | "ink";
  className?: string;
  onDark?: boolean;
}) {
  const safe = Math.max(0, Math.min(100, Number(pct) || 0));
  const color =
    tone === "ink"
      ? onDark ? "bg-white" : "bg-[var(--hm-ink)]"
      : tone === "auto" && safe >= 90
        ? "bg-rose-500"
        : tone === "auto" && safe >= 70
          ? "bg-amber-500"
          : onDark
            ? "bg-white"
            : "bg-[var(--hm-accent)]";
  return (
    <div className={clsx("h-1.5 w-full overflow-hidden rounded-full", onDark ? "bg-white/[0.14]" : "bg-zinc-900/[0.07] dark:bg-white/10", className)}>
      <div className={clsx("h-full rounded-full", color)} style={{ width: `${safe}%` }} />
    </div>
  );
}

export function MSectionTitle({
  children,
  hint,
  action,
}: {
  children: React.ReactNode;
  hint?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h2 className={clsx("text-[15px] font-semibold", M_INK)}>{children}</h2>
        {hint ? <p className={clsx("mt-0.5 text-xs", M_MUTED)}>{hint}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function MEmpty({
  icon: Icon,
  title,
  hint,
  action,
}: {
  icon: React.ComponentType<{ size?: number; className?: string }>;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--hm-accent-soft)] text-[var(--hm-accent)]">
        <Icon size={22} />
      </span>
      <div className={clsx("text-sm font-semibold", M_INK)}>{title}</div>
      {hint ? <p className={clsx("max-w-sm text-xs leading-relaxed", M_MUTED)}>{hint}</p> : null}
      {action}
    </div>
  );
}
