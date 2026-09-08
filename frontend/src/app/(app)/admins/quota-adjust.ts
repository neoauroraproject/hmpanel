const GB = 1024 ** 3;

/** Empty / non-numeric / 0 → no change. Otherwise the signed delta. */
export function parseAdjustDelta(raw: string): number | null {
  const trimmed = String(raw ?? "").trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  if (!Number.isFinite(n) || n === 0) return null;
  return n;
}

export function applyTrafficDeltaBytes(currentBytes: number, deltaGb: string): number {
  const delta = parseAdjustDelta(deltaGb);
  const current = Math.max(0, Number(currentBytes) || 0);
  if (delta == null) return current;
  return Math.max(0, Math.round(current + delta * GB));
}

/**
 * Caps where 0 means unlimited. Empty delta keeps the current cap.
 * A positive delta on unlimited sets a finite cap; a negative delta on unlimited stays unlimited.
 */
export function applyCountDelta(current: number, deltaRaw: string): number {
  const delta = parseAdjustDelta(deltaRaw);
  const cap = Math.max(0, Math.round(Number(current) || 0));
  if (delta == null) return cap;
  if (cap === 0) return delta > 0 ? Math.round(delta) : 0;
  return Math.max(0, cap + Math.round(delta));
}

export function applyExpiryDeltaMs(currentExpiryMs: number, deltaDaysRaw: string, now = Date.now()): number {
  const delta = parseAdjustDelta(deltaDaysRaw);
  const current = Number(currentExpiryMs) || 0;
  if (delta == null) return current;
  const dayMs = 24 * 60 * 60 * 1000;
  if (current <= 0) {
    return delta > 0 ? now + Math.round(delta) * dayMs : 0;
  }
  const base = current > now ? current : now;
  return Math.max(0, base + Math.round(delta) * dayMs);
}

export function remainingExpiryDays(expiryMs: number, now = Date.now()): number | null {
  if (!expiryMs) return null;
  return Math.ceil((expiryMs - now) / (24 * 60 * 60 * 1000));
}
