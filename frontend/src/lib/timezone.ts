/** Shared timezone + calendar helpers — default Asia/Tehran, Jalali display. */

export const DEFAULT_DISPLAY_TIMEZONE = "Asia/Tehran";
export type DisplayCalendar = "jalali" | "gregorian";
export const DEFAULT_DISPLAY_CALENDAR: DisplayCalendar = "jalali";

export const COMMON_TIMEZONES = [
  "Asia/Tehran",
  "UTC",
  "Asia/Dubai",
  "Asia/Istanbul",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
] as const;

let cachedDisplayCalendar: DisplayCalendar = DEFAULT_DISPLAY_CALENDAR;

export function setDisplayCalendar(cal: string | null | undefined) {
  cachedDisplayCalendar = cal === "gregorian" ? "gregorian" : "jalali";
}

export function getDisplayCalendar(): DisplayCalendar {
  return cachedDisplayCalendar || DEFAULT_DISPLAY_CALENDAR;
}

/** Resolve Intl locale for date formatting from calendar + optional UI locale. */
export function resolveDateLocale(
  calendar: DisplayCalendar = getDisplayCalendar(),
  uiLocale?: string | null,
): string {
  const isFa =
    uiLocale?.toLowerCase().startsWith("fa") ||
    (typeof document !== "undefined" &&
      (document.documentElement.lang || "").toLowerCase().startsWith("fa"));
  if (calendar === "jalali") {
    return isFa ? "fa-IR-u-ca-persian" : "en-US-u-ca-persian";
  }
  return isFa ? "fa-IR" : "en-GB";
}

/**
 * Note: use `displayCalendar` (not Intl's `calendar`) to avoid clashing with
 * `Intl.DateTimeFormatOptions.calendar: string`.
 */
export type FormatInTzOptions = Omit<Intl.DateTimeFormatOptions, "calendar"> & {
  locale?: string;
  displayCalendar?: DisplayCalendar;
  uiLocale?: string | null;
};

export function formatInTz(
  value: string | number | Date,
  timeZone: string = DEFAULT_DISPLAY_TIMEZONE,
  options: FormatInTzOptions = {},
): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const {
    locale: explicitLocale,
    displayCalendar = getDisplayCalendar(),
    uiLocale,
    ...fmt
  } = options;
  const locale =
    explicitLocale || resolveDateLocale(displayCalendar, uiLocale ?? undefined);
  try {
    return d.toLocaleString(locale, { timeZone, ...fmt });
  } catch {
    try {
      return d.toLocaleString(locale, fmt);
    } catch {
      return d.toLocaleString("en-GB", fmt);
    }
  }
}

export function formatClockInTz(
  value: string | number | Date = new Date(),
  timeZone: string = DEFAULT_DISPLAY_TIMEZONE,
): string {
  return formatInTz(value, timeZone, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    // Clocks stay Gregorian numerals in panel chrome
    displayCalendar: "gregorian",
    locale: "en-GB",
  });
}

export function formatDateTimeInTz(
  value: string | number | Date,
  timeZone: string = DEFAULT_DISPLAY_TIMEZONE,
  locale?: string,
): string {
  return formatInTz(value, timeZone, {
    locale,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
