/**
 * Versioned envelope stored in Client.connectionExtras.
 * protocolVersion bumps when 3x-ui payload shape changes — no Prisma migration needed.
 */
export const CONNECTION_EXTRAS_PROTOCOL_VERSION = 1;

export type ConnectionExtrasEnvelope = {
  protocol: string;
  protocolVersion: number;
  generatedAt: string;
  payload: Record<string, unknown>;
};

export function emptyConnectionExtras(
  protocol = 'unknown',
): ConnectionExtrasEnvelope {
  return {
    protocol: String(protocol || 'unknown').toLowerCase(),
    protocolVersion: CONNECTION_EXTRAS_PROTOCOL_VERSION,
    generatedAt: new Date().toISOString(),
    payload: {},
  };
}

/**
 * Build envelope from raw 3x-ui client + primary inbound context.
 */
export function buildConnectionExtrasEnvelope(input: {
  protocol?: string | null;
  client: Record<string, any>;
  inbound?: Record<string, any> | null;
}): ConnectionExtrasEnvelope {
  const protocol = String(
    input.protocol || input.inbound?.protocol || 'unknown',
  ).toLowerCase();
  const c = input.client || {};
  const inbound = input.inbound || {};

  const allowedIPs = normalizeAllowedIPs(c.allowedIPs);
  const payload: Record<string, unknown> = {};

  if (c.privateKey) payload.privateKey = String(c.privateKey);
  if (c.publicKey) payload.publicKey = String(c.publicKey);
  if (c.preSharedKey) payload.preSharedKey = String(c.preSharedKey);
  if (c.keepAlive != null && c.keepAlive !== '')
    payload.keepAlive = Number(c.keepAlive) || 0;
  if (allowedIPs.length) payload.allowedIPs = allowedIPs;
  if (c.security) payload.security = String(c.security);
  if (c.password) payload.password = String(c.password);
  if (c.auth) payload.auth = String(c.auth);
  // Some panels store client address in settings / address fields
  if (c.address) payload.address = String(c.address);

  const inboundMeta: Record<string, unknown> = {};
  if (inbound.wgDns) inboundMeta.wgDns = String(inbound.wgDns);
  if (inbound.wgMtu != null) inboundMeta.wgMtu = Number(inbound.wgMtu) || 0;
  if (inbound.wgPublicKey) inboundMeta.wgPublicKey = String(inbound.wgPublicKey);
  if (inbound.nodeAddress)
    inboundMeta.nodeAddress = String(inbound.nodeAddress);
  if (inbound.shareAddr) inboundMeta.shareAddr = String(inbound.shareAddr);
  if (inbound.shareAddrStrategy)
    inboundMeta.shareAddrStrategy = String(inbound.shareAddrStrategy);
  if (inbound.listen) inboundMeta.listen = String(inbound.listen);
  if (inbound.port != null) inboundMeta.endpointPort = Number(inbound.port);

  // Resolve endpoint host: shareAddr → nodeAddress → listen (non-loopback)
  const endpointHost =
    pickHost(inbound.shareAddr) ||
    pickHost(inbound.nodeAddress) ||
    pickHost(inbound.listen);
  if (endpointHost) inboundMeta.endpointHost = endpointHost;

  if (Object.keys(inboundMeta).length) {
    payload.inbound = inboundMeta;
  }

  return {
    protocol,
    protocolVersion: CONNECTION_EXTRAS_PROTOCOL_VERSION,
    generatedAt: new Date().toISOString(),
    payload,
  };
}

function normalizeAllowedIPs(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((v) => String(v).trim()).filter(Boolean);
  }
  if (typeof value === 'string' && value.trim()) {
    return value
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function pickHost(value: unknown): string | null {
  const s = String(value || '').trim();
  if (!s) return null;
  if (
    s === '0.0.0.0' ||
    s === '::' ||
    s === '127.0.0.1' ||
    s === 'localhost' ||
    s.startsWith('127.')
  ) {
    return null;
  }
  return s.replace(/^\[|\]$/g, '');
}

export function parseConnectionExtras(
  raw: unknown,
): ConnectionExtrasEnvelope | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  if (!obj.protocol) return null;
  return {
    protocol: String(obj.protocol).toLowerCase(),
    protocolVersion: Number(obj.protocolVersion) || 1,
    generatedAt: String(obj.generatedAt || ''),
    payload:
      obj.payload && typeof obj.payload === 'object'
        ? (obj.payload as Record<string, unknown>)
        : {},
  };
}
