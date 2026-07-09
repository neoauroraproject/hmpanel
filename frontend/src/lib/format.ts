/** Format a byte count (number, string, or bigint) into a human-readable string. */
export function formatBytes(value: string | number | bigint): string {
  const bytes = typeof value === "string" ? Number(value) : Number(value);
  if (!bytes || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const n = bytes / Math.pow(1024, i);
  return `${n.toFixed(n >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** License expiry ISO string with days remaining, e.g. "Aug 9, 2026 (31 days)". */
export function formatLicenseExpiry(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const days = Math.ceil((d.getTime() - Date.now()) / 86_400_000);
  const label = d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  if (days < 0) return `${label} (expired)`;
  if (days === 0) return `${label} (today)`;
  if (days === 1) return `${label} (1 day)`;
  return `${label} (${days} days)`;
}

/** Render a unix-ms expiry (stored as a stringified bigint). 0 = never. */
export function formatExpiry(value: string): string {
  const ms = Number(value);
  if (!ms) return "Never";
  const d = new Date(ms);
  const days = Math.ceil((ms - Date.now()) / 86_400_000);
  const label = d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  if (days < 0) return `${label} (expired)`;
  return `${label} (${days}d)`;
}

export function isExpired(value: string): boolean {
  const ms = Number(value);
  return ms > 0 && ms < Date.now();
}
