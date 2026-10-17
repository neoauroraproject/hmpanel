import { createHash, randomBytes } from 'crypto';

export const BOT_API_SCOPES = [
  'account.read',
  'clients.read',
  'clients.write',
  'clients.renew',
  'traffic.read',
  'inbounds.read',
  'stats.read',
  'webhooks.manage',
] as const;

export type BotApiScope = (typeof BOT_API_SCOPES)[number];

/**
 * Scopes for the premium routes (/v1/premium/*). Those routes only exist while the
 * premium bundle is loaded, and each one also needs the admin's module assignment.
 */
export const PREMIUM_API_SCOPES = [
  'store.read',
  'store.write',
  'agency.read',
  'agency.write',
  'external.read',
  'external.write',
  'payg.read',
  'payg.write',
  'templates.read',
] as const;

const KNOWN_SCOPES: readonly string[] = [...BOT_API_SCOPES, ...PREMIUM_API_SCOPES];

/** Grants every scope. The key still only reaches what its admin can reach. */
export const FULL_ACCESS_SCOPE = '*';

export function hashApiKey(plain: string): string {
  return createHash('sha256').update(plain).digest('hex');
}

export function generateApiKey(): { plain: string; prefix: string; hash: string } {
  const raw = randomBytes(24).toString('base64url');
  const plain = `hmp_${raw}`;
  return { plain, prefix: plain.slice(0, 12), hash: hashApiKey(plain) };
}

export function parseScopes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const list = raw.map((s) => String(s));
  if (list.includes(FULL_ACCESS_SCOPE)) return [FULL_ACCESS_SCOPE];
  return list.filter((s) => KNOWN_SCOPES.includes(s));
}

export function hasScope(granted: unknown, scope: string): boolean {
  const scopes = Array.isArray(granted) ? granted.map(String) : [];
  return scopes.includes(FULL_ACCESS_SCOPE) || scopes.includes(scope);
}
