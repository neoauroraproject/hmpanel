import { getLicenseServerUrls } from './license-server.client';

export type PanelAd = {
  id: string;
  title: string;
  body: string;
  buttonText: string;
  linkUrl: string;
  badge: string;
};

export type PanelAdsResponse = {
  product: string;
  ads: PanelAd[];
};

const DEFAULT_ADS_HOST = 'https://license.hossein-m466.workers.dev';

function productSlug(): string {
  return (process.env.LICENSE_PRODUCT_ID || 'hmpanel').trim() || 'hmpanel';
}

function adsBases(): string[] {
  const extra = process.env.LICENSE_ADS_URL?.trim().replace(/\/$/, '');
  return [
    ...new Set(
      [
        ...getLicenseServerUrls(),
        extra,
        DEFAULT_ADS_HOST,
      ].filter((u): u is string => !!u),
    ),
  ];
}

function asAd(raw: unknown): PanelAd | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' ? o.id.trim() : '';
  const title = typeof o.title === 'string' ? o.title.trim() : '';
  const body = typeof o.body === 'string' ? o.body.trim() : '';
  const buttonText =
    typeof o.buttonText === 'string' ? o.buttonText.trim() : '';
  const linkUrl = typeof o.linkUrl === 'string' ? o.linkUrl.trim() : '';
  const badge = typeof o.badge === 'string' ? o.badge.trim() : '';
  if (!id || !title || !linkUrl) return null;
  if (!/^https?:\/\//i.test(linkUrl)) return null;
  return {
    id: id.slice(0, 80),
    title: title.slice(0, 120),
    body: body.slice(0, 400),
    buttonText: (buttonText || 'Open').slice(0, 60),
    linkUrl: linkUrl.slice(0, 500),
    badge: (badge || 'Ads').slice(0, 24),
  };
}

/** Fetch Community ads from the license/ads host (no license key required). */
export async function fetchPanelAds(): Promise<PanelAdsResponse> {
  const product = productSlug();
  const bases = adsBases();

  for (const base of bases) {
    try {
      const url = `${base}/v1/ads?product=${encodeURIComponent(product)}`;
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json', 'User-Agent': 'HMPanel' },
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) continue;
      const data = (await res.json().catch(() => null)) as Record<
        string,
        unknown
      > | null;
      if (!data) continue;

      const list = Array.isArray(data.ads) ? data.ads : [];
      const fromList = list.map(asAd).filter((a): a is PanelAd => !!a);
      const single = asAd(data.ad);
      const ads =
        fromList.length > 0 ? fromList : single ? [single] : [];

      return { product, ads };
    } catch {
      /* try next host */
    }
  }

  return { product, ads: [] };
}
