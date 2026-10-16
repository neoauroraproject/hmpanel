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
  return list.filter((s) => (BOT_API_SCOPES as readonly string[]).includes(s));
}

export function hasScope(granted: unknown, scope: string): boolean {
  const scopes = Array.isArray(granted) ? granted.map(String) : [];
  return scopes.includes(FULL_ACCESS_SCOPE) || scopes.includes(scope);
}
