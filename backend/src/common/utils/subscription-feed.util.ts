/** Detect native subscription payload shapes so /s/ does not re-wrap them. */

export function looksLikeClashYaml(s: string): boolean {
  const text = String(s || '');
  return (
    /^\s*(proxies|proxy-groups|rules|mixed-port|port)\s*:/m.test(text) ||
    text.includes('proxy-groups:') ||
    text.includes('\nproxies:')
  );
}

export function looksLikeSingboxJson(s: string): boolean {
  const t = String(s || '').trim();
  if (!t.startsWith('{')) return false;
  return /"(outbounds|inbounds|route|dns)"\s*:/.test(t);
}

export function looksLikeStructuredSubFeed(s: string): boolean {
  return looksLikeClashYaml(s) || looksLikeSingboxJson(s);
}

export function tryDecodeSubBody(content: string): string {
  const trimmed = String(content || '').trim();
  if (!trimmed) return '';
  if (
    looksLikeStructuredSubFeed(trimmed) ||
    /:\/\//.test(trimmed) ||
    trimmed.startsWith('{') ||
    trimmed.startsWith('[')
  ) {
    return trimmed;
  }
  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf-8');
    if (looksLikeStructuredSubFeed(decoded) || /:\/\//.test(decoded)) {
      return decoded;
    }
  } catch {
    /* keep original */
  }
  return trimmed;
}

const FORWARD_UA =
  /v2ray|clash|hiddify|sing-box|singbox|shadowrocket|nekobox|nekoray|okhttp|dart\/|happ|v2box|streisand|karing|foxray|stash|surge|loon|quantumult|cfnetwork|cronet|matsuri|sagernet|mahsa|nika|surfboard|pharos|napsternet/i;

/** Forward the client UA to 3x-ui so Clash/sing-box get their native format. */
export function nativeFetchUserAgent(incomingUa: string, fallback: string): string {
  const ua = String(incomingUa || '').trim();
  if (ua && FORWARD_UA.test(ua)) return ua;
  return fallback;
}

export function structuredFeedContentType(decoded: string): string {
  if (looksLikeClashYaml(decoded)) return 'text/yaml; charset=utf-8';
  if (looksLikeSingboxJson(decoded)) return 'application/json; charset=utf-8';
  return 'text/plain';
}
