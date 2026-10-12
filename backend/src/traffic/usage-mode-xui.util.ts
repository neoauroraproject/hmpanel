/**
 * Pure helpers for USAGE-mode 3x-ui client enable/total handling.
 * Kept free of Nest deps so unit tests can pin the regression.
 */

/** Bytes to push as 3x-ui totalGB for a USAGE vs ALLOCATION owner. */
export function xuiTotalBytesForMode(
  mode: 'USAGE' | 'ALLOCATION' | string,
  requestedBytes: number,
): number {
  return mode === 'USAGE' ? 0 : Math.max(0, Number(requestedBytes) || 0);
}

/**
 * 3x-ui 3.8+ stores the live enable/total on Client.traffic. Updating only
 * top-level enable/totalGB leaves traffic.enable=false and the client looks
 * disabled again on the next sync. Keep both layers in sync when present.
 */
export function syncXuiTrafficMirror(body: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...body };
  const hasEnable = Object.prototype.hasOwnProperty.call(out, 'enable');
  const hasTotal = Object.prototype.hasOwnProperty.call(out, 'totalGB');
  if (!hasEnable && !hasTotal) return out;
  const prev =
    out.traffic && typeof out.traffic === 'object' && !Array.isArray(out.traffic)
      ? { ...(out.traffic as Record<string, unknown>) }
      : {};
  if (hasEnable) prev.enable = out.enable !== false;
  if (hasTotal) prev.total = Math.max(0, Number(out.totalGB) || 0);
  out.traffic = prev;
  return out;
}

/**
 * 3x-ui expiry: 0 = none, negative = "start after first use" (a duration that
 * becomes a deadline on the first traffic tick), positive = deadline in ms.
 * Treating the negative form as already expired kept every client created
 * from the panel form (which always uses it) out of the USAGE repair.
 */
export function isExpiryReached(
  expiryTime: bigint | number | null | undefined,
  nowMs: number = Date.now(),
): boolean {
  const expiry = BigInt(expiryTime || 0);
  return expiry > 0n && BigInt(nowMs) >= expiry;
}

/**
 * MANUAL is written only when a person turns the client off in this panel
 * (client edit or bulk disable), and that must stick even though USAGE
 * clients always sit at total=0 on 3x-ui. Disables that sync merely observes
 * on the panel are tagged PANEL and stay repairable while the pool is open.
 */
export function isUsageManualHold(opts: {
  disableReason: string | null | undefined;
}): boolean {
  return opts.disableReason === 'MANUAL';
}

/**
 * Reason for a client sync found disabled on the panel while the DB still had
 * it enabled. Never MANUAL: nobody disabled it here, and MANUAL would block
 * the USAGE repair for good.
 */
export function classifyPanelDisableReason(opts: {
  panelTotal: bigint | number;
  used: bigint | number;
  expiryTime: bigint | number;
  nowMs?: number;
  existingReason?: string | null;
  gracePeriod?: boolean;
}): 'TRAFFIC_LIMIT' | 'EXPIRED' | 'BALANCE_EXHAUSTED' | 'PANEL' {
  if (opts.existingReason === 'BALANCE_EXHAUSTED') return 'BALANCE_EXHAUSTED';
  const total = BigInt(opts.panelTotal || 0);
  const used = BigInt(opts.used || 0);
  if (total > 0n && used >= total) return 'TRAFFIC_LIMIT';
  if (isExpiryReached(opts.expiryTime, opts.nowMs)) return 'EXPIRED';
  if (opts.gracePeriod) return 'BALANCE_EXHAUSTED';
  return 'PANEL';
}
