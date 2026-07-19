/** Shared timezone helpers — default Asia/Tehran for Iran-first installs. */

export const DEFAULT_DISPLAY_TIMEZONE = "Asia/Tehran";

export const COMMON_TIMEZONES = [
  "Asia/Tehran",
  "UTC",
  "Asia/Dubai",
  "Asia/Istanbul",
  "Europe/London",
  "Europe/Berlin",
  "America/New_York",
] as const;

export type FormatInTzOptions = Intl.DateTimeFormatOptions & {
  locale?: string;
};

export function formatInTz(
  value: string | number | Date,
  timeZone: string = DEFAULT_DISPLAY_TIMEZONE,
  options: FormatInTzOptions = {},
): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  const { locale = "en-GB", ...fmt } = options;
  try {
    return d.toLocaleString(locale, { timeZone, ...fmt });
  } catch {
    return d.toLocaleString(locale, fmt);
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
  });
}

export function formatDateTimeInTz(
  value: string | number | Date,
  timeZone: string = DEFAULT_DISPLAY_TIMEZONE,
  locale = "en-GB",
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
