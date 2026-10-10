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
 * Sync must not treat a panel-unlimited (total=0) disable as a permanent
 * manual hold — that is how USAGE clients get stuck after create/repair.
 * True API MANUAL disables still hold when the panel still has a per-client cap.
 */
export function isUsageManualHold(opts: {
  disableReason: string | null | undefined;
  dbTotal: bigint | number;
  usedNow: bigint | number;
  panelTotal: bigint | number;
}): boolean {
  if (opts.disableReason !== 'MANUAL') return false;
  const panelTotal = BigInt(opts.panelTotal || 0);
  // Panel already unlimited (USAGE shape): never hold — allow pool repair.
  if (panelTotal === 0n) return false;
  const dbTotal = BigInt(opts.dbTotal || 0);
  const usedNow = BigInt(opts.usedNow || 0);
  return dbTotal === 0n || usedNow < dbTotal;
}

/**
 * When classifying a panel disable, do not invent MANUAL for unlimited
 * panel totals while the USAGE pool is open — that blocks repair forever.
 */
export function classifyPanelDisableReason(opts: {
  panelTotal: bigint | number;
  used: bigint | number;
  expiryTime: bigint | number;
  nowMs?: number;
  existingReason?: string | null;
  gracePeriod?: boolean;
  usagePoolOpen?: boolean;
}): 'TRAFFIC_LIMIT' | 'EXPIRED' | 'BALANCE_EXHAUSTED' | 'MANUAL' | null {
  if (opts.existingReason === 'BALANCE_EXHAUSTED') return 'BALANCE_EXHAUSTED';
  const total = BigInt(opts.panelTotal || 0);
  const used = BigInt(opts.used || 0);
  const expiry = BigInt(opts.expiryTime || 0);
  const now = BigInt(opts.nowMs ?? Date.now());
  if (total > 0n && used >= total) return 'TRAFFIC_LIMIT';
  if (expiry > 0n && now >= expiry) return 'EXPIRED';
  if (opts.gracePeriod) return 'BALANCE_EXHAUSTED';
  // USAGE: panel total is 0; a disable with open pool is a stale cap, not MANUAL.
  if (total === 0n && opts.usagePoolOpen) return 'TRAFFIC_LIMIT';
  return 'MANUAL';
}
