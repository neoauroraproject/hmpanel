/** Shared timezone helpers for Nest backend (CommonJS-friendly). */

export const DEFAULT_DISPLAY_TIMEZONE = 'Asia/Tehran';

export const COMMON_TIMEZONES = [
  'Asia/Tehran',
  'UTC',
  'Asia/Dubai',
  'Asia/Istanbul',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
] as const;

export function formatInTz(
  value: string | number | Date,
  timeZone: string = DEFAULT_DISPLAY_TIMEZONE,
  options: Intl.DateTimeFormatOptions = {},
  locale = 'en-GB',
): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);
  try {
    return d.toLocaleString(locale, { timeZone, ...options });
  } catch {
    return d.toLocaleString(locale, options);
  }
}

export function formatClockInTz(
  value: string | number | Date = new Date(),
  timeZone: string = DEFAULT_DISPLAY_TIMEZONE,
): string {
  return formatInTz(value, timeZone, {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export function formatDateTimeInTz(
  value: string | number | Date,
  timeZone: string = DEFAULT_DISPLAY_TIMEZONE,
): string {
  return formatInTz(value, timeZone, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
