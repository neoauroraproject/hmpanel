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

/**
 * Public 3x-ui /sub/ feeds only (`panel.subUrl`).
 * Fetching `/sub/` from `panel.url` (API host) makes 3x-ui stamp that host
 * into vless/vmess addresses when Hosts are empty — never use that for configs.
 */
export function collectPublicNativeSubscriptionUrls(
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
    const subUrl = String(ib?.panel?.subUrl || '').trim();
    if (!subUrl) continue;
    const built = buildNativeSubscriptionUrl(subUrl, null, key);
    if (built) urls.add(built);
  }
  return [...urls];
}

export function hostnameFromPanelUrl(raw: string | null | undefined): string | null {
  const value = String(raw || '').trim();
  if (!value) return null;
  try {
    const host = new URL(value.includes('://') ? value : `https://${value}`).hostname
      .replace(/^www\./i, '')
      .toLowerCase();
    return host || null;
  } catch {
    return null;
  }
}

export function panelApiHostnames(
  inbounds: Array<{
    panel?: { url?: string | null } | null;
  }>,
): string[] {
  const hosts = new Set<string>();
  for (const ib of inbounds || []) {
    const host = hostnameFromPanelUrl(ib?.panel?.url);
    if (host) hosts.add(host);
  }
  return [...hosts];
}

export function panelSubUrlHostnames(
  inbounds: Array<{
    panel?: { subUrl?: string | null } | null;
  }>,
): string[] {
  const hosts = new Set<string>();
  for (const ib of inbounds || []) {
    const host = hostnameFromPanelUrl(ib?.panel?.subUrl);
    if (host) hosts.add(host);
  }
  return [...hosts];
}

/**
 * Hostnames that 3x-ui `/sub/` may stamp into vless/vmess when Hosts are empty
 * or when the request Host is the subscription CDN — never treat these as node
 * addresses. Includes both the API URL and `panel.subUrl`.
 */
export function panelDeliveryHostnames(
  inbounds: Array<{
    panel?: { url?: string | null; subUrl?: string | null } | null;
  }>,
): string[] {
  const hosts = new Set<string>([
    ...panelApiHostnames(inbounds),
    ...panelSubUrlHostnames(inbounds),
  ]);
  return [...hosts];
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

/**
 * Customer-facing subscription URL: native panel snapshot (Eylan / Pasarguard)
 * first, otherwise the store `/s/{subId}` link used for 3x-ui.
 */
export function customerFacingSubscriptionUrl(opts: {
  providerMeta?: unknown;
  panelSubUrl?: string | null;
  storeSubUrl?: string | null;
}): string | null {
  const native = subscriptionUrlFromProviderMeta(opts.providerMeta);
  if (native) {
    return rewriteSubscriptionDeliveryHost(native, opts.panelSubUrl) || native;
  }
  const store = String(opts.storeSubUrl || '').trim();
  return store || null;
}
