/**
 * Local route to a 3x-ui panel on the same server as HMPanel.
 *
 * Panels are saved with their public address (domain or IP). When the panel runs on
 * this very server, going out to the domain and back adds DNS, CDN and TLS round
 * trips. A local route keeps the saved URL for display and links, and only swaps the
 * origin of API calls for a local one (for example http://host.docker.internal:2053).
 */

/** Hosts that reach the machine HMPanel runs on: from Docker first, then a bare install. */
export const LOCAL_HOST_CANDIDATES = ['host.docker.internal', '172.17.0.1', '127.0.0.1'];

/** Origin only (`scheme://host:port`), or null when the value is not an http(s) URL. */
export function normalizeLocalOrigin(raw: unknown): string | null {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(text) && !/^https?:\/\//i.test(text)) return null;
  try {
    const u = new URL(/^https?:\/\//i.test(text) ? text : `http://${text}`);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname) return null;
    return u.origin.toLowerCase();
  } catch {
    return null;
  }
}

/** Port a URL really uses (explicit, or the scheme default). */
export function effectivePort(u: URL): string {
  return u.port || (u.protocol === 'https:' ? '443' : '80');
}

/**
 * Local origins worth trying for a saved panel URL: every local host, same port,
 * the saved scheme first (3x-ui with its own certificate) then the other one.
 */
export function localRouteCandidates(panelUrl: string, hosts = LOCAL_HOST_CANDIDATES): string[] {
  let u: URL;
  try {
    u = new URL(panelUrl);
  } catch {
    return [];
  }
  const port = effectivePort(u);
  const schemes = u.protocol === 'https:' ? ['https:', 'http:'] : ['http:', 'https:'];
  const out: string[] = [];
  for (const host of hosts) {
    for (const scheme of schemes) out.push(`${scheme}//${host}:${port}`);
  }
  return out;
}

/** The request URL with its origin swapped for the local one; path and query stay. */
export function rewriteToLocal(fullUrl: string, localOrigin: string): string {
  const u = new URL(fullUrl);
  const local = new URL(localOrigin);
  u.protocol = local.protocol;
  u.hostname = local.hostname;
  u.port = local.port;
  return u.toString();
}

/** Host header the panel (or a reverse proxy in front of it) expects. */
export function originalHostHeader(fullUrl: string): string {
  return new URL(fullUrl).host;
}

export function isIpAddress(host: string): boolean {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(':');
}
