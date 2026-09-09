const PAYLOAD_PREFIX = 'hmp1';

export type StarsInvoicePayload = {
  surface: string;
  orderId: string;
};

/** Telegram invoice payload max is 128 bytes. Compact form: hmp1:<surface>:<orderId> */
export function encodeStarsPayload(surface: string, orderId: string): string {
  const payload = `${PAYLOAD_PREFIX}:${surface}:${orderId}`;
  if (payload.length > 128) {
    throw new Error('Stars invoice payload exceeds Telegram 128-byte limit');
  }
  return payload;
}

export function decodeStarsPayload(raw: unknown): StarsInvoicePayload | null {
  const value = String(raw || '');
  const parts = value.split(':');
  if (parts.length < 3 || parts[0] !== PAYLOAD_PREFIX) return null;
  const surface = parts[1];
  const orderId = parts.slice(2).join(':');
  if (!surface || !orderId) return null;
  return { surface, orderId };
}

export function amountToStars(
  amount: number,
  currency: string,
  rates: { starsPerUsd: number; starsPerIrt: number },
): number {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return 1;
  const cur = String(currency || 'USD').toUpperCase();
  const irt = cur === 'IRT' || cur === 'IRR' || cur === 'TOMAN' || cur === 'TMN';
  const rate = irt ? Number(rates.starsPerIrt) : Number(rates.starsPerUsd);
  const stars = Math.round(n * (Number.isFinite(rate) && rate > 0 ? rate : irt ? 0.002 : 50));
  return Math.max(1, stars);
}

export function ledgerIdempotencyKey(gateway: string, surface: string, orderId: string): string {
  return `${gateway}:${surface}:${orderId}`;
}
