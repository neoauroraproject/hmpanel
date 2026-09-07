import { BadRequestException } from '@nestjs/common';

/**
 * Caps a reseller must respect when creating or editing clients.
 * `0` always means "no cap" — the reseller may pick any value, including unlimited.
 */
export type ClientLimitCaps = {
  maxClients: number; // 0 unlimited capacity
  maxDeviceLimit: number; // 0 unlimited
  maxExpireDays: number; // 0 unlimited
};

const DAY_MS = 86_400_000;

function toCount(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/**
 * Validates the device (IP/HWID) limit a reseller wants to put on a client.
 * A cap > 0 forbids both "unlimited" (0) and anything above the cap.
 * Returns the normalized requested value.
 */
export function assertDeviceLimitAllowed(
  cap: number,
  requested: number | undefined | null,
  label = 'IP/HWID',
): number {
  const normalizedCap = toCount(cap);
  const value = toCount(requested);
  if (normalizedCap <= 0) return value;
  if (value <= 0) {
    throw new BadRequestException(
      `Unlimited ${label} limit is not allowed. Your maximum is ${normalizedCap}.`,
    );
  }
  if (value > normalizedCap) {
    throw new BadRequestException(
      `${label} limit ${value} exceeds your maximum of ${normalizedCap}.`,
    );
  }
  return value;
}

/**
 * Validates the client expiry a reseller wants to set.
 * A cap > 0 forbids "never expires" (0) and any duration longer than the cap.
 * Negative values are 3x-ui "start on first use" durations and are measured directly.
 */
export function assertExpireDaysAllowed(
  cap: number,
  expiryTimeMs: number | undefined | null,
  nowMs = Date.now(),
): void {
  const normalizedCap = toCount(cap);
  if (normalizedCap <= 0) return;

  const expiry = Number(expiryTimeMs ?? 0);
  if (!Number.isFinite(expiry) || expiry === 0) {
    throw new BadRequestException(
      `Clients that never expire are not allowed. Your maximum is ${normalizedCap} day(s).`,
    );
  }

  const days =
    expiry < 0
      ? Math.ceil(Math.abs(expiry) / DAY_MS)
      : Math.ceil((expiry - nowMs) / DAY_MS);

  if (days > normalizedCap) {
    throw new BadRequestException(
      `Client duration of ${days} day(s) exceeds your maximum of ${normalizedCap} day(s).`,
    );
  }
}

/**
 * Resolves the effective caps for an admin on one panel.
 * In PER_PANEL mode the panel row wins; the admin-level `maxClients` still acts as a
 * global ceiling so a per-panel "unlimited" can never exceed the account total.
 */
export function resolveClientLimitCaps(
  admin: {
    quotaMode?: string;
    maxClients?: number;
    maxDeviceLimit?: number;
    maxExpireDays?: number;
  },
  panelQuota?: {
    maxClients?: number;
    maxDeviceLimit?: number;
    maxExpireDays?: number;
  } | null,
): ClientLimitCaps {
  const adminMaxClients = toCount(admin?.maxClients);
  const adminDevice = toCount(admin?.maxDeviceLimit);
  const adminExpire = toCount(admin?.maxExpireDays);

  if (admin?.quotaMode !== 'PER_PANEL' || !panelQuota) {
    return {
      maxClients: adminMaxClients,
      maxDeviceLimit: adminDevice,
      maxExpireDays: adminExpire,
    };
  }

  const panelMaxClients = toCount(panelQuota.maxClients);
  return {
    maxClients:
      panelMaxClients > 0
        ? adminMaxClients > 0
          ? Math.min(panelMaxClients, adminMaxClients)
          : panelMaxClients
        : adminMaxClients,
    maxDeviceLimit: toCount(panelQuota.maxDeviceLimit),
    maxExpireDays: toCount(panelQuota.maxExpireDays),
  };
}
