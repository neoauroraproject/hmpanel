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
 * Prefer the name 3x-ui already put on the URI (Hosts / inbound remark).
 * Only rewrite when that name is blank or the client email.
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
  const existing = String(input.existingRemark || '').trim();
  if (existing && !isBlankOrEmail(existing, email)) return existing;
  const named = [
    input.hostRemark,
    input.inboundRemark,
    input.inboundTag,
    input.nodeName,
  ]
    .map((v) => String(v || '').trim())
    .filter((v) => v && !isBlankOrEmail(v, email));
  if (named[0]) return named[0];
  return existing || email || 'Config';
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
  const inboundId =
    inboundPanelId != null && Number.isFinite(Number(inboundPanelId))
      ? Number(inboundPanelId)
      : null;
  const byAddress = hosts.filter((host) => {
    if (host.isDisabled) return false;
    if (!String(host.remark || '').trim()) return false;
    return hostAddressList(host).map(normalizeAddr).includes(addr);
  });
  if (!byAddress.length) return null;

  const forInbound =
    inboundId != null
      ? byAddress.filter((h) => h.inboundId != null && Number(h.inboundId) === inboundId)
      : [];
  const pool = forInbound.length ? forInbound : byAddress;
  const epPort = Number(endpoint.port || 0);
  const exactPort =
    epPort > 0 ? pool.filter((h) => Number(h.port || 0) === epPort) : [];
  // Never reuse a host that has a different port (that caused duplicate names).
  const chosen = exactPort.length
    ? exactPort
    : pool.filter((h) => !Number(h.port || 0));
  if (!chosen.length) return null;
  chosen.sort((a, b) => {
    const ai = inboundId != null && Number(a.inboundId) === inboundId ? 1 : 0;
    const bi = inboundId != null && Number(b.inboundId) === inboundId ? 1 : 0;
    return bi - ai;
  });
  const remark = String(chosen[0].remark || '').trim();
  return remark ? { remark } : null;
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
