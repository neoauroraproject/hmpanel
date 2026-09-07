import { overlayPanelQuotasOnOverview } from './resolve-external-overview-quota';

describe('overlayPanelQuotasOnOverview', () => {
  it('uses panel quota 10GB even when provider-access claimed unlimited', () => {
    const gb = 10 * 1024 ** 3;
    const result = overlayPanelQuotasOnOverview(
      {
        totalBytes: 0,
        usedBytes: 0,
        capacity: 0,
        unlimited: true,
      },
      [{ totalAssigned: gb, balance: gb, maxClients: 0 }],
      false,
    );
    expect(result.unlimited).toBe(false);
    expect(result.availableBytes).toBe(gb);
    expect(result.totalBytes).toBe(gb);
    expect(result.capacity).toBe(0);
  });

  it('keeps empty panel quota as unlimited', () => {
    const result = overlayPanelQuotasOnOverview(
      {
        totalBytes: 0,
        usedBytes: 0,
        capacity: 0,
        unlimited: true,
      },
      [{ totalAssigned: 0, balance: 0, maxClients: 0 }],
      false,
    );
    expect(result.unlimited).toBe(true);
    expect(result.availableBytes).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('sums per-panel client caps', () => {
    const result = overlayPanelQuotasOnOverview(
      {
        totalBytes: 1,
        usedBytes: 0,
        capacity: 0,
        unlimited: false,
      },
      [
        { totalAssigned: 1, balance: 1, maxClients: 4 },
        { totalAssigned: 1, balance: 1, maxClients: 8 },
      ],
      false,
    );
    expect(result.capacity).toBe(12);
  });

  it('does not override Super Admin overview', () => {
    const result = overlayPanelQuotasOnOverview(
      {
        totalBytes: 0,
        usedBytes: 0,
        capacity: 0,
        unlimited: true,
      },
      [{ totalAssigned: 10, balance: 10, maxClients: 3 }],
      true,
    );
    expect(result.unlimited).toBe(true);
  });
});
