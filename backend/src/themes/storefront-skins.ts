/**
 * Built-in storefront skins. Branding (logo, name, colors, support links)
 * always comes from the Branding / store profile — skins only change layout chrome.
 */
export type StorefrontSkinId = 'default' | 'atelier' | 'noir';

export type StorefrontSkinSettings = {
  skin?: StorefrontSkinId | string;
  version?: number;
  preview?: { accent?: string; bg?: string; label?: string };
};

export const STOREFRONT_STARTERS: Array<{
  key: string;
  slug: string;
  name: string;
  description: string;
  settings: StorefrontSkinSettings;
}> = [
  {
    key: 'atelier',
    slug: 'starter-atelier',
    name: 'Atelier',
    description:
      'Clean slate catalog with teal accents — Plus Jakarta feel, quiet surfaces, branding-led hero.',
    settings: {
      skin: 'atelier',
      version: 1,
      preview: { accent: '#0D9488', bg: '#F1F5F9', label: 'Atelier' },
    },
  },
  {
    key: 'noir',
    slug: 'starter-noir',
    name: 'Noir Ledger',
    description:
      'Dark cinema storefront with gold CTA — sharp type, glass panels, branding as the only color wash.',
    settings: {
      skin: 'noir',
      version: 1,
      preview: { accent: '#CA8A04', bg: '#0C0A09', label: 'Noir' },
    },
  },
];

export function resolveStorefrontSkin(
  settings: unknown,
): StorefrontSkinId {
  if (!settings || typeof settings !== 'object') return 'default';
  const skin = String((settings as StorefrontSkinSettings).skin || '')
    .trim()
    .toLowerCase();
  if (skin === 'atelier' || skin === 'noir') return skin;
  return 'default';
}
