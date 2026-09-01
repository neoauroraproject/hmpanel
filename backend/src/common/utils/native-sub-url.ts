/**
 * Build a 3x-ui native subscription URL.
 * Must match frontend portal-kit `buildNativeSubUrl`:
 * - If `subUrl` is set, append the key to it as-is (do NOT force another `/sub/`).
 * - If only panel `url` is set, use `{origin}/sub/{key}` (ignore webBasePath).
 */
export function buildNativeSubscriptionUrl(
  panelSubUrl: string | null | undefined,
  panelUrl: string | null | undefined,
  key: string,
): string | null {
  const rawKey = String(key || '').trim();
  if (!rawKey) return null;
  const encoded = encodeURIComponent(rawKey);

  const subUrl = String(panelSubUrl || '').trim();
  if (subUrl) {
    const base = subUrl.endsWith('/') ? subUrl : `${subUrl}/`;
    return `${base}${encoded}`;
  }

  const url = String(panelUrl || '').trim();
  if (!url) return null;

  try {
    const parsed = new URL(url);
    return `${parsed.origin}/sub/${encoded}`;
  } catch {
    const base = url.endsWith('/') ? url : `${url}/`;
    return `${base}sub/${encoded}`;
  }
}

/** Collect unique native sub URLs for a client across its linked inbounds/panels. */
export function collectNativeSubscriptionUrls(
  inbounds: Array<{
    panel?: {
      subUrl?: string | null;
      url?: string | null;
    } | null;
  }>,
  key: string,
): string[] {
  const urls = new Set<string>();
  for (const ib of inbounds || []) {
    const built = buildNativeSubscriptionUrl(
      ib?.panel?.subUrl,
      ib?.panel?.url,
      key,
    );
    if (built) urls.add(built);
  }
  return [...urls];
}

/** Prefer a stored provider snapshot URL over a constructed 3x-ui `/sub/{key}` path. */
export function subscriptionUrlFromProviderMeta(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object') return null;
  const rec = meta as Record<string, unknown>;
  const url = String(
    rec.subscriptionUrl || rec.sub_url || rec.subscription_url || '',
  ).trim();
  return url || null;
}

/**
 * Rewrite only the hostname of a provider subscription URL using panel.subUrl
 * (delivery domain). Path and query stay intact — Eylan is `/sub/{token}/{user}`.
 */
export function rewriteSubscriptionDeliveryHost(
  nativeUrl: string,
  deliveryBase?: string | null,
): string {
  const src = String(nativeUrl || '').trim();
  if (!src) return src;
  const base = String(deliveryBase || '').trim();
  if (!base) return src;
  try {
    const dest = new URL(base.includes('://') ? base : `https://${base}`);
    const parsed = new URL(src);
    parsed.hostname = dest.hostname;
    parsed.port = dest.port;
    return parsed.toString();
  } catch {
    return src;
  }
}
