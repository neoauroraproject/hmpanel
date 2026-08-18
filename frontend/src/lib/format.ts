import {
  DEFAULT_DISPLAY_TIMEZONE,
  formatInTz,
  setDisplayCalendar as setTzCalendar,
  getDisplayCalendar,
} from "@/lib/timezone";

export {
  setDisplayCalendar,
  getDisplayCalendar,
  type DisplayCalendar,
} from "@/lib/timezone";

/** Keep Latin units like "30 GB" ordered LTR inside Persian RTL layouts. */
export function ltrIsolate(text: string): string {
  return `\u2066${text}\u2069`;
}

/** Format a byte count (number, string, or bigint) into a human-readable string. */
export function formatBytes(value: string | number | bigint): string {
  const bytes = typeof value === "string" ? Number(value) : Number(value);
  if (!bytes || bytes <= 0) return ltrIsolate("0 B");
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const n = bytes / Math.pow(1024, i);
  return ltrIsolate(`${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`);
}

export type UiLocale = "fa" | "en";

export function resolveUiLocale(explicit?: string | null): UiLocale {
  if (explicit && explicit.toLowerCase().startsWith("fa")) return "fa";
  if (typeof document !== "undefined") {
    const lang = document.documentElement.lang || "";
    if (lang.toLowerCase().startsWith("fa")) return "fa";
  }
  return "en";
}

/** Localized traffic size — Persian uses گیگ/ترابایت so RTL doesn't scramble "GB". */
export function formatBytesLocalized(
  value: string | number | bigint,
  locale: UiLocale | string = "en",
): string {
  const bytes = typeof value === "string" ? Number(value) : Number(value);
  if (!bytes || bytes <= 0) return resolveUiLocale(locale) === "fa" ? "۰ بایت" : "0 B";
  const isFa = resolveUiLocale(locale) === "fa";
  const units = isFa
    ? ["بایت", "کیلوبایت", "مگابایت", "گیگ", "ترابایت", "پتابایت"]
    : ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const n = bytes / Math.pow(1024, i);
  const num = n.toFixed(n >= 10 || i === 0 ? 0 : 1);
  return ltrIsolate(`${num} ${units[i]}`);
}

export function formatDaysLocalized(
  days: number,
  locale: UiLocale | string = "en",
): string {
  const n = Math.max(0, Math.round(Number(days) || 0));
  if (resolveUiLocale(locale) === "fa") return `${n} روز`;
  return n === 1 ? "1 day" : `${n} days`;
}

/**
 * Bidi-safe plan/product quota line.
 * Always traffic first, then days (e.g. "500 گیگ · 90 روز" / "500 GB · 90 days").
 * Each segment is wrapped in Unicode isolates so RTL layouts don't reorder units.
 */
export function formatQuotaLabel(
  trafficBytes?: string | number | bigint | null,
  durationDays?: number | null,
  opts?: {
    locale?: string | null;
    maxClients?: number | null;
    clientsLabelFa?: string;
    clientsLabelEn?: string;
  },
): string {
  const locale = resolveUiLocale(opts?.locale);
  const parts: string[] = [];
  const bytes = Number(trafficBytes || 0);
  if (bytes > 0) parts.push(formatBytesLocalized(bytes, locale));
  const days = Number(durationDays || 0);
  if (days > 0) parts.push(formatDaysLocalized(days, locale));
  const clients = Number(opts?.maxClients || 0);
  if (clients > 0) {
    parts.push(
      locale === "fa"
        ? `${clients} ${opts?.clientsLabelFa || "کاربر"}`
        : `+${clients} ${opts?.clientsLabelEn || "clients"}`,
    );
  }
  if (!parts.length) return "—";
  // FSI … PDI keeps each segment visually ordered inside RTL paragraphs.
  return parts.map((p) => `\u2068${p}\u2069`).join(" · ");
}

let cachedDisplayTz: string = DEFAULT_DISPLAY_TIMEZONE;

/** Called when settings load so UI dates follow panel timezone. */
export function setDisplayTimezone(tz: string | null | undefined) {
  cachedDisplayTz =
    typeof tz === "string" && tz.trim() ? tz.trim() : DEFAULT_DISPLAY_TIMEZONE;
}

export function getDisplayTimezone() {
  return cachedDisplayTz || DEFAULT_DISPLAY_TIMEZONE;
}

/** Apply calendar setting from bootstrap / settings UI. */
export function applyDisplayCalendar(cal: string | null | undefined) {
  setTzCalendar(cal);
}

function dateFmtOpts(
  extra: Omit<Intl.DateTimeFormatOptions, "calendar"> = {},
) {
  const ui = resolveUiLocale();
  return {
    displayCalendar: getDisplayCalendar(),
    uiLocale: ui,
    ...extra,
  };
}

export function formatDate(iso: string | number | Date): string {
  return formatInTz(
    iso,
    getDisplayTimezone(),
    dateFmtOpts({
      year: "numeric",
      month: "short",
      day: "numeric",
    }),
  );
}

export function formatDateTime(iso: string | number | Date): string {
  return formatInTz(
    iso,
    getDisplayTimezone(),
    dateFmtOpts({
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
  );
}

/** License expiry ISO string with days remaining. */
export function formatLicenseExpiry(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  const label = formatInTz(
    d,
    getDisplayTimezone(),
    dateFmtOpts({
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
  );
  const ui = resolveUiLocale();
  if (days < 0) return ui === "fa" ? `${label} (منقضی)` : `${label} (expired)`;
  if (days === 0) return ui === "fa" ? `${label} (امروز)` : `${label} (today)`;
  if (days === 1) return ui === "fa" ? `${label} (۱ روز)` : `${label} (1 day)`;
  return ui === "fa" ? `${label} (${days} روز)` : `${label} (${days} days)`;
}

/** Render a unix-ms expiry (stored as a stringified bigint). 0 = never. */
export function formatExpiry(value: string): string {
  const ms = Number(value);
  const ui = resolveUiLocale();
  if (!ms) return ui === "fa" ? "هرگز" : "Never";
  // Negative = first-use duration (days) in 3x-ui style
  if (ms < 0) {
    const days = Math.ceil(Math.abs(ms) / 86_400_000);
    return ui === "fa" ? `${days} روز (اولین اتصال)` : `${days}d (first use)`;
  }
  const days = Math.ceil((ms - Date.now()) / 86_400_000);
  const label = formatInTz(
    ms,
    getDisplayTimezone(),
    dateFmtOpts({
      month: "short",
      day: "numeric",
      year: "numeric",
    }),
  );
  if (days < 0) return ui === "fa" ? `${label} (منقضی)` : `${label} (expired)`;
  return ui === "fa" ? `${label} (${days} روز)` : `${label} (${days}d)`;
}

export function isExpired(value: string): boolean {
  const ms = Number(value);
  return ms > 0 && ms < Date.now();
}
