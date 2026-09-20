/** Pure PAYG metering / affordance helpers (unit-tested). */

export const PAYG_GB = 1024 ** 3;
export const PAYG_MS_PER_HOUR = 3_600_000;
export const PAYG_MS_PER_DAY = 86_400_000;

export type PaygBillingMode = 'TIME' | 'VOLUME';

export type PaygPricePlan = {
  billingMode: string;
  pricePerDay?: number | null;
  pricePerHour?: number | null;
  pricePerGb?: number | null;
};

/** Prefer pricePerHour; else derive from pricePerDay. */
export function resolvePricePerHour(plan: PaygPricePlan): number | null {
  const hour = Number(plan.pricePerHour);
  if (Number.isFinite(hour) && hour > 0) return hour;
  const day = Number(plan.pricePerDay);
  if (Number.isFinite(day) && day > 0) return day / 24;
  return null;
}

export function resolvePricePerMs(plan: PaygPricePlan): number | null {
  const perHour = resolvePricePerHour(plan);
  if (perHour == null || !(perHour > 0)) return null;
  return perHour / PAYG_MS_PER_HOUR;
}

export function resolvePricePerByte(plan: PaygPricePlan): number | null {
  const perGb = Number(plan.pricePerGb);
  if (!Number.isFinite(perGb) || !(perGb > 0)) return null;
  return perGb / PAYG_GB;
}

/**
 * VOLUME affordance: total = used + floor(balance / pricePerByte).
 * Returns null when price is missing.
 */
export function computeVolumeTotalBytes(
  usedBytes: number | bigint,
  balance: number,
  pricePerByte: number,
): number | null {
  if (!(pricePerByte > 0)) return null;
  const used = Number(usedBytes);
  if (!Number.isFinite(used) || used < 0) return null;
  const bal = Math.max(0, Number(balance) || 0);
  const affordable = Math.floor(bal / pricePerByte);
  return used + Math.max(0, affordable);
}

/**
 * TIME affordance: expiryMs = nowMs + floor(balance / pricePerMs).
 * Returns null when price is missing.
 */
export function computeTimeExpiryMs(
  nowMs: number,
  balance: number,
  pricePerMs: number,
): number | null {
  if (!(pricePerMs > 0)) return null;
  const bal = Math.max(0, Number(balance) || 0);
  const affordMs = Math.floor(bal / pricePerMs);
  return nowMs + Math.max(0, affordMs);
}

/** VOLUME charge from cursor → used (never charges negative / reset dips). */
export function computeVolumeDelta(opts: {
  usedBytes: number | bigint;
  meterCursorBytes: number | bigint;
  pricePerByte: number;
}): { deltaBytes: number; quantityGb: number; amount: number; nextCursor: bigint } | null {
  const used = BigInt(opts.usedBytes);
  const cursor = BigInt(opts.meterCursorBytes);
  if (used <= cursor) {
    return {
      deltaBytes: 0,
      quantityGb: 0,
      amount: 0,
      nextCursor: cursor,
    };
  }
  const delta = used - cursor;
  const deltaNum = Number(delta);
  if (!(opts.pricePerByte > 0) || !Number.isFinite(deltaNum)) return null;
  const quantityGb = deltaNum / PAYG_GB;
  const amount = deltaNum * opts.pricePerByte;
  return {
    deltaBytes: deltaNum,
    quantityGb,
    amount,
    nextCursor: used,
  };
}

/** TIME charge from lastBilledAt → now. */
export function computeTimeDelta(opts: {
  fromMs: number;
  toMs: number;
  pricePerHour: number;
}): { quantityHours: number; amount: number; meterCursor: string } | null {
  if (!(opts.pricePerHour > 0)) return null;
  const from = Number(opts.fromMs);
  const to = Number(opts.toMs);
  if (!Number.isFinite(from) || !Number.isFinite(to) || to <= from) {
    return {
      quantityHours: 0,
      amount: 0,
      meterCursor: `time:${Math.floor(to || from || 0)}`,
    };
  }
  const quantityHours = (to - from) / PAYG_MS_PER_HOUR;
  const amount = quantityHours * opts.pricePerHour;
  return {
    quantityHours,
    amount,
    meterCursor: `time:${Math.floor(to)}`,
  };
}

export function volumeMeterCursorKey(usedBytes: number | bigint): string {
  return `vol:${usedBytes.toString()}`;
}

/** True when a ledger row with this cursor means the tick was already applied. */
export function isDuplicateMeterCursor(
  existingCursors: Iterable<string>,
  meterCursor: string,
): boolean {
  for (const c of existingCursors) {
    if (c === meterCursor) return true;
  }
  return false;
}

export type DailyUsageBucket = {
  day: string; // YYYY-MM-DD UTC
  kind: string;
  quantity: number;
  amount: number;
  entries: number;
};

/** Aggregate ledger rows into UTC daily buckets for bot/logs. */
export function aggregateDailyUsage(
  entries: Array<{
    createdAt: Date | string | number;
    kind: string;
    quantity: number;
    amount: number;
  }>,
): DailyUsageBucket[] {
  const map = new Map<string, DailyUsageBucket>();
  for (const e of entries) {
    const d = new Date(e.createdAt);
    if (Number.isNaN(d.getTime())) continue;
    const day = d.toISOString().slice(0, 10);
    const key = `${day}|${e.kind}`;
    const cur = map.get(key) || {
      day,
      kind: e.kind,
      quantity: 0,
      amount: 0,
      entries: 0,
    };
    cur.quantity += Number(e.quantity) || 0;
    cur.amount += Number(e.amount) || 0;
    cur.entries += 1;
    map.set(key, cur);
  }
  return [...map.values()].sort((a, b) =>
    a.day === b.day ? a.kind.localeCompare(b.kind) : a.day.localeCompare(b.day),
  );
}

export function normalizeBillingMode(raw: unknown): PaygBillingMode {
  const m = String(raw || '')
    .trim()
    .toUpperCase();
  if (m === 'TIME' || m === 'VOLUME') return m;
  throw new Error(`Invalid billingMode: ${raw}`);
}

export function effectiveMinWalletBalance(
  planMin: number | null | undefined,
  settingsMin: number | null | undefined,
): number {
  const p = Number(planMin);
  if (Number.isFinite(p) && p >= 0) return p;
  const s = Number(settingsMin);
  if (Number.isFinite(s) && s >= 0) return s;
  return 0;
}
