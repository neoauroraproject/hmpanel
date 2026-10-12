import * as fs from 'fs';

const ENV_PATH = '/app/.env';
const CACHE_MS = 15_000;

let cache: { at: number; http: number; https: number } | null = null;

function readPort(content: string, key: string, fallback: number): number {
  let value: string | undefined;
  for (const line of content.split(/\r?\n/)) {
    if (line.startsWith(`${key}=`)) value = line.slice(key.length + 1).trim();
  }
  const n = Number(String(value ?? '').replace(/^["']|["']$/g, ''));
  return Number.isInteger(n) && n >= 1 && n <= 65535 ? n : fallback;
}

/**
 * Host ports nginx is published on. Read from the mounted .env (not
 * process.env) because `hm ports set` changes them without restarting the app.
 */
export function panelPorts(): { http: number; https: number } {
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
  };
  return cache;
}

/** ":8443" when the panel is off the scheme's default port, else "". */
export function panelPortSuffix(proto: string): string {
  const { http, https } = panelPorts();
  if (proto === 'http') return http === 80 ? '' : `:${http}`;
  return https === 443 ? '' : `:${https}`;
}
