import type { OutputType, ProtocolCapabilities, OutputMethod } from './client-output.types';

const PROFILES: Record<
  OutputType,
  { capabilities: ProtocolCapabilities; methods: OutputMethod[] }
> = {
  subscription: {
    capabilities: {
      supportsSubscription: true,
      supportsQRCode: true,
      supportsConfigFile: false,
      supportsPreview: false,
      supportsURI: true,
      supportsDownload: false,
    },
    methods: ['subscription', 'native', 'qr', 'copy', 'nodes'],
  },
  wireguard: {
    capabilities: {
      supportsSubscription: false,
      supportsQRCode: true,
      supportsConfigFile: true,
      supportsPreview: true,
      supportsURI: false,
      supportsDownload: true,
    },
    methods: ['preview', 'qr', 'copy', 'download'],
  },
  generic: {
    capabilities: {
      supportsSubscription: false,
      supportsQRCode: false,
      supportsConfigFile: false,
      supportsPreview: false,
      supportsURI: false,
      supportsDownload: false,
    },
    methods: [],
  },
};

export function getCapabilitiesForOutputType(outputType: OutputType) {
  return PROFILES[outputType] || PROFILES.generic;
}

/** Map inbound protocol string → outputType (backend decides; UI never branches on protocol). */
export function resolveOutputType(protocol: string | null | undefined): OutputType {
  const p = String(protocol || '').toLowerCase().trim();
  if (p === 'wireguard' || p === 'wg') return 'wireguard';
  if (
    p === 'vless' ||
    p === 'vmess' ||
    p === 'trojan' ||
    p === 'shadowsocks' ||
    p === 'shadowsocks2022' ||
    p === 'hysteria' ||
    p === 'hysteria2' ||
    p === 'tuic' ||
    p === 'mieru'
  ) {
    // Traditional URI/subscription protocols stay on subscription output
    // (tuic/mieru may get dedicated builders later — still subscription-like until then)
    if (p === 'tuic' || p === 'mieru') return 'subscription';
    return 'subscription';
  }
  if (!p || p === 'unknown') return 'generic';
  // Unknown future protocols: generic fallback
  return 'generic';
}
