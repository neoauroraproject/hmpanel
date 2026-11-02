import { Logger } from '@nestjs/common';
import { LICENSE_PROTOCOL } from './license-lease.util';

const logger = new Logger('LicenseServerClient');

/**
 * Master license-server URLs, embedded XOR-obfuscated rather than as plain strings so the
 * endpoint is not a grep-able constant in the open-source build. This is only obfuscation,
 * not a secret — the real protection is the Ed25519 lease signature, which a patched panel
 * cannot forge whatever address it points at. Env vars still override for self-hosting.
 */
const OBFUSCATED_DEFAULT_URLS = [
  'AAY6TGHE+dv4FzZVdJOy0u5QNEFlxLTe6w==',
  'AAY6TGHE+dv4FzZVdJOy0u5QNEFlmaHe8k84AmSJoQ==',
];
const URL_OBFUSCATION_KEY = Buffer.from('hmpanel-license-v2');

function deobfuscate(encoded: string): string {
  const bytes = Buffer.from(encoded, 'base64');
  const out = Buffer.alloc(bytes.length);
  for (let i = 0; i < bytes.length; i++) {
    out[i] = bytes[i] ^ URL_OBFUSCATION_KEY[i % URL_OBFUSCATION_KEY.length] ^ ((i * 31) & 255);
  }
  return out.toString('utf8');
}

const DEFAULT_URLS = OBFUSCATED_DEFAULT_URLS.map(deobfuscate);

/** Primary + fallback license server URLs from env. */
export function getLicenseServerUrls(): string[] {
  const urls: string[] = [];

  const primary = process.env.LICENSE_SERVER_URL?.trim();
  const fallback = process.env.LICENSE_SERVER_URL_FALLBACK?.trim();
  const list = process.env.LICENSE_SERVER_URLS?.trim();

  if (list) {
    urls.push(
      ...list
        .split(',')
        .map((u) => u.trim().replace(/\/$/, ''))
        .filter(Boolean),
    );
  }

  if (primary) urls.push(primary.replace(/\/$/, ''));
  if (fallback) urls.push(fallback.replace(/\/$/, ''));

  const unique = [...new Set(urls)];
  return unique.length ? unique : DEFAULT_URLS;
}

export function getPrimaryLicenseServerUrl(): string {
  return getLicenseServerUrls()[0];
}

function isNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return true;
  const msg = err.message.toLowerCase();
  return (
    msg.includes('fetch failed') ||
    msg.includes('network') ||
    msg.includes('timeout') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound') ||
    msg.includes('abort')
  );
}

export interface LicenseServerResponse {
  res: Response;
  data: Record<string, unknown>;
  usedUrl: string;
}

/**
 * POST/GET to license API — tries primary URL, then fallback on network failure.
 * Business errors (4xx/5xx with body) from a reachable server are returned as-is.
 *
 * Every request carries `X-HM-License-Protocol`; the master server locks out panels below
 * its minimum (old builds that cannot verify the signed lease), forcing an update.
 */
export async function requestLicenseServer(
  path: string,
  init: RequestInit = {},
): Promise<LicenseServerResponse> {
  const urls = getLicenseServerUrls();
  let lastError: Error | null = null;

  for (let i = 0; i < urls.length; i++) {
    const base = urls[i];
    const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;

    try {
      const res = await fetch(url, {
        ...init,
        headers: {
          ...(init.headers as Record<string, string> | undefined),
          'X-HM-License-Protocol': String(LICENSE_PROTOCOL),
        },
        signal: init.signal ?? AbortSignal.timeout(30_000),
      });
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

      if (i > 0) {
        logger.warn(`License server fallback used: ${base}`);
      }

      return { res, data, usedUrl: base };
    } catch (err: any) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (i < urls.length - 1 && isNetworkError(err)) {
        logger.warn(`License server unreachable (${base}), trying fallback...`);
        continue;
      }
      throw lastError;
    }
  }

  throw new Error(
    `License server unreachable. Tried: ${urls.join(', ')}. ${lastError?.message || ''}`.trim(),
  );
}
