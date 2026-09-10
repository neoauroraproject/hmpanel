import { createHmac, timingSafeEqual } from 'crypto';
import { ledgerIdempotencyKey } from './telegram-stars.util';

export const WALLET_PAY_API_BASE = 'https://pay.wallet.tg';
export const WALLET_PAY_GATEWAY = 'telegram_wallet';
/** Wallet Pay requires the purse emoji plus the words “Wallet Pay”. */
export const WALLET_PAY_BUTTON_TEXT = '👛 Wallet Pay';

export const WALLET_PAY_PRICING_CURRENCIES = ['USD', 'EUR'] as const;
export type WalletPayPricingCurrency = (typeof WALLET_PAY_PRICING_CURRENCIES)[number];

export const WALLET_PAY_SETTLEMENT_CURRENCIES = ['USDT', 'TON', 'BTC', 'NOT'] as const;
export type WalletPaySettlementCurrency = (typeof WALLET_PAY_SETTLEMENT_CURRENCIES)[number];

const CUSTOM_PREFIX = 'hmpw1';

export type WalletPayCustomData = {
  surface: string;
  orderId: string;
};

export function isWalletPayPricingCurrency(value: unknown): value is WalletPayPricingCurrency {
  return WALLET_PAY_PRICING_CURRENCIES.includes(String(value || '').toUpperCase() as WalletPayPricingCurrency);
}

export function isWalletPaySettlementCurrency(value: unknown): value is WalletPaySettlementCurrency {
  return WALLET_PAY_SETTLEMENT_CURRENCIES.includes(String(value || '').toUpperCase() as WalletPaySettlementCurrency);
}

export function parseTelegramUserId(raw: unknown): number | null {
  const digits = String(raw ?? '').replace(/\D/g, '');
  if (!digits) return null;
  const n = Number(digits);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return n;
}

export function clampWalletPayDescription(raw: unknown, fallback = 'HMPanel payment'): string {
  const text = String(raw || fallback).replace(/\s+/g, ' ').trim() || fallback;
  if (text.length < 5) return `${text} pay`.slice(0, 100).padEnd(5, '.');
  return text.slice(0, 100);
}

export function encodeWalletPayCustomData(surface: string, orderId: string): string {
  return `${CUSTOM_PREFIX}:${surface}:${orderId}`.slice(0, 255);
}

export function decodeWalletPayCustomData(raw: unknown): WalletPayCustomData | null {
  const value = String(raw || '');
  const parts = value.split(':');
  if (parts.length < 3 || parts[0] !== CUSTOM_PREFIX) return null;
  const surface = parts[1];
  const orderId = parts.slice(2).join(':');
  if (!surface || !orderId) return null;
  return { surface, orderId };
}

export function walletPayExternalId(surface: string, orderId: string): string {
  return ledgerIdempotencyKey(WALLET_PAY_GATEWAY, surface, orderId).slice(0, 255);
}

function isIrtCurrency(currency: string): boolean {
  const cur = String(currency || 'USD').toUpperCase();
  return cur === 'IRT' || cur === 'IRR' || cur === 'TOMAN' || cur === 'TMN';
}

/**
 * Wallet Pay invoices are USD or EUR. Toman/IRT is converted with tomanPerUsd
 * (how many toman equal 1 unit of the pricing currency).
 */
export function amountToWalletPay(
  amount: number,
  currency: string,
  rates: { tomanPerUsd: number; pricingCurrency: WalletPayPricingCurrency },
): { currencyCode: WalletPayPricingCurrency; amount: string; amountNumber: number } {
  const n = Number(amount);
  const pricing = isWalletPayPricingCurrency(rates.pricingCurrency) ? rates.pricingCurrency : 'USD';
  const tomanPerUsd = Number(rates.tomanPerUsd);
  const rate = Number.isFinite(tomanPerUsd) && tomanPerUsd > 0 ? tomanPerUsd : 100_000;
  let converted = Number.isFinite(n) && n > 0 ? n : 0.01;
  const cur = String(currency || 'USD').toUpperCase();
  if (isIrtCurrency(cur)) {
    converted = converted / rate;
  } else if (cur !== pricing && cur !== 'USD' && cur !== 'EUR') {
    converted = converted;
  }
  const rounded = Math.max(0.01, Math.round(converted * 100) / 100);
  return {
    currencyCode: pricing,
    amount: rounded.toFixed(2),
    amountNumber: rounded,
  };
}

export function walletPayWebhookPathCandidates(rawPath: string): string[] {
  const pathOnly = String(rawPath || '').split('?')[0];
  if (!pathOnly) return [];
  const normalized = pathOnly.startsWith('/') ? pathOnly : `/${pathOnly}`;
  const out = new Set<string>();
  const add = (value: string) => {
    if (!value) return;
    const withSlash = value.startsWith('/') ? value : `/${value}`;
    out.add(withSlash);
    out.add(withSlash.endsWith('/') ? withSlash.replace(/\/+$/, '') || '/' : `${withSlash}/`);
    if (withSlash.startsWith('/api/')) {
      add(withSlash.slice(4));
    } else if (!withSlash.startsWith('/api')) {
      out.add(`/api${withSlash}`);
      out.add(`/api${withSlash}`.endsWith('/') ? `/api${withSlash}` : `/api${withSlash}/`);
    }
  };
  add(normalized);
  return [...out];
}

export function signWalletPayWebhook(input: {
  apiKey: string;
  httpMethod: string;
  uriPath: string;
  timestamp: string;
  rawBody: Buffer | string;
}): string {
  const body = Buffer.isBuffer(input.rawBody) ? input.rawBody : Buffer.from(String(input.rawBody || ''), 'utf8');
  const payload = [
    String(input.httpMethod || 'POST').toUpperCase(),
    input.uriPath,
    String(input.timestamp || ''),
    body.toString('base64'),
  ].join('.');
  return createHmac('sha256', String(input.apiKey || ''))
    .update(payload)
    .digest('base64');
}

export function signaturesMatch(expected: string, received: string): boolean {
  const a = Buffer.from(String(expected || ''));
  const b = Buffer.from(String(received || ''));
  if (!a.length || a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function verifyWalletPayWebhook(input: {
  apiKey: string;
  httpMethod: string;
  timestamp: string;
  signature: string;
  rawBody: Buffer | string;
  uriPaths: string[];
}): boolean {
  const received = String(input.signature || '').trim();
  if (!received || !input.apiKey) return false;
  for (const uriPath of input.uriPaths) {
    const expected = signWalletPayWebhook({
      apiKey: input.apiKey,
      httpMethod: input.httpMethod,
      uriPath,
      timestamp: input.timestamp,
      rawBody: input.rawBody,
    });
    if (signaturesMatch(expected, received)) return true;
  }
  return false;
}

export type WalletPayWebhookEvent = {
  eventId?: string;
  type?: string;
  payload?: {
    id?: string;
    number?: number;
    externalId?: string;
    customData?: string;
    status?: string;
    orderAmount?: { amount?: string; currencyCode?: string };
    selectedPaymentOption?: {
      amount?: { amount?: string; currencyCode?: string };
      amountFee?: { amount?: string; currencyCode?: string };
      amountNet?: { amount?: string; currencyCode?: string };
      exchangeRate?: string;
    };
  };
};

export function parseWalletPayWebhookEvents(body: unknown): WalletPayWebhookEvent[] {
  if (Array.isArray(body)) return body as WalletPayWebhookEvent[];
  if (body && typeof body === 'object') {
    const rec = body as Record<string, unknown>;
    if (Array.isArray(rec.events)) return rec.events as WalletPayWebhookEvent[];
    if (rec.type || rec.payload || rec.eventId) return [rec as WalletPayWebhookEvent];
  }
  return [];
}

export function walletPayWebhookPathForAdmin(adminId: string): string {
  return `/api/premium-modules/payment-management/wallet-pay/webhook/${encodeURIComponent(adminId)}`;
}
