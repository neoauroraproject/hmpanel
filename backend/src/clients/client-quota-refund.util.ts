/**
 * How much allocation goes back to the owning admin when a client's volume is
 * lowered or the client is deleted. Two hard caps:
 *  - only bytes the client has not used yet, and
 *  - never more than was actually charged for this client (DEBIT − CREDIT),
 *    so synced/imported clients or repeated edits cannot mint quota.
 */

export type ClientUsage = { up: bigint; down: bigint };

/**
 * The DB row only holds the last synced counters, which trail the panel.
 * Counters only grow between syncs, so the larger side of each is the
 * freshest known usage.
 */
export function freshestUsage(
  stored: ClientUsage,
  live: ClientUsage | null | undefined,
): bigint {
  if (!live) return stored.up + stored.down;
  const up = live.up > stored.up ? live.up : stored.up;
  const down = live.down > stored.down ? live.down : stored.down;
  return up + down;
}

function clampRefund(refundable: bigint, netCharged: bigint): bigint {
  if (refundable <= 0n || netCharged <= 0n) return 0n;
  return refundable < netCharged ? refundable : netCharged;
}

/** Volume lowered from oldTotal to newTotal (0 = unlimited). */
export function computeEditRefund(input: {
  oldTotal: bigint;
  newTotal: bigint;
  used: bigint;
  netCharged: bigint;
}): bigint {
  // Unlimited before: nothing per-volume to give back. Unlimited after: the
  // client keeps consuming, so the allocation stays charged.
  if (input.oldTotal <= 0n || input.newTotal <= 0n) return 0n;
  if (input.newTotal >= input.oldTotal) return 0n;
  const floor = input.newTotal > input.used ? input.newTotal : input.used;
  return clampRefund(input.oldTotal - floor, input.netCharged);
}

/** Client deleted: only its unused volume comes back. */
export function computeDeletionRefund(input: {
  total: bigint;
  used: bigint;
  netCharged: bigint;
}): bigint {
  if (input.total <= 0n) return 0n;
  return clampRefund(input.total - input.used, input.netCharged);
}
