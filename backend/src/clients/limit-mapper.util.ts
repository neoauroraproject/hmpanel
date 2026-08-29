/**
 * Maps "allowed users" to 3x-ui fields.
 * 3.7.0+ with hwidsApi → limitHwid; older panels → limitIp.
 */

export function normalizeAllowedUsers(value?: number | null): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export function supports3xUiHwidLimit(panel: {
  apiVersion?: string | null;
  capabilities?: unknown;
}): boolean {
  if (!isPanelApiAtLeastLocal(panel.apiVersion, 3, 7, 0)) return false;
  const caps = panel.capabilities as Record<string, boolean> | undefined;
  if (caps && typeof caps.hwidsApi === 'boolean') return caps.hwidsApi;
  return true;
}

export function resolve3xUiLimit(
  panel: { apiVersion?: string | null; capabilities?: unknown },
  allowedUsers?: number | null,
): { limitIp: number; limitHwid: number } {
  const n = normalizeAllowedUsers(allowedUsers);
  if (n <= 0) return { limitIp: 0, limitHwid: 0 };
  if (supports3xUiHwidLimit(panel)) {
    return { limitIp: 0, limitHwid: n };
  }
  return { limitIp: n, limitHwid: 0 };
}

/** Negative expiryTime (ms) = start after first use (3x-ui). */
export function buildOnHoldExpiry3xUi(durationDays: number): number {
  const days = Math.max(0, Math.floor(Number(durationDays) || 0));
  if (days <= 0) return 0;
  return -(days * 86400000);
}

function isPanelApiAtLeastLocal(
  version: string | null | undefined,
  major: number,
  minor: number,
  patch = 0,
): boolean {
  if (!version) return false;
  const m = version.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return false;
  const v: [number, number, number] = [
    parseInt(m[1], 10),
    parseInt(m[2], 10),
    parseInt(m[3] || '0', 10),
  ];
  if (v[0] !== major) return v[0] > major;
  if (v[1] !== minor) return v[1] > minor;
  return v[2] >= patch;
}
