import * as crypto from 'crypto';

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Crockford ULID — 26 chars, time-sortable. */
export function ulid(now = Date.now()): string {
  let time = now;
  let timePart = '';
  for (let i = 0; i < 10; i++) {
    timePart = CROCKFORD[time % 32] + timePart;
    time = Math.floor(time / 32);
  }
  const bytes = crypto.randomBytes(10);
  let acc = 0;
  let bits = 0;
  let rand = '';
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 5 && rand.length < 16) {
      bits -= 5;
      rand += CROCKFORD[(acc >> bits) & 31];
    }
  }
  return (timePart + rand).slice(0, 26);
}

export function generatePanelKey(): string {
  return `pnl_${ulid()}`;
}

export function isPanelKey(value: string | null | undefined): boolean {
  return typeof value === 'string' && /^pnl_[0-9A-HJKMNP-TV-Z]{26}$/i.test(value);
}

export type ConnectionHealth =
  | 'CONNECTED'
  | 'DEGRADED'
  | 'DISCONNECTED'
  | 'DISABLED'
  | 'UNKNOWN';

export const CONNECTION_HEALTHS: ConnectionHealth[] = [
  'CONNECTED',
  'DEGRADED',
  'DISCONNECTED',
  'DISABLED',
  'UNKNOWN',
];

export function parseConnectionHealth(value: unknown): ConnectionHealth {
  const raw = String(value || '').toUpperCase();
  return CONNECTION_HEALTHS.includes(raw as ConnectionHealth)
    ? (raw as ConnectionHealth)
    : 'UNKNOWN';
}
