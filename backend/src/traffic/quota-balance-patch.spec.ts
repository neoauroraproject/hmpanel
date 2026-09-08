import { nextQuotaLedger } from './quota-balance-patch';

describe('nextQuotaLedger', () => {
  it('allocates the first balance and records initial credit', () => {
    expect(nextQuotaLedger(null, 50 * 1024 ** 3)).toEqual({
      balance: 50 * 1024 ** 3,
      totalAssigned: 50 * 1024 ** 3,
      totalAssignedIncrement: 0,
      diff: 50 * 1024 ** 3,
      action: 'ADMIN_INITIAL_ALLOCATION',
    });
  });

  it('skips a ledger row when the first balance is zero', () => {
    expect(nextQuotaLedger(null, 0).action).toBeNull();
  });

  it('credits an existing row without rewriting totalAssigned', () => {
    const patch = nextQuotaLedger(
      { balance: 10 * 1024 ** 3, totalAssigned: 40 * 1024 ** 3 },
      60 * 1024 ** 3,
    );
    expect(patch.action).toBe('ADMIN_RECHARGE');
    expect(patch.diff).toBe(50 * 1024 ** 3);
    expect(patch.totalAssignedIncrement).toBe(50 * 1024 ** 3);
    expect(patch.totalAssigned).toBeUndefined();
  });

  it('debits an existing row and never goes below zero', () => {
    const patch = nextQuotaLedger({ balance: 20 * 1024 ** 3, totalAssigned: 20 * 1024 ** 3 }, -1);
    expect(patch.balance).toBe(0);
    expect(patch.action).toBe('ADMIN_DEDUCTION');
    expect(patch.totalAssignedIncrement).toBe(0);
  });

  it('ignores an unchanged balance', () => {
    expect(
      nextQuotaLedger({ balance: 5, totalAssigned: 5 }, 5).action,
    ).toBeNull();
  });
});
