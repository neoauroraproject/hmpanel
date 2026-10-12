import {
  classifyPanelDisableReason,
  isExpiryReached,
  isUsageManualHold,
  planSyncQuotaAction,
  syncXuiTrafficMirror,
} from './usage-mode-xui.util';

const GB = 1024 ** 3;
const NOW = Date.UTC(2026, 9, 12);

describe('usage-mode-xui.util', () => {
  describe('planSyncQuotaAction', () => {
    const base = {
      missingSample: false,
      panelEnable: true,
      panelTotal: BigInt(50 * GB),
      dbTotal: BigInt(50 * GB),
      used: BigInt(GB),
      expiryTime: 0,
      disableReason: null as string | null,
      hasOwner: true,
      poolOpen: true,
      nowMs: NOW,
    };
    const plan = (o: Partial<typeof base> & Record<string, unknown> = {}) =>
      planSyncQuotaAction({ ...base, ...o } as any).kind;

    it('leaves a client alone when the panel holds its own volume', () => {
      expect(plan()).toBe('none');
      expect(plan({ poolOpen: false })).toBe('none');
    });

    it('restores a cap zeroed on 3x-ui (regression: v2.5.1 made USAGE clients unlimited)', () => {
      expect(plan({ panelTotal: 0n })).toBe('restoreCap');
      expect(plan({ panelTotal: 0n, poolOpen: false, hasOwner: false })).toBe('restoreCap');
      expect(plan({ panelTotal: BigInt(10 * GB) })).toBe('restoreCap');
    });

    it('never pushes 0 for a client that has a volume, even with an open USAGE pool', () => {
      expect(plan({ panelEnable: false, panelTotal: 0n })).toBe('reenable');
      // reenable also sends totalGB = dbTotal (see panels.service repair loop)
    });

    it('switches off a client that already used its volume', () => {
      expect(plan({ panelTotal: 0n, used: BigInt(50 * GB) })).toBe('disableOverLimit');
      expect(plan({ used: BigInt(60 * GB) })).toBe('disableOverLimit');
      // Already off on its real cap: nothing to do, and the pool must not revive it.
      expect(plan({ panelEnable: false, used: BigInt(50 * GB) })).toBe('none');
    });

    it('re-enables only USAGE-pool suspensions with volume left', () => {
      expect(plan({ panelEnable: false, disableReason: 'BALANCE_EXHAUSTED' })).toBe('reenable');
      expect(plan({ panelEnable: false, poolOpen: false })).toBe('none');
      expect(plan({ panelEnable: false, disableReason: 'MANUAL' })).toBe('none');
      expect(plan({ panelEnable: false, expiryTime: NOW - 1 })).toBe('none');
      expect(plan({ panelEnable: false, hasOwner: false })).toBe('none');
    });

    it('keeps unlimited clients unlimited and ignores missing samples', () => {
      expect(plan({ dbTotal: 0n, panelTotal: 0n, used: BigInt(500 * GB) })).toBe('none');
      expect(plan({ missingSample: true, panelTotal: 0n })).toBe('none');
    });
  });

  describe('isExpiryReached', () => {
    it('never treats "start after first use" (negative) as expired', () => {
      // Regression: the client form always sends a negative expiry, and treating
      // it as expired kept freshly created USAGE clients out of the repair.
      expect(isExpiryReached(-30 * 86_400_000, NOW)).toBe(false);
      expect(isExpiryReached(BigInt(-30 * 86_400_000), NOW)).toBe(false);
    });

    it('treats 0 as no expiry and only past deadlines as expired', () => {
      expect(isExpiryReached(0, NOW)).toBe(false);
      expect(isExpiryReached(null, NOW)).toBe(false);
      expect(isExpiryReached(NOW + 1000, NOW)).toBe(false);
      expect(isExpiryReached(NOW, NOW)).toBe(true);
      expect(isExpiryReached(BigInt(NOW - 1), NOW)).toBe(true);
    });
  });

  describe('isUsageManualHold', () => {
    it('holds a client a person disabled here, even at panel total 0', () => {
      // Regression: sync re-enabled USAGE clients an admin had switched off.
      expect(isUsageManualHold({ disableReason: 'MANUAL' })).toBe(true);
    });

    it('does not hold disables sync only observed on the panel', () => {
      for (const reason of ['PANEL', 'TRAFFIC_LIMIT', 'BALANCE_EXHAUSTED', null, undefined]) {
        expect(isUsageManualHold({ disableReason: reason })).toBe(false);
      }
    });
  });

  describe('classifyPanelDisableReason', () => {
    it('never invents MANUAL for a panel-side disable', () => {
      expect(
        classifyPanelDisableReason({ panelTotal: 0, used: 0, expiryTime: 0, nowMs: NOW }),
      ).toBe('PANEL');
      // A leftover cap the client has not used up yet.
      expect(
        classifyPanelDisableReason({ panelTotal: 10 * GB, used: GB, expiryTime: 0, nowMs: NOW }),
      ).toBe('PANEL');
    });

    it('recognises an exhausted panel cap and a passed deadline', () => {
      expect(
        classifyPanelDisableReason({ panelTotal: 10 * GB, used: 10 * GB, expiryTime: 0, nowMs: NOW }),
      ).toBe('TRAFFIC_LIMIT');
      expect(
        classifyPanelDisableReason({ panelTotal: 0, used: 0, expiryTime: NOW - 1, nowMs: NOW }),
      ).toBe('EXPIRED');
    });

    it('does not call a delayed-start expiry EXPIRED', () => {
      expect(
        classifyPanelDisableReason({ panelTotal: 0, used: 0, expiryTime: -86_400_000, nowMs: NOW }),
      ).toBe('PANEL');
    });

    it('keeps balance exhaustion during a grace period', () => {
      expect(
        classifyPanelDisableReason({ panelTotal: 0, used: 0, expiryTime: 0, nowMs: NOW, gracePeriod: true }),
      ).toBe('BALANCE_EXHAUSTED');
      expect(
        classifyPanelDisableReason({
          panelTotal: 0, used: 0, expiryTime: 0, nowMs: NOW, existingReason: 'BALANCE_EXHAUSTED',
        }),
      ).toBe('BALANCE_EXHAUSTED');
    });
  });

  it('mirrors enable/totalGB onto nested traffic for 3x-ui 3.8', () => {
    const next = syncXuiTrafficMirror({
      enable: true,
      totalGB: 0,
      traffic: { enable: false, total: 50 * GB, up: 1, down: 2 },
    });
    expect(next.enable).toBe(true);
    expect(next.totalGB).toBe(0);
    expect(next.traffic).toEqual({
      enable: true,
      total: 0,
      up: 1,
      down: 2,
    });
  });
});
