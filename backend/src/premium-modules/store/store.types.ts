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

export function generateTrackingCode(): string {
  const chars = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  return Array.from(randomBytes(10), (byte) => chars[byte % chars.length]).join('').slice(0, 10);
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
