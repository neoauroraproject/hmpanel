/**
 * Decide whether GET /s/:token should redirect to the HTML portal.
 * VPN clients must receive the raw subscription body — a false browser
 * match is why some apps fail to import the system sub link.
 */

const VPN_UA_HINTS = [
  'v2ray',
  'v2box',
  'v2rayng',
  'v2rayn',
  'v2raytun',
  'clash',
  'clashmeta',
  'clash-verge',
  'flclash',
  'sing-box',
  'singbox',
  'hiddify',
  'hiddifynext',
  'shadowrocket',
  'streisand',
  'quantumult',
  'surge',
  'loon',
  'stash',
  'nekoray',
  'nekobox',
  'sfa/',
  'sfm/',
  'surfboard',
  'okhttp',
  'go-http-client',
  'dart/',
  'cfnetwork',
  'cronet',
  'pharos',
  'napsternet',
  'foxray',
  'happ/',
  'happ ',
  'karing',
  'panelsub',
  'electron',
  'mahsa',
  'nikang',
  'nika ng',
  'sagernet',
  'matsuri',
  'husi',
  'oneclick',
  'potatso',
  'onexray',
  'v2rayxs',
  'wingsx',
  'ktor',
  'libprhttp',
  'alamofire',
  'dart:io',
];

export type BrowserNavInput = {
  headers?: Record<string, unknown>;
  query?: Record<string, unknown>;
};

function header(headers: Record<string, unknown> | undefined, name: string): string {
  if (!headers) return '';
  const direct = headers[name];
  if (direct != null) return String(Array.isArray(direct) ? direct[0] : direct);
  const lower = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lower) {
      return String(Array.isArray(value) ? value[0] : value ?? '');
    }
  }
  return '';
}

function looksLikeVpnClient(uaLower: string): boolean {
  return VPN_UA_HINTS.some((h) => uaLower.includes(h));
}

function acceptPrefersHtml(accept: string): boolean {
  if (!accept) return false;
  return (
    accept.startsWith('text/html') ||
    (accept.includes('text/html') &&
      (accept.indexOf('*/*') === -1 ||
        accept.indexOf('text/html') < accept.indexOf('*/*')))
  );
}

function looksLikeBrowserEngine(ua: string): boolean {
  return /chrome\/\d|crios\/\d|firefox\/\d|fxios\/\d|edg\/\d|edgios\/\d|safari\/\d|opr\/\d|samsungbrowser/i.test(
    ua,
  );
}

/**
 * `?raw=1` is a debug escape only — shareable QR/copy URLs must stay `/s/{token}`.
 */
export function isBrowserNavigation(input: BrowserNavInput): boolean {
  const raw = input.query?.raw;
  if (raw != null && String(raw) !== '0' && String(raw).toLowerCase() !== 'false') {
    return false;
  }

  const ua = header(input.headers, 'user-agent');
  const uaLower = ua.toLowerCase();
  if (!uaLower) return false;
  if (looksLikeVpnClient(uaLower)) return false;

  const mode = header(input.headers, 'sec-fetch-mode').toLowerCase();
  const dest = header(input.headers, 'sec-fetch-dest').toLowerCase();
  const user = header(input.headers, 'sec-fetch-user');

  // Apps that impersonate Chrome almost never send document-navigation Fetch Metadata.
  if (mode === 'cors' || mode === 'no-cors' || mode === 'same-origin' || dest === 'empty') {
    return false;
  }
  if (mode === 'navigate' || dest === 'document' || user === '?1') return true;

  // No Sec-Fetch-Mode: only old Safari/Firefox address-bar visits should hit the portal.
  // Default to raw so VPN clients that copy a Chrome UA still import.
  if (mode) return false;

  const accept = header(input.headers, 'accept').toLowerCase();
  const htmlPreferred = acceptPrefersHtml(accept);
  if (!htmlPreferred || !looksLikeBrowserEngine(ua)) return false;

  const legacyAddressBar =
    /iphone|ipad|ipod|macintosh/i.test(ua) &&
    /safari\//i.test(ua) &&
    /version\//i.test(ua) &&
    !/crios|fxios|edgios|chrome\//i.test(ua);
  const legacyFirefox = /firefox\/\d/i.test(ua) && !/chrome\//i.test(ua);
  return legacyAddressBar || legacyFirefox;
}
