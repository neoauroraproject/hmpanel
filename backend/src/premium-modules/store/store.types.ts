import { randomBytes } from 'crypto';
import { StoreOrderStatus } from '@prisma/client';

export const ORDER_STATUS_LABELS: Record<StoreOrderStatus, string> = {
  PENDING_PAYMENT: 'Pending Payment',
  PAYMENT_SUBMITTED: 'Payment Submitted',
  UNDER_REVIEW: 'Under Review',
  APPROVED: 'Approved',
  PROVISIONING: 'Provisioning',
  PROVISION_FAILED: 'Provision Failed',
  ACTIVE: 'Active',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
  RENEWED: 'Renewed',
};

export interface StorePaymentConfig {
  bankName?: string;
  bankCardNumber?: string;
  bankCardHolder?: string;
  bankIban?: string;
  paymentInstructions?: string;
  bankAccountInfo?: string;
}

export interface CheckoutPayload {
  productId: string;
  configName?: string;
  name?: string;
  telegram?: string;
  whatsapp?: string;
  email?: string;
  notes?: string;
  receiptText?: string;
  receiptImage?: string;
  customerToken?: string;
  haveToken?: boolean;
  isRenewal?: boolean;
  renewClientId?: string;
  currency?: string;
  paymentMethod?: 'MANUAL_BANK' | 'WALLET' | 'TELEGRAM_STARS' | 'TELEGRAM_WALLET' | string;
  couponCode?: string;
  selectedAddonIds?: string[];
  /** Selected concurrent IP limit from product.ipLimitOptions */
  limitIp?: number;
  /** Session token when checkout originates from customer portal (test-product gating). */
  customerSessionToken?: string;
  /** Telegram chat to send a Stars invoice into. */
  telegramChatId?: string | number;
  telegramUserId?: string | number;
}

export interface RenewCheckoutPayload {
  clientId?: string;
  /** Full /s/{token} URL or raw sub token — resolved server-side */
  subscriptionLink?: string;
  productId: string;
  receiptText?: string;
  receiptImage?: string;
  notes?: string;
  currency?: string;
  paymentMethod?: 'MANUAL_BANK' | 'WALLET' | 'TELEGRAM_STARS' | 'TELEGRAM_WALLET' | string;
  couponCode?: string;
  selectedAddonIds?: string[];
  limitIp?: number;
  telegramChatId?: string | number;
  telegramUserId?: string | number;
}

export interface ClaimServicePayload {
  subscriptionLink: string;
}

export function generateCustomerToken(): string {
  const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const segment = (len: number) => {
    const bytes = randomBytes(len);
    return Array.from(bytes, (byte) => chars[byte % chars.length]).join('').slice(0, len);
  };
  return `HM-${segment(4)}-${segment(4)}-${segment(4)}`;
}

export function generateReferralCode(): string {
  const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const bytes = randomBytes(8);
  return Array.from(bytes, (byte) => chars[byte % chars.length]).join('').slice(0, 8);
}

export function generateTrackingCode(): string {
  const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from(randomBytes(10), (byte) => chars[byte % chars.length]).join('').slice(0, 10);
}

/** Short random segment for opaque tracking URLs (e.g. X7K2-1020). */
export function generateTrackingPrefix(length = 4): string {
  const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  const len = Math.max(4, Math.min(8, length));
  return Array.from(randomBytes(len), (byte) => chars[byte % chars.length])
    .join('')
    .slice(0, len);
}

/** Build non-guessable tracking code: PREFIX-SEQUENCE (uppercase). */
export function buildPrefixedTrackingCode(sequence: number | string): string {
  const seq = String(sequence).replace(/\D/g, '') || '0';
  return `${generateTrackingPrefix(4)}-${seq}`.toUpperCase();
}

/** Extract trailing order sequence from "1020" or "X7K2-1020". */
export function parseTrackingSequence(code: string): number | null {
  const raw = String(code || '').trim().toUpperCase();
  const m = /^[0-9A-Z]+-(\d+)$/.exec(raw) || /^(\d+)$/.exec(raw);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isInteger(n) ? n : null;
}

export function generateSessionToken(): string {
  return randomBytes(32).toString('hex');
}

export function serializeBigInt<T extends Record<string, unknown>>(obj: T): T {
  const out = { ...obj } as Record<string, unknown>;
  for (const [k, v] of Object.entries(out)) {
    if (typeof v === 'bigint') out[k] = v.toString();
  }
  return out as T;
}
