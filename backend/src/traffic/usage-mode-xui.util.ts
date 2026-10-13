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
  /** Nothing to push; the 3x-ui cap is the client's volume. */
  | { kind: 'none'; capBytes: bigint }
  /**
   * 3x-ui shows unlimited for a client created with a volume: v2.5.1 zeroed
   * those caps. Put the volume recorded at create/edit back (one-time heal).
   */
  | { kind: 'restoreCap'; capBytes: bigint }
  /** USAGE pool reopened and the client still has volume: turn it back on. */
  | { kind: 'reenable'; capBytes: bigint }
  /**
   * The client used up its own volume while 3x-ui shows it unlimited (3x-ui
   * cannot cut it). Switch it off here; the volume itself is not touched.
   */
  | { kind: 'disableOverLimit'; capBytes: bigint };

/**
 * What sync must push to 3x-ui for one client. 3x-ui is the source of a
 * client's volume and enforces it; the exceptions are caps zeroed by the
 * v2.5.1 bug (restored from the DB while `healZeroedCaps` is on) and clients
 * of USAGE owners whose 3x-ui cap reads unlimited although they have a volume
 * (`enforceDbVolume`): those are cut at that volume by HMPanel itself.
 * The USAGE pool only decides when a pool-suspended client may come back on.
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
  healZeroedCaps: boolean;
  enforceDbVolume?: boolean;
  nowMs?: number;
}): SyncQuotaAction {
  const zeroedInPanel = opts.panelTotal === 0n && opts.dbTotal > 0n;
  const zeroed = opts.healZeroedCaps && opts.hasOwner && zeroedInPanel;
  const capBytes = zeroed ? opts.dbTotal : opts.panelTotal;
  if (opts.missingSample) return { kind: 'none', capBytes };

  // The volume that actually limits the client: 3x-ui's cap, or HMPanel's own
  // record while 3x-ui reads unlimited for a USAGE owner's client.
  const limit =
    opts.enforceDbVolume && zeroedInPanel ? opts.dbTotal : capBytes;
  const hasVolumeLeft = limit === 0n || opts.used < limit;

  if (
    opts.panelEnable &&
    opts.enforceDbVolume &&
    zeroedInPanel &&
    !hasVolumeLeft &&
    !isUsageManualHold({ disableReason: opts.disableReason })
  ) {
    return { kind: 'disableOverLimit', capBytes };
  }

  if (
    !opts.panelEnable &&
    hasVolumeLeft &&
    opts.hasOwner &&
    opts.poolOpen &&
    !isExpiryReached(opts.expiryTime, opts.nowMs) &&
    !isUsageManualHold({ disableReason: opts.disableReason })
  ) {
    return { kind: 'reenable', capBytes };
  }
  return zeroed ? { kind: 'restoreCap', capBytes } : { kind: 'none', capBytes };
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
