import {
  classifyPanelDisableReason,
  isUsageManualHold,
  syncXuiTrafficMirror,
  xuiTotalBytesForMode,
} from './usage-mode-xui.util';

describe('usage-mode-xui.util', () => {
  it('zeros 3x-ui totalGB in USAGE mode (regression: new clients kept a package cap)', () => {
    expect(xuiTotalBytesForMode('USAGE', 50 * 1024 ** 3)).toBe(0);
    expect(xuiTotalBytesForMode('ALLOCATION', 50 * 1024 ** 3)).toBe(50 * 1024 ** 3);
  });

  it('does not manual-hold when panel total is already 0 (USAGE unlimited)', () => {
    expect(
      isUsageManualHold({
        disableReason: 'MANUAL',
        dbTotal: 50 * 1024 ** 3,
        usedNow: 0,
        panelTotal: 0,
      }),
    ).toBe(false);
  });

  it('still holds a true MANUAL disable when panel still has a per-client cap', () => {
    expect(
      isUsageManualHold({
        disableReason: 'MANUAL',
        dbTotal: 50 * 1024 ** 3,
        usedNow: 1,
        panelTotal: 50 * 1024 ** 3,
      }),
    ).toBe(true);
  });

  it('classifies panel-unlimited + open pool as TRAFFIC_LIMIT not MANUAL', () => {
    expect(
      classifyPanelDisableReason({
        panelTotal: 0,
        used: 0,
        expiryTime: 0,
        usagePoolOpen: true,
      }),
    ).toBe('TRAFFIC_LIMIT');
  });

  it('classifies true unknown disable as MANUAL when pool is closed', () => {
    expect(
      classifyPanelDisableReason({
        panelTotal: 0,
        used: 0,
        expiryTime: 0,
        usagePoolOpen: false,
      }),
    ).toBe('MANUAL');
  });

  it('mirrors enable/totalGB onto nested traffic for 3x-ui 3.8', () => {
    const next = syncXuiTrafficMirror({
      enable: true,
      totalGB: 0,
      traffic: { enable: false, total: 50 * 1024 ** 3, up: 1, down: 2 },
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
