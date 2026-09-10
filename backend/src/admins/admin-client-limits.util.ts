import { BadRequestException } from '@nestjs/common';

/**
 * Caps a reseller must respect when creating or editing clients.
 * `0` always means "no cap" — the reseller may pick any value, including unlimited.
 */
export type ClientLimitCaps = {
  maxClients: number; // 0 unlimited capacity
  maxDeviceLimit: number; // 0 unlimited
  maxExpireDays: number; // 0 unlimited
  maxClientTrafficGb: number; // 0 unlimited
};

const DAY_MS = 86_400_000;
const BYTES_PER_GB = 1024 ** 3;

function toCount(value: unknown): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function toBytes(value: number | bigint | null): bigint {
  if (value === null) return 0n;
  if (typeof value === 'bigint') return value < 0n ? 0n : value;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0n;
  return BigInt(Math.trunc(n));
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
 * Validates the traffic a reseller wants to put on one client.
 * A cap > 0 forbids unlimited (0 bytes) and anything above cap GB.
 * `undefined` skips the check (the field is not being changed).
 */
export function assertClientTrafficAllowed(
  capGb: number,
  totalBytes?: number | bigint | null,
): void {
  const normalizedCap = toCount(capGb);
  if (normalizedCap <= 0) return;
  if (totalBytes === undefined) return;

  const bytes = toBytes(totalBytes);
  if (bytes <= 0n) {
    throw new BadRequestException(
      `Unlimited client traffic is not allowed. Your maximum is ${normalizedCap} GB.`,
    );
  }

  const capBytes = BigInt(normalizedCap) * BigInt(BYTES_PER_GB);
  if (bytes > capBytes) {
    const requestedGb = Number(bytes) / BYTES_PER_GB;
    const shown =
      Number.isInteger(requestedGb) ? String(requestedGb) : requestedGb.toFixed(2);
    throw new BadRequestException(
      `Client traffic of ${shown} GB exceeds your maximum of ${normalizedCap} GB.`,
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
    maxClientTrafficGb?: number;
  },
  panelQuota?: {
    maxClients?: number;
    maxDeviceLimit?: number;
    maxExpireDays?: number;
    maxClientTrafficGb?: number;
  } | null,
): ClientLimitCaps {
  const adminMaxClients = toCount(admin?.maxClients);
  const adminDevice = toCount(admin?.maxDeviceLimit);
  const adminExpire = toCount(admin?.maxExpireDays);
  const adminTraffic = toCount(admin?.maxClientTrafficGb);

  if (admin?.quotaMode !== 'PER_PANEL' || !panelQuota) {
    return {
      maxClients: adminMaxClients,
      maxDeviceLimit: adminDevice,
      maxExpireDays: adminExpire,
      maxClientTrafficGb: adminTraffic,
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
    maxClientTrafficGb: toCount(panelQuota.maxClientTrafficGb),
  };
}
