import {
  computeDeletionRefund,
  computeEditRefund,
  freshestUsage,
  netChargedForClient,
} from './client-quota-refund.util';

const GB = 1024n ** 3n;

describe('computeEditRefund', () => {
  it('refunds the unused part of a decrease', () => {
    // 30 GB client, 5 GB used, lowered to 20 GB → 10 GB back
    expect(
      computeEditRefund({ oldTotal: 30n * GB, newTotal: 20n * GB, used: 5n * GB, netCharged: 30n * GB }),
    ).toBe(10n * GB);
  });

  it('never refunds bytes the client already used', () => {
    // 30 GB, 25 GB used, lowered to 20 GB → only the 5 unused GB come back
    expect(
      computeEditRefund({ oldTotal: 30n * GB, newTotal: 20n * GB, used: 25n * GB, netCharged: 30n * GB }),
    ).toBe(5n * GB);
    // fully used → nothing
    expect(
      computeEditRefund({ oldTotal: 30n * GB, newTotal: 10n * GB, used: 30n * GB, netCharged: 30n * GB }),
    ).toBe(0n);
  });

  it('refunds nothing when the client becomes unlimited', () => {
    expect(
      computeEditRefund({ oldTotal: 30n * GB, newTotal: 0n, used: 0n, netCharged: 30n * GB }),
    ).toBe(0n);
  });

  it('is capped by what was charged for the client', () => {
    // synced/imported client never charged
    expect(
      computeEditRefund({ oldTotal: 30n * GB, newTotal: 10n * GB, used: 0n, netCharged: 0n }),
    ).toBe(0n);
    // already partly refunded
    expect(
      computeEditRefund({ oldTotal: 30n * GB, newTotal: 10n * GB, used: 0n, netCharged: 8n * GB }),
    ).toBe(8n * GB);
  });

  it('ignores increases and unlimited → limited', () => {
    expect(
      computeEditRefund({ oldTotal: 10n * GB, newTotal: 20n * GB, used: 0n, netCharged: 10n * GB }),
    ).toBe(0n);
    expect(
      computeEditRefund({ oldTotal: 0n, newTotal: 20n * GB, used: 0n, netCharged: 10n * GB }),
    ).toBe(0n);
  });
});

describe('computeDeletionRefund', () => {
  it('refunds only the unused volume', () => {
    expect(computeDeletionRefund({ total: 30n * GB, used: 12n * GB, netCharged: 30n * GB })).toBe(18n * GB);
    expect(computeDeletionRefund({ total: 30n * GB, used: 31n * GB, netCharged: 30n * GB })).toBe(0n);
  });

  it('is capped by the net charge and ignores unlimited clients', () => {
    expect(computeDeletionRefund({ total: 30n * GB, used: 0n, netCharged: 10n * GB })).toBe(10n * GB);
    expect(computeDeletionRefund({ total: 0n, used: 0n, netCharged: 10n * GB })).toBe(0n);
  });
});

describe('netChargedForClient', () => {
  it('is the ledger net for a client with its own charge', () => {
    expect(
      netChargedForClient({ debits: 30n * GB, credits: 10n * GB, total: 20n * GB, sharedBulkCharge: false }),
    ).toBe(20n * GB);
    expect(
      netChargedForClient({ debits: 10n * GB, credits: 30n * GB, total: 0n, sharedBulkCharge: false }),
    ).toBe(0n);
  });

  it('gives a bulk sibling without a ledger row its volume', () => {
    const net = netChargedForClient({ debits: 0n, credits: 0n, total: 30n * GB, sharedBulkCharge: true });
    expect(net).toBe(30n * GB);
    expect(computeDeletionRefund({ total: 30n * GB, used: 5n * GB, netCharged: net })).toBe(25n * GB);
    expect(computeEditRefund({ oldTotal: 30n * GB, newTotal: 20n * GB, used: 0n, netCharged: net })).toBe(10n * GB);
  });

  it('keeps later increases and earlier refunds of a bulk sibling correct', () => {
    // created 30, raised by 10 → total 40
    expect(
      netChargedForClient({ debits: 10n * GB, credits: 0n, total: 40n * GB, sharedBulkCharge: true }),
    ).toBe(40n * GB);
    // created 30, lowered to 20 with 10 back
    expect(
      netChargedForClient({ debits: 0n, credits: 10n * GB, total: 20n * GB, sharedBulkCharge: true }),
    ).toBe(20n * GB);
  });

  it('never invents a charge for a client outside a batch', () => {
    expect(
      netChargedForClient({ debits: 0n, credits: 0n, total: 30n * GB, sharedBulkCharge: false }),
    ).toBe(0n);
  });
});

describe('freshestUsage', () => {
  it('takes the larger of stored and live counters per side', () => {
    expect(freshestUsage({ up: 1n, down: 10n }, { up: 3n, down: 4n })).toBe(13n);
    expect(freshestUsage({ up: 1n, down: 2n }, null)).toBe(3n);
  });
});
