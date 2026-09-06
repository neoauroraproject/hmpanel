export const PLATFORM_FLAGS = {
  ADAPTER_XUI_V1: 'adapter_xui_v1',
  PERMISSION_ENGINE_V1: 'permission_engine_v1',
  POLICY_RESERVE_V1: 'policy_reserve_v1',
  NAV_V2: 'nav_v2',
  THEME_MARKETPLACE_V1: 'theme_marketplace_v1',
  PAYMENT_PLUGINS_V1: 'payment_plugins_v1',
} as const;

export type PlatformFlagName = (typeof PLATFORM_FLAGS)[keyof typeof PLATFORM_FLAGS];

/** Defaults: operational strangler flags OFF; structural/UX flags ON. */
export const PLATFORM_FLAG_DEFAULTS: Record<PlatformFlagName, boolean> = {
  adapter_xui_v1: false,
  permission_engine_v1: false,
  policy_reserve_v1: false,
  nav_v2: true,
  theme_marketplace_v1: true,
  payment_plugins_v1: true,
};

export const PLATFORM_FLAGS_SETTING_KEY = 'platform_feature_flags';

export function mergePlatformFlags(
  stored: unknown,
): Record<PlatformFlagName, boolean> {
  const next = { ...PLATFORM_FLAG_DEFAULTS };
  if (!stored || typeof stored !== 'object') return next;
  const rec = stored as Record<string, unknown>;
  for (const key of Object.keys(PLATFORM_FLAG_DEFAULTS) as PlatformFlagName[]) {
    if (typeof rec[key] === 'boolean') next[key] = rec[key];
  }
  return next;
}
