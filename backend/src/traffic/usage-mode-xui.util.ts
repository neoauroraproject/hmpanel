/**
 * Pure helpers for USAGE-mode 3x-ui client enable/total handling.
 * Kept free of Nest deps so unit tests can pin the regression.
 */

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
 * (client edit or bulk disable), and that must stick. Disables that sync
 * merely observes on the panel are tagged PANEL and stay repairable.
 */
export function isUsageManualHold(opts: {
  disableReason: string | null | undefined;
}): boolean {
  return opts.disableReason === 'MANUAL';
}

export type SyncQuotaAction =
  | { kind: 'none' }
  /** Panel cap is below the client's own volume (e.g. zeroed by v2.5.1). */
  | { kind: 'restoreCap' }
  /** Client is over its own volume: put the cap back and switch it off. */
  | { kind: 'disableOverLimit' }
  /** USAGE pool reopened and the client still has volume: turn it back on. */
  | { kind: 'reenable' };

/**
 * What sync must push to 3x-ui for one client. The client's own volume
 * (Client.total in the DB) is always the 3x-ui cap; nothing else enforces it.
 * The USAGE pool only decides whether a client may be switched back on.
 */
export function planSyncQuotaAction(opts: {
  missingSample: boolean;
  panelEnable: boolean;
  panelTotal: bigint;
  dbTotal: bigint;
  used: bigint;
  expiryTime: bigint | number;
  disableReason: string | null | undefined;
  hasOwner: boolean;
  poolOpen: boolean;
  nowMs?: number;
}): SyncQuotaAction {
  if (opts.missingSample) return { kind: 'none' };
  const hasCap = opts.dbTotal > 0n;
  const overLimit = hasCap && opts.used >= opts.dbTotal;
  const capLowered = hasCap && opts.panelTotal < opts.dbTotal;

  if (overLimit) {
    // Back on the real cap 3x-ui stops it by itself; switch it off now so
    // the user does not keep going until 3x-ui's next traffic check.
    return opts.panelEnable || capLowered
      ? { kind: 'disableOverLimit' }
      : { kind: 'none' };
  }

  if (
    !opts.panelEnable &&
    opts.hasOwner &&
    opts.poolOpen &&
    !isExpiryReached(opts.expiryTime, opts.nowMs) &&
    !isUsageManualHold({ disableReason: opts.disableReason })
  ) {
    return { kind: 'reenable' };
  }

  return capLowered ? { kind: 'restoreCap' } : { kind: 'none' };
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
