import { createPublicKey, verify, type KeyObject } from 'crypto';

/**
 * Ed25519 public key of the license server's `LEASE_SIGNING_KEY` (raw 32 bytes, base64).
 * Only leases signed by the matching private key unlock Premium; the HS256
 * `entitlementJwt` cannot be checked here and is never trusted for expiry or modules.
 */
const LICENSE_LEASE_PUBLIC_KEY_B64 = 'MkkO8qRzqNFJoWDhjqOveOkcv/AI2cErhWTbyGb5Tfs=';

/** Sent on every license-server call; the server locks out panels below its minimum. */
export const LICENSE_PROTOCOL = 2;

/** 2100-01-01T00:00:00Z — the server's stand-in for "no expiry". */
export const UNLIMITED_LEASE_EXP = 4102444800;

export interface PanelEntitlementLease {
  v: 1;
  typ: 'hmpanel-entitlement';
  prod: 'hmpanel';
  lic: string;
  inst: string;
  act: string;
  features: string[];
  legacyFull: boolean;
  planSlug: string | null;
  exp: number;
  iat: number;
}

let embeddedKey: KeyObject | null = null;

function publicKeyFromRaw(rawB64: string): KeyObject {
  const x = Buffer.from(rawB64, 'base64').toString('base64url');
  return createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519', x }, format: 'jwk' });
}

function defaultKey(): KeyObject {
  embeddedKey ??= publicKeyFromRaw(LICENSE_LEASE_PUBLIC_KEY_B64);
  return embeddedKey;
}

/**
 * Returns the lease payload when the signature checks out and every field has the
 * expected shape, otherwise null. Expiry is NOT checked here — callers apply grace.
 */
export function verifyEntitlementLease(
  token: unknown,
  publicKey: KeyObject = defaultKey(),
): PanelEntitlementLease | null {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;

  try {
    const body = Buffer.from(parts[0], 'base64url');
    const sig = Buffer.from(parts[1], 'base64url');
    if (sig.length !== 64 || !verify(null, body, publicKey, sig)) return null;

    const p = JSON.parse(body.toString('utf8')) as Record<string, unknown>;
    if (
      p.v !== 1 ||
      p.typ !== 'hmpanel-entitlement' ||
      p.prod !== 'hmpanel' ||
      typeof p.lic !== 'string' ||
      typeof p.inst !== 'string' ||
      typeof p.exp !== 'number' ||
      !Number.isFinite(p.exp) ||
      p.exp <= 0 ||
      !Array.isArray(p.features) ||
      !p.features.every((f) => typeof f === 'string')
    ) {
      return null;
    }
    return {
      v: 1,
      typ: 'hmpanel-entitlement',
      prod: 'hmpanel',
      lic: p.lic,
      inst: p.inst,
      act: typeof p.act === 'string' ? p.act : '',
      features: p.features as string[],
      legacyFull: p.legacyFull === true,
      planSlug: typeof p.planSlug === 'string' ? p.planSlug : null,
      exp: p.exp,
      iat: typeof p.iat === 'number' ? p.iat : 0,
    };
  } catch {
    return null;
  }
}

/** Display expiry: lifetime leases show as "no expiry" (null). */
export function leaseExpiresAtIso(lease: PanelEntitlementLease): string | null {
  return lease.exp >= UNLIMITED_LEASE_EXP ? null : new Date(lease.exp * 1000).toISOString();
}
