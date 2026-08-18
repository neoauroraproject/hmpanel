/** Parse / rewrite the display name (`#fragment` or VMess `ps`) on a share URI. */

export type UriEndpoint = { address: string; port: number };

function normalizeAddr(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, '')
    .replace(/\.$/, '');
}

function isBlankOrEmail(value: string | null | undefined, email?: string | null): boolean {
  const raw = String(value || '').trim();
  if (!raw || raw.toLowerCase() === 'unknown') return true;
  const mail = String(email || '').trim().toLowerCase();
  if (mail && raw.toLowerCase() === mail) return true;
  return false;
}

export function getUriRemark(link: string): string {
  const trimmed = String(link || '').trim();
  if (!trimmed) return '';
  if (trimmed.toLowerCase().startsWith('vmess://')) {
    try {
      const b64 = trimmed.slice(8).split('#')[0];
      const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
      return String(json.ps || json.remark || '').trim();
    } catch {
      /* fall through */
    }
  }
  if (!trimmed.includes('#')) return '';
  const frag = trimmed.split('#').slice(1).join('#');
  try {
    return decodeURIComponent(frag);
  } catch {
    return frag;
  }
}

export function setUriRemark(link: string, remark: string): string {
  const name = String(remark || '').trim();
  if (!name) return link;
  const trimmed = String(link || '').trim();
  if (!trimmed) return trimmed;
  if (trimmed.toLowerCase().startsWith('vmess://')) {
    try {
      const b64 = trimmed.slice(8).split('#')[0];
      const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
      json.ps = name;
      const encoded = Buffer.from(JSON.stringify(json), 'utf8').toString('base64');
      return `vmess://${encoded}`;
    } catch {
      /* fall through to fragment */
    }
  }
  const base = trimmed.split('#')[0];
  return `${base}#${encodeURIComponent(name)}`;
}

export function parseUriEndpoint(link: string): UriEndpoint | null {
  const trimmed = String(link || '').trim();
  if (!trimmed) return null;
  if (trimmed.toLowerCase().startsWith('vmess://')) {
    try {
      const b64 = trimmed.slice(8).split('#')[0];
      const json = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
      const address = String(json.add || json.address || '').trim();
      const port = Number(json.port || 0);
      if (address) return { address, port };
    } catch {
      return null;
    }
    return null;
  }
  try {
    const noHash = trimmed.split('#')[0];
    const u = new URL(noHash.replace(/^[a-z0-9+.-]+:/i, 'https:'));
    const address = u.hostname;
    const port = Number(u.port || 0);
    if (address) return { address, port };
  } catch {
    return null;
  }
  return null;
}

/**
 * Prefer the Host remark (Hosts page), then inbound remark/tag.
 * Never keep a fragment that is only the client email when a host/inbound name exists.
 */
export function pickConfigDisplayName(input: {
  hostRemark?: string | null;
  inboundRemark?: string | null;
  inboundTag?: string | null;
  nodeName?: string | null;
  existingRemark?: string | null;
  email?: string | null;
}): string {
  const email = String(input.email || '').trim();
  const named = [
    input.hostRemark,
    input.inboundRemark,
    input.inboundTag,
    input.nodeName,
  ]
    .map((v) => String(v || '').trim())
    .filter((v) => v && !isBlankOrEmail(v, email));
  if (named[0]) return named[0];
  const existing = String(input.existingRemark || '').trim();
  if (existing && !isBlankOrEmail(existing, email)) return existing;
  return named[0] || existing || email || 'Config';
}

export function hostAddressList(host: {
  address?: string | null;
  hosts?: unknown;
}): string[] {
  const fromArray = Array.isArray(host.hosts)
    ? host.hosts.map((v) => String(v || '').trim()).filter(Boolean)
    : [];
  const fromAddress = String(host.address || '')
    .split(/[\s,]+/)
    .map((v) => v.trim())
    .filter(Boolean);
  return [...fromArray, ...fromAddress];
}

export function matchHostForEndpoint(
  hosts: Array<{
    address?: string | null;
    hosts?: unknown;
    port?: number | null;
    remark?: string | null;
    inboundId?: number | null;
    isDisabled?: boolean;
  }>,
  endpoint: UriEndpoint,
  inboundPanelId?: number | null,
): { remark: string } | null {
  const addr = normalizeAddr(endpoint.address);
  if (!addr) return null;
  const scored: Array<{ remark: string; score: number }> = [];
  for (const host of hosts) {
    if (host.isDisabled) continue;
    const remark = String(host.remark || '').trim();
    if (!remark) continue;
    const addresses = hostAddressList(host).map(normalizeAddr);
    if (!addresses.includes(addr)) continue;
    const hostPort = Number(host.port || 0);
    if (hostPort > 0 && endpoint.port > 0 && hostPort !== endpoint.port) continue;
    let score = 1;
    if (hostPort > 0 && hostPort === endpoint.port) score += 2;
    if (
      inboundPanelId != null &&
      host.inboundId != null &&
      Number(host.inboundId) === Number(inboundPanelId)
    ) {
      score += 3;
    }
    scored.push({ remark, score });
  }
  scored.sort((a, b) => b.score - a.score);
  return scored[0] ? { remark: scored[0].remark } : null;
}

export function normalizeHostRows(raw: unknown): Array<{
  address?: string | null;
  hosts?: unknown;
  port?: number | null;
  remark?: string | null;
  inboundId?: number | null;
  isDisabled?: boolean;
}> {
  if (Array.isArray(raw)) return raw as any[];
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    if (Array.isArray(obj.hosts) && obj.hosts.length && typeof obj.hosts[0] === 'object') {
      return obj.hosts as any[];
    }
    if (Array.isArray(obj.list)) return obj.list as any[];
  }
  return [];
}
