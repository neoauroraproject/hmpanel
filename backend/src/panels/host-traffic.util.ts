export type HostCounters = { sent: bigint; recv: bigint };
export type TrafficSample = { up: bigint; down: bigint };

/** Cumulative NIC counters from 3x-ui /server/status, when the panel reports them. */
export function parseHostCounters(netTraffic: unknown): HostCounters | null {
  const raw = netTraffic as { sent?: unknown; recv?: unknown } | null | undefined;
  const sent = Number(raw?.sent);
  const recv = Number(raw?.recv);
  if (!Number.isFinite(sent) || !Number.isFinite(recv) || sent < 0 || recv < 0) {
    return null;
  }
  return { sent: BigInt(Math.floor(sent)), recv: BigInt(Math.floor(recv)) };
}

/** Bytes since the last poll. Null on the first poll or after a host reboot. */
export function hostCounterDelta(
  previous: HostCounters | undefined,
  current: HostCounters | null,
): TrafficSample | null {
  if (!previous || !current) return null;
  if (current.sent < previous.sent || current.recv < previous.recv) return null;
  return {
    up: current.sent - previous.sent,
    down: current.recv - previous.recv,
  };
}

/**
 * What the dashboard counts for one poll. The NIC sees everything the server
 * moved; client counters only cover what they saw between polls. They stay as
 * the fallback for polls with no NIC reading and panels whose traffic runs on
 * remote nodes, where client counters exceed the master's NIC.
 */
export function pickTrafficSample(
  host: TrafficSample | null,
  clients: TrafficSample,
): TrafficSample {
  if (!host) return clients;
  return host.up + host.down >= clients.up + clients.down ? host : clients;
}

/** Growth of a panel's summed client counters, for panels with no NIC reading. */
export function counterGrowth(before: TrafficSample, after: TrafficSample): TrafficSample {
  return {
    up: after.up > before.up ? after.up - before.up : 0n,
    down: after.down > before.down ? after.down - before.down : 0n,
  };
}
