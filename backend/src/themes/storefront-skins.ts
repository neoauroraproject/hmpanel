/**
 * Built-in storefront packs. Branding (logo, name, colors, support links)
 * always comes from Branding / store profile — packs change structure + chrome.
 */
export type StorefrontSkinId = 'default' | 'atelier' | 'noir' | 'harbor';
export type StorefrontLayoutId = 'classic' | 'market' | 'minimal';

export type StorefrontSkinSettings = {
  skin?: StorefrontSkinId | string;
  layout?: StorefrontLayoutId | string;
  version?: number;
  customCss?: string;
  cssVars?: Record<string, string>;
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
      'Classic catalog: centered hero, category tiles, then stacked plan cards. Light slate chrome.',
    settings: {
      skin: 'atelier',
      layout: 'classic',
      version: 2,
      preview: { accent: '#0D9488', bg: '#F1F5F9', label: 'Classic' },
    },
  },
  {
    key: 'noir',
    slug: 'starter-noir',
    name: 'Noir Ledger',
    description:
      'Market layout: slim header, category rail on the side, compact plan rows. Dark cinema chrome.',
    settings: {
      skin: 'noir',
      layout: 'market',
      version: 2,
      preview: { accent: '#CA8A04', bg: '#0C0A09', label: 'Market' },
    },
  },
  {
    key: 'harbor',
    slug: 'starter-harbor',
    name: 'Harbor',
    description:
      'Minimal layout: no oversized hero, full-width mobile plans, sticky bottom actions. Warm paper chrome.',
    settings: {
      skin: 'harbor',
      layout: 'minimal',
      version: 2,
      preview: { accent: '#B45309', bg: '#EDE6D9', label: 'Minimal' },
    },
  },
];

export function resolveStorefrontSkin(settings: unknown): StorefrontSkinId {
  if (!settings || typeof settings !== 'object') return 'default';
  const skin = String((settings as StorefrontSkinSettings).skin || '')
    .trim()
    .toLowerCase();
  if (skin === 'atelier' || skin === 'noir' || skin === 'harbor') return skin;
  return 'default';
}

export function resolveStorefrontLayout(settings: unknown): StorefrontLayoutId {
  if (settings && typeof settings === 'object') {
    const layout = String((settings as StorefrontSkinSettings).layout || '')
      .trim()
      .toLowerCase();
    if (layout === 'classic' || layout === 'market' || layout === 'minimal') return layout;
  }
  const skin = resolveStorefrontSkin(settings);
  if (skin === 'noir') return 'market';
  if (skin === 'harbor') return 'minimal';
  return 'classic';
}

export function sanitizeThemeCss(raw: unknown): string {
  const css = String(raw || '').slice(0, 24_000);
  if (!css.trim()) return '';
  const blocked = /@import|expression\s*\(|javascript\s*:|behavior\s*:|<script|<\/style|url\s*\(\s*['"]?\s*data:/i;
  if (blocked.test(css)) {
    return css
      .replace(/@import[^;]+;?/gi, '')
      .replace(/expression\s*\([^)]*\)/gi, 'none')
      .replace(/javascript\s*:/gi, '')
      .replace(/behavior\s*:[^;]+;?/gi, '')
      .replace(/<\/?script[^>]*>/gi, '')
      .replace(/url\s*\(\s*['"]?\s*data:[^)]*\)/gi, 'none');
  }
  return css;
}
