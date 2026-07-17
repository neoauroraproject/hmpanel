import type { ClientOutputModel } from '../client-output.types';
import { getCapabilitiesForOutputType } from '../output-type.resolver';
import { parseConnectionExtras } from '../connection-extras';

type BuildCtx = {
  clientId: string;
  protocol: string;
  client: {
    id: string;
    email: string;
    remark?: string | null;
    subId?: string | null;
    subToken?: string | null;
    uuid: string;
    connectionExtras?: unknown;
  };
  inbound?: {
    id: string;
    protocol: string;
    port: number;
    tag?: string | null;
    panel?: {
      url?: string | null;
      subUrl?: string | null;
    } | null;
  } | null;
  origin?: string;
};

export function buildWireGuardOutput(ctx: BuildCtx): ClientOutputModel {
  const { capabilities, methods } = getCapabilitiesForOutputType('wireguard');
  const warnings: string[] = [];
  const envelope = parseConnectionExtras(ctx.client.connectionExtras);
  const payload = (envelope?.payload || {}) as Record<string, any>;
  const inboundMeta = (payload.inbound || {}) as Record<string, any>;

  const privateKey = String(payload.privateKey || '').trim();
  const peerPublicKey = String(
    inboundMeta.wgPublicKey || payload.publicKey || '',
  ).trim();
  const allowedIPs = Array.isArray(payload.allowedIPs)
    ? payload.allowedIPs.map(String)
    : [];
  const address =
    String(payload.address || '').trim() ||
    (allowedIPs[0] ? String(allowedIPs[0]) : '');
  const dns = String(inboundMeta.wgDns || payload.dns || '1.1.1.1').trim();
  const mtu = Number(inboundMeta.wgMtu || payload.mtu || 0) || undefined;
  const keepAlive = Number(payload.keepAlive || 25) || 25;
  const preSharedKey = String(payload.preSharedKey || '').trim();
  const endpointHost = String(
    inboundMeta.endpointHost ||
      inboundMeta.shareAddr ||
      inboundMeta.nodeAddress ||
      '',
  ).trim();
  const endpointPort = Number(
    inboundMeta.endpointPort || ctx.inbound?.port || 0,
  );
  const endpoint =
    endpointHost && endpointPort ? `${endpointHost}:${endpointPort}` : '';

  if (!privateKey) warnings.push('Missing WireGuard private key');
  if (!peerPublicKey) warnings.push('Missing WireGuard peer public key');
  if (!endpoint) warnings.push('Missing WireGuard endpoint');
  if (!address && !allowedIPs.length) {
    warnings.push('Missing WireGuard address / AllowedIPs');
  }

  const interfaceAddress = address || allowedIPs[0] || '10.0.0.2/32';
  const peerAllowedIPs =
    allowedIPs.length > 0 ? allowedIPs.join(', ') : '0.0.0.0/0, ::/0';

  const lines = [
    '[Interface]',
    `PrivateKey = ${privateKey || 'MISSING'}`,
    `Address = ${interfaceAddress}`,
    `DNS = ${dns}`,
  ];
  if (mtu) lines.push(`MTU = ${mtu}`);
  lines.push('');
  lines.push('[Peer]');
  lines.push(`PublicKey = ${peerPublicKey || 'MISSING'}`);
  if (preSharedKey) lines.push(`PresharedKey = ${preSharedKey}`);
  lines.push(`AllowedIPs = ${peerAllowedIPs}`);
  if (endpoint) lines.push(`Endpoint = ${endpoint}`);
  lines.push(`PersistentKeepalive = ${keepAlive}`);

  const configText = lines.join('\n') + '\n';
  const safeName = (
    ctx.client.remark ||
    ctx.client.email ||
    'client'
  ).replace(/[^\w.\-]+/g, '_');
  const downloadFilename = `${safeName}.conf`;
  const complete = warnings.length === 0;

  return {
    clientId: ctx.clientId,
    protocol: 'wireguard',
    outputType: 'wireguard',
    capabilities,
    methods: complete ? methods : methods.filter((m) => m !== 'download' && m !== 'qr'),
    warnings,
    payload: {
      configText: complete ? configText : null,
      qrText: complete ? configText : null,
      downloadFilename,
      downloadPath: `/subscriptions/${encodeURIComponent(
        ctx.client.subToken || ctx.client.subId || ctx.client.id,
      )}/config`,
      adminDownloadPath: `/clients/${ctx.clientId}/config`,
      details: {
        endpoint: endpoint || null,
        address: interfaceAddress,
        dns,
        mtu: mtu || null,
        allowedIPs: peerAllowedIPs,
        persistentKeepalive: keepAlive,
        publicKey: peerPublicKey || null,
      },
    },
  };
}
