import {
  counterGrowth,
  hostCounterDelta,
  parseHostCounters,
  pickTrafficSample,
} from './host-traffic.util';

describe('parseHostCounters', () => {
  it('reads 3x-ui netTraffic', () => {
    expect(parseHostCounters({ sent: 10, recv: 20 })).toEqual({ sent: 10n, recv: 20n });
  });

  it('rejects missing or invalid values', () => {
    expect(parseHostCounters(undefined)).toBeNull();
    expect(parseHostCounters({ sent: 10 })).toBeNull();
    expect(parseHostCounters({ sent: -1, recv: 2 })).toBeNull();
  });
});

describe('hostCounterDelta', () => {
  it('returns growth since the last poll', () => {
    expect(
      hostCounterDelta({ sent: 10n, recv: 20n }, { sent: 15n, recv: 50n }),
    ).toEqual({ up: 5n, down: 30n });
  });

  it('has no delta on the first poll, without a reading, or after a reboot', () => {
    expect(hostCounterDelta(undefined, { sent: 1n, recv: 1n })).toBeNull();
    expect(hostCounterDelta({ sent: 1n, recv: 1n }, null)).toBeNull();
    expect(hostCounterDelta({ sent: 100n, recv: 100n }, { sent: 1n, recv: 1n })).toBeNull();
  });
});

describe('pickTrafficSample', () => {
  const clients = { up: 5n, down: 25n };

  it('prefers the NIC when client counters saw less', () => {
    const host = { up: 350n, down: 350n };
    expect(pickTrafficSample(host, clients)).toEqual(host);
  });

  it('falls back to clients with no NIC delta or on node-backed panels', () => {
    expect(pickTrafficSample(null, clients)).toEqual(clients);
    expect(pickTrafficSample({ up: 1n, down: 1n }, clients)).toEqual(clients);
  });
});

describe('counterGrowth', () => {
  it('ignores shrinkage from deleted clients', () => {
    expect(counterGrowth({ up: 10n, down: 50n }, { up: 15n, down: 40n })).toEqual({ up: 5n, down: 0n });
  });
});
