import { BadRequestException } from '@nestjs/common';
import {
  assertDeviceLimitAllowed,
  assertExpireDaysAllowed,
  resolveClientLimitCaps,
} from './admin-client-limits.util';

const DAY_MS = 86_400_000;
const NOW = 1_700_000_000_000;

describe('assertDeviceLimitAllowed', () => {
  it('allows anything when the cap is unlimited', () => {
    expect(assertDeviceLimitAllowed(0, 0)).toBe(0);
    expect(assertDeviceLimitAllowed(0, 99)).toBe(99);
    expect(assertDeviceLimitAllowed(0, undefined)).toBe(0);
  });

  it('rejects unlimited requests when a cap exists', () => {
    expect(() => assertDeviceLimitAllowed(3, 0)).toThrow(BadRequestException);
    expect(() => assertDeviceLimitAllowed(3, undefined)).toThrow(
      BadRequestException,
    );
  });

  it('rejects values above the cap and accepts values at or below it', () => {
    expect(() => assertDeviceLimitAllowed(3, 4)).toThrow(BadRequestException);
    expect(assertDeviceLimitAllowed(3, 3)).toBe(3);
    expect(assertDeviceLimitAllowed(3, 1)).toBe(1);
  });
});

describe('assertExpireDaysAllowed', () => {
  it('is a no-op when the cap is unlimited', () => {
    expect(() => assertExpireDaysAllowed(0, 0, NOW)).not.toThrow();
    expect(() =>
      assertExpireDaysAllowed(0, NOW + 900 * DAY_MS, NOW),
    ).not.toThrow();
  });

  it('rejects never-expiring clients when a cap exists', () => {
    expect(() => assertExpireDaysAllowed(30, 0, NOW)).toThrow(
      BadRequestException,
    );
    expect(() => assertExpireDaysAllowed(30, undefined, NOW)).toThrow(
      BadRequestException,
    );
  });

  it('compares remaining days against the cap', () => {
    expect(() => assertExpireDaysAllowed(30, NOW + 30 * DAY_MS, NOW)).not.toThrow();
    expect(() => assertExpireDaysAllowed(30, NOW + 31 * DAY_MS, NOW)).toThrow(
      BadRequestException,
    );
  });

  it('measures on-hold (negative) expiry as a duration', () => {
    expect(() => assertExpireDaysAllowed(30, -30 * DAY_MS, NOW)).not.toThrow();
    expect(() => assertExpireDaysAllowed(30, -60 * DAY_MS, NOW)).toThrow(
      BadRequestException,
    );
  });
});

describe('resolveClientLimitCaps', () => {
  const admin = {
    quotaMode: 'GLOBAL',
    maxClients: 100,
    maxDeviceLimit: 4,
    maxExpireDays: 90,
  };

  it('uses admin globals in GLOBAL mode even when a panel row exists', () => {
    expect(
      resolveClientLimitCaps(admin, {
        maxClients: 5,
        maxDeviceLimit: 1,
        maxExpireDays: 7,
      }),
    ).toEqual({ maxClients: 100, maxDeviceLimit: 4, maxExpireDays: 90 });
  });

  it('uses panel fields in PER_PANEL mode', () => {
    expect(
      resolveClientLimitCaps(
        { ...admin, quotaMode: 'PER_PANEL', maxClients: 0 },
        { maxClients: 5, maxDeviceLimit: 1, maxExpireDays: 7 },
      ),
    ).toEqual({ maxClients: 5, maxDeviceLimit: 1, maxExpireDays: 7 });
  });

  it('keeps the admin maxClients as a global ceiling', () => {
    expect(
      resolveClientLimitCaps({ ...admin, quotaMode: 'PER_PANEL' }, {
        maxClients: 500,
        maxDeviceLimit: 2,
        maxExpireDays: 30,
      }).maxClients,
    ).toBe(100);
  });

  it('falls back to the admin ceiling when the panel is unlimited', () => {
    expect(
      resolveClientLimitCaps({ ...admin, quotaMode: 'PER_PANEL' }, {
        maxClients: 0,
      }).maxClients,
    ).toBe(100);
  });

  it('treats a missing panel row as GLOBAL', () => {
    expect(resolveClientLimitCaps({ ...admin, quotaMode: 'PER_PANEL' }, null)).toEqual(
      { maxClients: 100, maxDeviceLimit: 4, maxExpireDays: 90 },
    );
  });
});
