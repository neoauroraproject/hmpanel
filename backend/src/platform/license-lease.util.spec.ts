import { generateKeyPairSync, sign, type KeyObject } from 'crypto';
import {
  UNLIMITED_LEASE_EXP,
  leaseExpiresAtIso,
  verifyEntitlementLease,
  type PanelEntitlementLease,
} from './license-lease.util';

const { publicKey, privateKey } = generateKeyPairSync('ed25519');
const otherKey = generateKeyPairSync('ed25519').publicKey;

function b64url(b: Buffer): string {
  return b.toString('base64url');
}

/** Mirrors the license server: `base64url(json).base64url(ed25519(json))`. */
function makeLease(overrides: Partial<PanelEntitlementLease> = {}, key: KeyObject = privateKey): string {
  const payload: PanelEntitlementLease = {
    v: 1,
    typ: 'hmpanel-entitlement',
    prod: 'hmpanel',
    lic: 'lic_1',
    inst: 'inst_1',
    act: 'act_1',
    features: ['store', 'themes'],
    legacyFull: false,
    planSlug: 'store-commerce',
    exp: Math.floor(Date.now() / 1000) + 3600,
    iat: Math.floor(Date.now() / 1000),
    ...overrides,
  };
  const body = Buffer.from(JSON.stringify(payload));
  return `${b64url(body)}.${b64url(sign(null, body, key))}`;
}

describe('verifyEntitlementLease', () => {
  it('accepts a well-formed lease signed by the matching key', () => {
    const lease = verifyEntitlementLease(makeLease(), publicKey);
    expect(lease).not.toBeNull();
    expect(lease?.features).toEqual(['store', 'themes']);
    expect(lease?.planSlug).toBe('store-commerce');
  });

  it('rejects a lease signed by a different key', () => {
    expect(verifyEntitlementLease(makeLease({}, generateKeyPairSync('ed25519').privateKey), publicKey)).toBeNull();
    expect(verifyEntitlementLease(makeLease(), otherKey)).toBeNull();
  });

  it('rejects a tampered payload — editing exp breaks the signature', () => {
    const [body, sig] = makeLease({ exp: Math.floor(Date.now() / 1000) + 3600 }).split('.');
    const original = JSON.parse(Buffer.from(body, 'base64url').toString());
    const forgedBody = Buffer.from(JSON.stringify({ ...original, exp: UNLIMITED_LEASE_EXP })).toString('base64url');
    expect(verifyEntitlementLease(`${forgedBody}.${sig}`, publicKey)).toBeNull();
  });

  it('rejects malformed tokens', () => {
    expect(verifyEntitlementLease('', publicKey)).toBeNull();
    expect(verifyEntitlementLease('onlyonepart', publicKey)).toBeNull();
    expect(verifyEntitlementLease('a.b.c', publicKey)).toBeNull();
    expect(verifyEntitlementLease(null, publicKey)).toBeNull();
    expect(verifyEntitlementLease(42 as unknown, publicKey)).toBeNull();
    const [body] = makeLease().split('.');
    expect(verifyEntitlementLease(`${body}.`, publicKey)).toBeNull();
  });

  it('rejects the wrong product or token type even when correctly signed', () => {
    expect(verifyEntitlementLease(makeLease({ prod: 'nope' as any }), publicKey)).toBeNull();
    expect(verifyEntitlementLease(makeLease({ typ: 'lease' as any }), publicKey)).toBeNull();
    expect(verifyEntitlementLease(makeLease({ v: 2 as any }), publicKey)).toBeNull();
  });

  it('requires an expiry and a string feature list', () => {
    expect(verifyEntitlementLease(makeLease({ exp: 0 }), publicKey)).toBeNull();
    expect(verifyEntitlementLease(makeLease({ exp: undefined as any }), publicKey)).toBeNull();
    expect(verifyEntitlementLease(makeLease({ features: [1, 2] as any }), publicKey)).toBeNull();
  });

  it('treats a lifetime lease as no expiry for display', () => {
    const lease = verifyEntitlementLease(makeLease({ exp: UNLIMITED_LEASE_EXP }), publicKey)!;
    expect(leaseExpiresAtIso(lease)).toBeNull();
    const dated = verifyEntitlementLease(makeLease({ exp: 1893456000 }), publicKey)!;
    expect(leaseExpiresAtIso(dated)).toBe(new Date(1893456000 * 1000).toISOString());
  });
});
