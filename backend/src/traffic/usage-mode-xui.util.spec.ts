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
      healZeroedCaps: false,
      enforceDbVolume: false,
      nowMs: NOW,
    };
    const plan = (o: Partial<typeof base> = {}) => planSyncQuotaAction({ ...base, ...o });

    it('treats the 3x-ui cap as the client volume', () => {
      expect(plan()).toEqual({ kind: 'none', capBytes: BigInt(50 * GB) });
      // Lowered in 3x-ui: 3x-ui wins, nothing is pushed back.
      expect(plan({ panelTotal: BigInt(5 * GB), dbTotal: BigInt(20 * GB) })).toEqual({
        kind: 'none',
        capBytes: BigInt(5 * GB),
      });
      // Unlimited in 3x-ui after the heal window: stays unlimited.
      expect(plan({ panelTotal: 0n }).kind).toBe('none');
    });

    it('restores caps zeroed by v2.5.1 while the heal is on (regression)', () => {
      expect(plan({ panelTotal: 0n, healZeroedCaps: true })).toEqual({
        kind: 'restoreCap',
        capBytes: BigInt(50 * GB),
      });
      expect(plan({ panelTotal: 0n, healZeroedCaps: true, hasOwner: false }).kind).toBe('none');
      expect(plan({ panelTotal: 0n, dbTotal: 0n, healZeroedCaps: true }).kind).toBe('none');
      expect(plan({ panelTotal: BigInt(5 * GB), healZeroedCaps: true }).kind).toBe('none');
    });

    it('re-enables only USAGE-pool suspensions with volume left on the 3x-ui cap', () => {
      expect(plan({ panelEnable: false, disableReason: 'BALANCE_EXHAUSTED' }).kind).toBe('reenable');
      expect(plan({ panelEnable: false, used: BigInt(50 * GB) }).kind).toBe('none');
      expect(plan({ panelEnable: false, poolOpen: false }).kind).toBe('none');
      expect(plan({ panelEnable: false, disableReason: 'MANUAL' }).kind).toBe('none');
      expect(plan({ panelEnable: false, expiryTime: NOW - 1 }).kind).toBe('none');
      expect(plan({ panelEnable: false, hasOwner: false }).kind).toBe('none');
      // Zeroed and already over its volume: the cap comes back, client stays off.
      expect(
        plan({ panelEnable: false, panelTotal: 0n, healZeroedCaps: true, used: BigInt(60 * GB) }).kind,
      ).toBe('restoreCap');
      // Zeroed and suspended with volume left: back on with the restored cap.
      expect(plan({ panelEnable: false, panelTotal: 0n, healZeroedCaps: true })).toEqual({
        kind: 'reenable',
        capBytes: BigInt(50 * GB),
      });
    });

    it('cuts a USAGE owner client at its own volume when 3x-ui shows it unlimited', () => {
      const over = { panelTotal: 0n, used: BigInt(51 * GB), enforceDbVolume: true };
      // heal off (after the first day) and heal on: over its volume => switched off
      expect(plan(over).kind).toBe('disableOverLimit');
      expect(plan({ ...over, healZeroedCaps: true }).kind).toBe('disableOverLimit');
      // volume left: nothing to cut (heal on restores the cap, off leaves it)
      expect(plan({ panelTotal: 0n, used: BigInt(GB), enforceDbVolume: true }).kind).toBe('none');
      expect(
        plan({ panelTotal: 0n, used: BigInt(GB), enforceDbVolume: true, healZeroedCaps: true }).kind,
      ).toBe('restoreCap');
      // a person's manual disable and non-USAGE owners are never touched
      expect(plan({ ...over, disableReason: 'MANUAL' }).kind).toBe('none');
      expect(plan({ ...over, enforceDbVolume: false }).kind).toBe('none');
      // genuinely unlimited (no volume recorded) is never cut
      expect(plan({ ...over, dbTotal: 0n }).kind).toBe('none');
      // 3x-ui holds its own cap: it enforces it, HMPanel does not step in
      expect(plan({ panelTotal: BigInt(50 * GB), used: BigInt(51 * GB), enforceDbVolume: true }).kind).toBe('none');
    });

    it('does not turn a cut client back on while it is over its volume', () => {
      expect(
        plan({ panelEnable: false, panelTotal: 0n, used: BigInt(51 * GB), enforceDbVolume: true, disableReason: 'TRAFFIC_LIMIT' }).kind,
      ).toBe('none');
      expect(
        plan({ panelEnable: false, panelTotal: 0n, used: BigInt(GB), enforceDbVolume: true, disableReason: 'BALANCE_EXHAUSTED' }).kind,
      ).toBe('reenable');
    });

    it('ignores missing samples', () => {
      expect(plan({ missingSample: true, panelTotal: 0n, healZeroedCaps: true }).kind).toBe('none');
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
