import { mergePlatformFlags, PLATFORM_FLAG_DEFAULTS } from './feature-flags';

describe('platform feature flags', () => {
  it('defaults operational strangler flags to off', () => {
    const flags = mergePlatformFlags(null);
    expect(flags.adapter_xui_v1).toBe(false);
    expect(flags.permission_engine_v1).toBe(false);
    expect(flags.policy_reserve_v1).toBe(false);
  });

  it('defaults nav and structure flags to on', () => {
    expect(PLATFORM_FLAG_DEFAULTS.nav_v2).toBe(true);
    expect(PLATFORM_FLAG_DEFAULTS.theme_marketplace_v1).toBe(true);
    expect(PLATFORM_FLAG_DEFAULTS.payment_plugins_v1).toBe(true);
  });

  it('merges stored booleans without inventing unknown keys', () => {
    const flags = mergePlatformFlags({ adapter_xui_v1: true, unknown: true });
    expect(flags.adapter_xui_v1).toBe(true);
    expect((flags as any).unknown).toBeUndefined();
  });
});
