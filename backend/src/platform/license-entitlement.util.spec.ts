import {
  entitlementSourceFromResponse,
  hydrateLicensedModules,
  normalizeToModuleIds,
  resolveEntitlement,
} from './license-entitlement.util';
import { getAllFeatureIds, getAllModuleIds } from './manifests';
import type { LicenseState } from './types/module-manifest.types';

function jwtWith(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `header.${body}.signature`;
}

describe('normalizeToModuleIds', () => {
  it('keeps module ids as-is', () => {
    expect(normalizeToModuleIds(['store', 'payment-management']).sort()).toEqual([
      'payment-management',
      'store',
    ]);
  });

  it('maps legacy feature ids onto the modules that ship them', () => {
    expect(normalizeToModuleIds(['WHITE_LABEL'])).toEqual(['branding']);
    expect(normalizeToModuleIds(['THEME_MARKETPLACE'])).toEqual(['themes']);
  });

  it('keeps ids this build has no manifest for', () => {
    expect(normalizeToModuleIds(['store', 'future-module']).sort()).toEqual([
      'future-module',
      'store',
    ]);
  });
});

describe('resolveEntitlement', () => {
  it('licenses exactly the modules the server listed', () => {
    const result = resolveEntitlement({
      features: ['store', 'payment-management', 'themes'],
      plan: 'store-commerce',
    });

    expect(result.licensedModules.sort()).toEqual([
      'payment-management',
      'store',
      'themes',
    ]);
    expect(result.legacyFull).toBe(false);
    expect(result.plan).toBe('store-commerce');
    expect(result.present).toBe(true);
  });

  it('never expands an empty feature list to full', () => {
    const result = resolveEntitlement({ features: [], plan: 'starter' });

    expect(result.licensedModules).toEqual([]);
    expect(result.legacyFull).toBe(false);
    expect(result.present).toBe(true);
  });

  it('licenses nothing when the plan lists no modules', () => {
    expect(resolveEntitlement({ plan: 'starter' })).toMatchObject({
      licensedModules: [],
      legacyFull: false,
      present: true,
    });
  });

  it('honours an explicit legacyFull / entitlementMode signal', () => {
    expect(resolveEntitlement({ features: [], entitlements: { legacyFull: true } })).toMatchObject({
      legacyFull: true,
    });
    expect(resolveEntitlement({ entitlementMode: 'full', plan: 'legacy' })).toMatchObject({
      legacyFull: true,
      licensedModules: getAllModuleIds(),
    });
  });

  it('treats a list covering the whole catalog as full', () => {
    const result = resolveEntitlement({ features: getAllModuleIds() });
    expect(result.legacyFull).toBe(true);
  });

  it('treats a token enumerating every legacy feature id as full', () => {
    const result = resolveEntitlement({ features: getAllFeatureIds() });
    expect(result.legacyFull).toBe(true);
    expect(result.licensedModules).toEqual(expect.arrayContaining(getAllModuleIds()));
  });

  it('does not treat a partial legacy feature list as full', () => {
    const result = resolveEntitlement({ features: ['WHITE_LABEL', 'REMOTE_BACKUPS'] });
    expect(result.legacyFull).toBe(false);
    expect(result.licensedModules.sort()).toEqual(['backup-center', 'branding']);
  });

  it('treats a payload with neither modules nor plan as a pre-modular license', () => {
    const result = resolveEntitlement({});
    expect(result.legacyFull).toBe(true);
    expect(result.licensedModules).toEqual(getAllModuleIds());
    expect(result.present).toBe(false);
  });

  it('reads entitlements.modules when features is absent', () => {
    expect(
      resolveEntitlement({ entitlements: { modules: ['store'], plan: 'shop' } }),
    ).toMatchObject({ licensedModules: ['store'], legacyFull: false, plan: 'shop' });
  });
});

describe('entitlementSourceFromResponse', () => {
  it('falls back to the JWT claims when the response body has no entitlements', () => {
    const data = {
      entitlementJwt: jwtWith({ features: ['store'], plan: 'store-commerce' }),
    };
    expect(resolveEntitlement(entitlementSourceFromResponse(data))).toMatchObject({
      licensedModules: ['store'],
      plan: 'store-commerce',
      legacyFull: false,
    });
  });

  it('prefers response fields over JWT claims', () => {
    const data = {
      features: ['themes'],
      entitlementJwt: jwtWith({ features: ['store'] }),
    };
    expect(resolveEntitlement(entitlementSourceFromResponse(data))).toMatchObject({
      licensedModules: ['themes'],
    });
  });

  it('does not license anything for a revoked token with an empty claim', () => {
    const data = { entitlementJwt: jwtWith({ features: [], plan: 'revoked' }) };
    expect(resolveEntitlement(entitlementSourceFromResponse(data))).toMatchObject({
      licensedModules: [],
      legacyFull: false,
    });
  });
});

describe('hydrateLicensedModules', () => {
  const base: LicenseState = {
    status: 'active',
    mode: 'full',
    expiresAt: null,
    graceEndsAt: null,
    licensedFeatures: [],
    edition: 'PREMIUM',
  };

  it('upgrades a pre-modular state that stored every feature id', () => {
    const hydrated = hydrateLicensedModules({ ...base, licensedFeatures: getAllFeatureIds() });
    expect(hydrated.legacyFull).toBe(true);
    expect(hydrated.licensedModules).toEqual(getAllModuleIds());
  });

  it('licenses nothing for an empty stored list', () => {
    const hydrated = hydrateLicensedModules({ ...base, licensedFeatures: [] });
    expect(hydrated.licensedModules).toEqual([]);
    expect(hydrated.legacyFull).toBe(false);
  });

  it('maps a partial stored feature list onto its modules', () => {
    const hydrated = hydrateLicensedModules({
      ...base,
      licensedFeatures: ['WHITE_LABEL'],
    });
    expect(hydrated.licensedModules).toEqual(['branding']);
    expect(hydrated.legacyFull).toBe(false);
  });

  it('leaves an already-modular state untouched', () => {
    const state = { ...base, licensedModules: ['store'], licensedFeatures: ['store'] };
    expect(hydrateLicensedModules(state)).toBe(state);
  });
});
