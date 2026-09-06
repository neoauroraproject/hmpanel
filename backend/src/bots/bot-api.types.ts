import { createHash, randomBytes } from 'crypto';

export const BOT_API_SCOPES = [
  'clients.read',
  'clients.write',
  'traffic.read',
  'webhooks.manage',
] as const;

export type BotApiScope = (typeof BOT_API_SCOPES)[number];

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
  return raw.map((s) => String(s)).filter((s) => (BOT_API_SCOPES as readonly string[]).includes(s));
}
