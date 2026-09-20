import { FeatureManagerService } from './feature-manager.service';
import { getAllModuleIds } from './manifests';
import type { LicenseState } from './types/module-manifest.types';

function makeManager(license: Partial<LicenseState>) {
  const state: LicenseState = {
    status: 'active',
    mode: 'full',
    expiresAt: null,
    graceEndsAt: null,
    licensedFeatures: license.licensedModules ?? [],
    licensedModules: [],
    legacyFull: false,
    edition: 'PREMIUM',
    ...license,
  };

  return new FeatureManagerService(
    { getLicenseState: jest.fn().mockResolvedValue(state) } as any,
    // Every module is switched on in the DB so the assertions isolate licensing.
    { premiumModuleState: { findUnique: jest.fn().mockResolvedValue({ enabled: true }) } } as any,
  );
}

async function readableModules(service: FeatureManagerService): Promise<string[]> {
  const readable: string[] = [];
  for (const id of getAllModuleIds()) {
    const access = await service.getModuleAccess(id);
    if (access.canRead) readable.push(id);
  }
  return readable;
}

describe('FeatureManagerService.getModuleAccess', () => {
  it('allows only the modules a store-commerce plan licenses', async () => {
    const service = makeManager({
      licensedModules: ['store', 'payment-management', 'themes'],
      licensePlan: 'store-commerce',
    });

    expect((await readableModules(service)).sort()).toEqual([
      'payment-management',
      'store',
      'themes',
    ]);
    expect((await service.getModuleAccess('monitoring-pro')).canRead).toBe(false);
    expect((await service.getModuleAccess('store')).canWrite).toBe(true);
  });

  it('licenses nothing when the module set is empty and the license is not legacy full', async () => {
    const service = makeManager({ licensedModules: [] });
    expect(await readableModules(service)).toEqual([]);
  });

  it('does not auto-pass modules that declare no features', async () => {
    const service = makeManager({ licensedModules: ['store'] });

    // client-templates / admin-recharge / payment-management have `features: []`.
    expect((await service.getModuleAccess('client-templates')).canRead).toBe(false);
    expect((await service.getModuleAccess('admin-recharge')).canRead).toBe(false);
    expect((await service.getModuleAccess('payment-management')).canRead).toBe(false);
  });

  it('grants the whole catalog to a legacy full license', async () => {
    const service = makeManager({ licensedModules: getAllModuleIds(), legacyFull: true });
    expect((await readableModules(service)).sort()).toEqual(getAllModuleIds().sort());
  });

  it('denies everything for an invalid license', async () => {
    const service = makeManager({
      status: 'invalid',
      mode: 'disabled',
      licensedModules: getAllModuleIds(),
      legacyFull: true,
    });
    expect(await readableModules(service)).toEqual([]);
  });

  it('denies everything on a community edition', async () => {
    const service = makeManager({
      edition: 'COMMUNITY',
      status: 'community',
      mode: 'disabled',
      licensedModules: getAllModuleIds(),
      legacyFull: true,
    });
    expect(await readableModules(service)).toEqual([]);
  });

  it('keeps licensed modules readable but not writable in read-only mode', async () => {
    const service = makeManager({ mode: 'read_only', licensedModules: ['store'] });
    const access = await service.getModuleAccess('store');
    expect(access.canRead).toBe(true);
    expect(access.canWrite).toBe(false);
  });

  it('accepts legacy feature ids that fully cover a module', async () => {
    const service = makeManager({ licensedModules: ['WHITE_LABEL'] });
    expect((await service.getModuleAccess('branding')).canRead).toBe(true);
    expect((await service.getModuleAccess('store')).canRead).toBe(false);
  });
});
