/** Shared timezone helpers for Nest backend (CommonJS-friendly). */

export const DEFAULT_DISPLAY_TIMEZONE = 'Asia/Tehran';
export type DisplayCalendar = 'jalali' | 'gregorian';
export const DEFAULT_DISPLAY_CALENDAR: DisplayCalendar = 'jalali';

export const COMMON_TIMEZONES = [
  'Asia/Tehran',
  'UTC',
  'Asia/Dubai',
  'Asia/Istanbul',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
] as const;

export function resolveDateLocale(
  calendar: DisplayCalendar = DEFAULT_DISPLAY_CALENDAR,
  uiLocale?: string | null,
): string {
  const isFa = Boolean(uiLocale?.toLowerCase().startsWith('fa'));
  if (calendar === 'jalali') {
    return isFa ? 'fa-IR-u-ca-persian' : 'en-US-u-ca-persian';
  }
  return isFa ? 'fa-IR' : 'en-GB';
}

export function formatInTz(
  value: string | number | Date,
  timeZone: string = DEFAULT_DISPLAY_TIMEZONE,
  options: Intl.DateTimeFormatOptions = {},
  localeOrCalendar: string | DisplayCalendar = 'en-GB',
  uiLocale?: string | null,
): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return String(value);

  let locale: string;
  if (localeOrCalendar === 'jalali' || localeOrCalendar === 'gregorian') {
    locale = resolveDateLocale(localeOrCalendar, uiLocale);
  } else {
    locale = localeOrCalendar || 'en-GB';
  }

  try {
    return d.toLocaleString(locale, { timeZone, ...options });
  } catch {
    try {
      return d.toLocaleString(locale, options);
    } catch {
      return d.toLocaleString('en-GB', options);
    }
  }
}

export function formatClockInTz(
  value: string | number | Date = new Date(),
  timeZone: string = DEFAULT_DISPLAY_TIMEZONE,
): string {
  return formatInTz(
    value,
    timeZone,
    {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    },
    'en-GB',
  );
}

export function formatDateTimeInTz(
  value: string | number | Date,
  timeZone: string = DEFAULT_DISPLAY_TIMEZONE,
  calendar: DisplayCalendar = DEFAULT_DISPLAY_CALENDAR,
  uiLocale?: string | null,
): string {
  return formatInTz(
    value,
    timeZone,
    {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    },
    calendar,
    uiLocale,
  );
}
