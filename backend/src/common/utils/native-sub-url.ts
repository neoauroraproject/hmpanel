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
