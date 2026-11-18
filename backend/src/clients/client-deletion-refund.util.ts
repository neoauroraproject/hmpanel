export type ClientUsage = { up: bigint; down: bigint };

/**
 * The DB row only holds the last synced counters, which trail the panel.
 * Counters only grow between syncs, so the larger side of each is the
 * freshest known usage.
 */
export function mergeLiveUsage(
  stored: ClientUsage,
  live: ClientUsage | null | undefined,
): ClientUsage {
  if (!live) return { up: stored.up, down: stored.down };
  return {
    up: live.up > stored.up ? live.up : stored.up,
    down: live.down > stored.down ? live.down : stored.down,
  };
}

/** Unused bytes still owed back to the owner, capped at what was charged. */
export function computeDeletionRefund(input: {
  total: bigint;
  up: bigint;
  down: bigint;
  netCharged: bigint;
}): bigint {
  if (input.total <= 0n) return 0n;
  const remaining = input.total - (input.up + input.down);
  if (remaining <= 0n || input.netCharged <= 0n) return 0n;
  return remaining < input.netCharged ? remaining : input.netCharged;
}
