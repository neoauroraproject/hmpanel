import { LICENSE_LEASE_KEY, LicenseManagerService } from './license-manager.service';
import { getAllModuleIds } from './manifests';
import { UNLIMITED_LEASE_EXP } from './license-lease.util';

// Modules and expiry now come only from the signed entitlement lease. The real verifier
// needs the license server's private key, so stub it to accept `lease:<json>` test tokens.
jest.mock('./license-lease.util', () => {
  const actual = jest.requireActual('./license-lease.util');
  return {
    ...actual,
    verifyEntitlementLease: (token: unknown) => {
      if (typeof token !== 'string' || !token.startsWith('lease:')) return null;
      try {
        return JSON.parse(token.slice('lease:'.length));
      } catch {
        return null;
      }
    },
  };
});

const INSTANCE = 'instance-1';

function leaseToken(fields: {
  features: string[];
  legacyFull?: boolean;
  exp?: number;
  planSlug?: string | null;
  inst?: string;
}): string {
  return `lease:${JSON.stringify({
    v: 1,
    typ: 'hmpanel-entitlement',
    prod: 'hmpanel',
    lic: 'lic_1',
    inst: fields.inst ?? INSTANCE,
    act: 'act_1',
    features: fields.features,
    legacyFull: fields.legacyFull ?? false,
    planSlug: fields.planSlug ?? null,
    exp: fields.exp ?? UNLIMITED_LEASE_EXP,
    iat: 1,
  })}`;
}

function makeService(opts: {
  storedState?: Record<string, unknown> | null;
  lease?: string | null;
  licenseKey?: string;
}) {
  const store: Record<string, string> = {};
  if (opts.storedState) store.LICENSE_STATE = JSON.stringify(opts.storedState);
  if (opts.lease) store[LICENSE_LEASE_KEY] = opts.lease;
  store.LICENSE_KEY = opts.licenseKey ?? 'HM-TEST-KEY-0001';

  const settings = {
    getSetting: jest.fn(async (key: string) => store[key] ?? ''),
    setSetting: jest.fn(async (key: string, value: string) => {
      store[key] = value;
    }),
  };

  return new LicenseManagerService(
    settings as any,
    { isBundleInstalled: () => true } as any,
    { getInstanceId: () => INSTANCE } as any,
  );
}

const activePremium = {
  status: 'active' as const,
  mode: 'full' as const,
  expiresAt: null,
  graceEndsAt: null,
  edition: 'PREMIUM' as const,
};

describe('LicenseManagerService.normalizeLicensedFeatures', () => {
  const service = makeService({ lease: leaseToken({ features: [] }) });

  it('returns module ids and never expands an empty claim', () => {
    expect(service.normalizeLicensedFeatures(['store', 'themes'])).toEqual(['store', 'themes']);
    expect(service.normalizeLicensedFeatures([])).toEqual([]);
    expect(service.normalizeLicensedFeatures(undefined)).toEqual([]);
  });

  it('maps legacy feature ids to their module', () => {
    expect(service.normalizeLicensedFeatures(['WHITE_LABEL'])).toEqual(['branding']);
  });
});

describe('LicenseManagerService entitlements come from the signed lease', () => {
  it('licenses exactly the modules named in the lease', async () => {
    const service = makeService({
      storedState: activePremium,
      lease: leaseToken({ features: ['store', 'payment-management'] }),
    });

    expect(await service.isModuleLicensed('store')).toBe(true);
    expect(await service.isModuleLicensed('payment-management')).toBe(true);
    expect(await service.isModuleLicensed('monitoring-pro')).toBe(false);
    expect((await service.getLicensedModuleIds()).sort()).toEqual([
      'payment-management',
      'store',
    ]);
  });

  it('licenses the whole catalog for a legacyFull lease', async () => {
    const service = makeService({
      storedState: activePremium,
      lease: leaseToken({ features: getAllModuleIds(), legacyFull: true }),
    });

    expect(await service.isModuleLicensed('monitoring-pro')).toBe(true);
    expect(await service.isFeatureLicensed('WHITE_LABEL')).toBe(true);
  });

  it('resolves feature ids through the module that ships them', async () => {
    const service = makeService({
      storedState: activePremium,
      lease: leaseToken({ features: ['branding'] }),
    });

    expect(await service.isFeatureLicensed('WHITE_LABEL')).toBe(true);
    expect(await service.isFeatureLicensed('REMOTE_BACKUPS')).toBe(false);
  });
});

describe('LicenseManagerService refuses anything the lease does not sign', () => {
  it('disables Premium when no lease is stored, even with a full LICENSE_STATE', async () => {
    const service = makeService({
      storedState: {
        ...activePremium,
        licensedFeatures: getAllModuleIds(),
        licensedModules: getAllModuleIds(),
        legacyFull: true,
      },
      lease: null,
    });

    const state = await service.getLicenseState();
    expect(state.status).toBe('invalid');
    expect(state.invalidReason).toBe('unsigned');
    expect(await service.getLicensedModuleIds()).toEqual([]);
    expect(await service.isModuleLicensed('store')).toBe(false);
  });

  it('ignores a lease minted for another instance', async () => {
    const service = makeService({
      storedState: activePremium,
      lease: leaseToken({ features: getAllModuleIds(), legacyFull: true, inst: 'other-box' }),
    });

    expect((await service.getLicenseState()).status).toBe('invalid');
    expect(await service.getLicensedModuleIds()).toEqual([]);
  });

  it('ignores an edited LICENSE_STATE expiry — expiry is the lease exp', async () => {
    const pastExp = Math.floor(Date.now() / 1000) - 10 * 86400;
    const service = makeService({
      // Attacker writes a far-future expiry into the stored state.
      storedState: { ...activePremium, expiresAt: '2099-01-01T00:00:00.000Z' },
      lease: leaseToken({ features: ['store'], exp: pastExp }),
    });

    const state = await service.getLicenseState();
    // 10 days past exp is beyond the 7-day grace window → disabled.
    expect(state.status).toBe('expired');
    expect(state.mode).toBe('disabled');
    expect(await service.isModuleLicensed('store')).toBe(false);
  });

  it('honours a server-side disable recorded in LICENSE_STATE', async () => {
    const service = makeService({
      storedState: {
        ...activePremium,
        status: 'invalid',
        mode: 'disabled',
        invalidReason: 'update_required',
      },
      lease: leaseToken({ features: getAllModuleIds(), legacyFull: true }),
    });

    const state = await service.getLicenseState();
    expect(state.status).toBe('invalid');
    expect(await service.getLicensedModuleIds()).toEqual([]);
  });

  it('grants read-only grace inside the window after expiry', async () => {
    const justExpired = Math.floor(Date.now() / 1000) - 86400;
    const service = makeService({
      storedState: activePremium,
      lease: leaseToken({ features: ['store'], exp: justExpired }),
    });

    const state = await service.getLicenseState();
    expect(state.status).toBe('grace');
    expect(state.mode).toBe('read_only');
  });
});
