import { Logger } from '@nestjs/common';

const logger = new Logger('LicenseServerClient');

const DEFAULT_URLS = [
  'https://license.hmray.pro',
  'https://license.hmrayserver.com',
];

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
