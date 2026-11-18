import {
  computeDeletionRefund,
  mergeLiveUsage,
} from './client-deletion-refund.util';

const GB = 1024n ** 3n;

describe('computeDeletionRefund', () => {
  it('refunds only the unused part of the allocation', () => {
    expect(
      computeDeletionRefund({
        total: 10n * GB,
        up: 2n * GB,
        down: 3n * GB,
        netCharged: 10n * GB,
      }),
    ).toBe(5n * GB);
  });

  it('caps the refund at what was actually charged', () => {
    expect(
      computeDeletionRefund({
        total: 10n * GB,
        up: 0n,
        down: 1n * GB,
        netCharged: 4n * GB,
      }),
    ).toBe(4n * GB);
  });

  it('refunds nothing when the allocation is used up or unlimited', () => {
    expect(
      computeDeletionRefund({ total: 10n * GB, up: 6n * GB, down: 5n * GB, netCharged: 10n * GB }),
    ).toBe(0n);
    expect(
      computeDeletionRefund({ total: 0n, up: 0n, down: 0n, netCharged: 10n * GB }),
    ).toBe(0n);
  });
});

describe('mergeLiveUsage', () => {
  it('uses live panel counters when the synced row lags behind', () => {
    const usage = mergeLiveUsage({ up: 0n, down: 0n }, { up: 2n * GB, down: 3n * GB });
    expect(usage).toEqual({ up: 2n * GB, down: 3n * GB });
    expect(
      computeDeletionRefund({ total: 10n * GB, ...usage, netCharged: 10n * GB }),
    ).toBe(5n * GB);
  });

  it('keeps stored counters when the panel read fails or reports less', () => {
    const stored = { up: 2n * GB, down: 3n * GB };
    expect(mergeLiveUsage(stored, null)).toEqual(stored);
    expect(mergeLiveUsage(stored, { up: 0n, down: 0n })).toEqual(stored);
  });
});
