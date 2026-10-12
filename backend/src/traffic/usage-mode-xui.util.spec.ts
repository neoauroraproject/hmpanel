import {
  classifyPanelDisableReason,
  isExpiryReached,
  isUsageManualHold,
  syncXuiTrafficMirror,
  xuiTotalBytesForMode,
} from './usage-mode-xui.util';

const GB = 1024 ** 3;
const NOW = Date.UTC(2026, 9, 12);

describe('usage-mode-xui.util', () => {
  it('zeros 3x-ui totalGB in USAGE mode (regression: new clients kept a package cap)', () => {
    expect(xuiTotalBytesForMode('USAGE', 50 * GB)).toBe(0);
    expect(xuiTotalBytesForMode('ALLOCATION', 50 * GB)).toBe(50 * GB);
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
