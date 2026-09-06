import { FeatureEntitlementService } from './feature-entitlement.service';

describe('FeatureEntitlementService', () => {
  it('treats premium as active license, not a raw edition string in callers', async () => {
    const entitlement = new FeatureEntitlementService(
      {
        isEnabled: jest.fn().mockResolvedValue(false),
        isFeatureEnabled: jest.fn().mockResolvedValue(false),
      } as any,
      {
        getLicenseState: jest.fn().mockResolvedValue({
          edition: 'PREMIUM',
          mode: 'full',
          status: 'active',
        }),
      } as any,
    );
    expect(await entitlement.can('premium')).toBe(true);
  });

  it('resolves module ids through FeatureManager', async () => {
    const entitlement = new FeatureEntitlementService(
      {
        isEnabled: jest.fn().mockImplementation(async (id: string) => id === 'external-panels'),
        isFeatureEnabled: jest.fn().mockResolvedValue(false),
      } as any,
      {
        getLicenseState: jest.fn().mockResolvedValue({
          edition: 'COMMUNITY',
          mode: 'disabled',
          status: 'community',
        }),
      } as any,
    );
    expect(await entitlement.can('feature.external-panels')).toBe(true);
    expect(await entitlement.can('store')).toBe(false);
  });
});
