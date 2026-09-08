import {
  calculateAdminTrafficSummary,
  sumPanelQuotaTraffic,
} from './traffic.util';

describe('sumPanelQuotaTraffic', () => {
  it('sums PER_PANEL used traffic instead of the zeroed Admin row', () => {
    const adminRow = calculateAdminTrafficSummary(0, 0);
    expect(adminRow.usedTraffic).toBe(0);

    const summed = sumPanelQuotaTraffic([
      { totalAssigned: 300 * 1024 ** 3, balance: 281 * 1024 ** 3 },
      { totalAssigned: 50 * 1024 ** 3, balance: 10 * 1024 ** 3 },
    ]);
    expect(summed.usedTraffic).toBe((19 + 40) * 1024 ** 3);
    expect(summed.totalAllocated).toBe(350 * 1024 ** 3);
  });

  it('prefers precomputed usedTraffic when present', () => {
    const summed = sumPanelQuotaTraffic([
      { totalAssigned: 10, balance: 10, usedTraffic: 4 },
    ]);
    expect(summed.usedTraffic).toBe(4);
  });
});
