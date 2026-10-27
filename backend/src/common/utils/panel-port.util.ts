import * as fs from 'fs';

const ENV_PATH = '/app/.env';
const CACHE_MS = 15_000;

type LiveEnv = { at: number; http: number; https: number; host: string };

let cache: LiveEnv | null = null;

function readValue(content: string, key: string): string | undefined {
  let value: string | undefined;
  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith(`${key}=`)) value = line.slice(key.length + 1).trim();
  }
  return value === undefined ? undefined : value.replace(/^["']|["']$/g, '');
}

function readPort(content: string, key: string, fallback: number): number {
  const n = Number(readValue(content, key) ?? '');
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : fallback;
}

function cleanHost(raw: unknown): string {
  return String(raw || '').trim().toLowerCase().split(':')[0];
}

/**
 * Ports and domain from the mounted .env (not process.env): `hm ports set`
 * and `hm ssl issue` change them without recreating the app container, so
 * process.env keeps the install-time values (e.g. the server IP).
 */
function liveEnv(): LiveEnv {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache;
  let content = '';
  try {
    content = fs.readFileSync(ENV_PATH, 'utf8');
  } catch {
    content = '';
  }
  cache = {
    at: now,
    http: readPort(content, 'HTTP_PORT', Number(process.env.HTTP_PORT) || 80),
    https: readPort(content, 'HTTPS_PORT', Number(process.env.HTTPS_PORT) || 443),
    host:
      cleanHost(readValue(content, 'PANEL_DOMAIN')) ||
      cleanHost(readValue(content, 'DOMAIN')) ||
      cleanHost(process.env.PANEL_DOMAIN) ||
      cleanHost(process.env.DOMAIN),
  };
  return cache;
}

/** Host ports nginx is published on. */
export function panelPorts(): { http: number; https: number } {
  const { http, https } = liveEnv();
  return { http, https };
}

/** ":8443" when the panel is off the scheme's default port, else "". */
export function panelPortSuffix(proto: string): string {
  const { http, https } = liveEnv();
  if (proto === 'http') return http === 80 ? '' : `:${http}`;
  return https === 443 ? '' : `:${https}`;
}

/** Main panel domain (no port), '' when unset. */
export function panelPublicHost(): string {
  return liveEnv().host;
}

export function panelPublicProto(): 'http' | 'https' {
  return process.env.FORCE_HTTP === 'true' ? 'http' : 'https';
}

/**
 * Public origin for links served by this panel's nginx — the main domain or
 * a custom domain on the same nginx — including a non-default port.
 */
export function panelPublicOrigin(host?: string | null): string | null {
  const h = cleanHost(host) || panelPublicHost();
  if (!h) return null;
  const proto = panelPublicProto();
  return `${proto}://${h}${panelPortSuffix(proto)}`;
}
