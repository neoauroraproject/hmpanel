import { LicenseManagerService } from './license-manager.service';
import { getAllFeatureIds, getAllModuleIds } from './manifests';
import type { LicenseState } from './types/module-manifest.types';

function makeService(storedState: Partial<LicenseState> | null) {
  const settings = {
    getSetting: jest.fn(async (key: string) =>
      key === 'LICENSE_STATE' && storedState ? JSON.stringify(storedState) : '',
    ),
    setSetting: jest.fn(),
  };

  return new LicenseManagerService(
    settings as any,
    { isBundleInstalled: () => true } as any,
    { getInstanceId: () => 'instance-1' } as any,
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
  const service = makeService(null);

  it('returns module ids and never expands an empty claim', () => {
    expect(service.normalizeLicensedFeatures(['store', 'themes'])).toEqual(['store', 'themes']);
    expect(service.normalizeLicensedFeatures([])).toEqual([]);
    expect(service.normalizeLicensedFeatures(undefined)).toEqual([]);
  });

  it('maps legacy feature ids to their module', () => {
    expect(service.normalizeLicensedFeatures(['WHITE_LABEL'])).toEqual(['branding']);
  });
});

describe('LicenseManagerService module entitlements', () => {
  it('licenses only the stored module set', async () => {
    const service = makeService({
      ...activePremium,
      licensedFeatures: ['store', 'payment-management'],
      licensedModules: ['store', 'payment-management'],
      legacyFull: false,
      licensePlan: 'store-commerce',
    });

    expect(await service.isModuleLicensed('store')).toBe(true);
    expect(await service.isModuleLicensed('payment-management')).toBe(true);
    expect(await service.isModuleLicensed('monitoring-pro')).toBe(false);
    expect((await service.getLicensedModuleIds()).sort()).toEqual([
      'payment-management',
      'store',
    ]);
  });

  it('licenses nothing for an empty module set', async () => {
    const service = makeService({
      ...activePremium,
      licensedFeatures: [],
      licensedModules: [],
      legacyFull: false,
    });

    expect(await service.getLicensedModuleIds()).toEqual([]);
    expect(await service.isModuleLicensed('store')).toBe(false);
    expect(await service.isFeatureLicensed('WHITE_LABEL')).toBe(false);
  });

  it('licenses the whole catalog for a legacy full license', async () => {
    const service = makeService({
      ...activePremium,
      licensedFeatures: getAllModuleIds(),
      licensedModules: getAllModuleIds(),
      legacyFull: true,
    });

    expect(await service.isModuleLicensed('monitoring-pro')).toBe(true);
    expect(await service.isFeatureLicensed('WHITE_LABEL')).toBe(true);
  });

  it('back-fills pre-modular states that stored every feature id', async () => {
    const service = makeService({
      ...activePremium,
      licensedFeatures: getAllFeatureIds(),
    });

    const state = await service.getLicenseState();
    expect(state.legacyFull).toBe(true);
    expect(await service.isModuleLicensed('admin-recharge')).toBe(true);
  });

  it('revokes everything when the stored license is invalid', async () => {
    const service = makeService({
      ...activePremium,
      status: 'invalid',
      mode: 'disabled',
      licensedFeatures: getAllModuleIds(),
      licensedModules: getAllModuleIds(),
      legacyFull: true,
    });

    expect(await service.getLicensedModuleIds()).toEqual([]);
    expect(await service.isModuleLicensed('store')).toBe(false);
  });

  it('resolves feature ids through the module that ships them', async () => {
    const service = makeService({
      ...activePremium,
      licensedFeatures: ['branding'],
      licensedModules: ['branding'],
      legacyFull: false,
    });

    expect(await service.isFeatureLicensed('WHITE_LABEL')).toBe(true);
    expect(await service.isFeatureLicensed('REMOTE_BACKUPS')).toBe(false);
  });
});
