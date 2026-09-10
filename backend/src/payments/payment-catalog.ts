/**
 * Payment method catalog — implemented plugins + future extension points.
 * Core business (store / wallet / recharge) must not hard-code new gateways;
 * they resolve methods through Payment Management + this catalog.
 */

export const PAYMENT_METHOD_IDS = [
  'manual_bank',
  'wallet',
  'telegram_stars',
  'telegram_wallet',
  'crypto_gateway',
  'rial_gateway',
] as const;

export type PaymentMethodId = (typeof PAYMENT_METHOD_IDS)[number];

export type PaymentMethodKind = 'implemented' | 'future';

export type PaymentMethodUiStatus =
  | 'active'
  | 'disabled'
  | 'configured'
  | 'not_configured';

export const PAYMENT_METHOD_CATALOG: Array<{
  id: PaymentMethodId;
  label: string;
  description: string;
  kind: PaymentMethodKind;
  /** Registry / PaymentGateway id when implemented. */
  gatewayId: string;
}> = [
  {
    id: 'manual_bank',
    label: 'Card to Card',
    description: 'Manual bank / card transfer with receipt review.',
    kind: 'implemented',
    gatewayId: 'manual_bank',
  },
  {
    id: 'wallet',
    label: 'Wallet',
    description: 'Deduct from the customer or reseller wallet.',
    kind: 'implemented',
    gatewayId: 'wallet',
  },
  {
    id: 'telegram_stars',
    label: 'Telegram Stars',
    description: 'Pay with Telegram Stars via the connected bot.',
    kind: 'implemented',
    gatewayId: 'telegram_stars',
  },
  {
    id: 'telegram_wallet',
    label: 'Telegram Wallet Pay',
    description: 'Pay with TON, USDT, BTC or NOT inside Telegram Wallet (Wallet Pay).',
    kind: 'implemented',
    gatewayId: 'telegram_wallet',
  },
  {
    id: 'crypto_gateway',
    label: 'Crypto Gateway',
    description: 'Crypto payment plugin — extension point (not implemented in this phase).',
    kind: 'future',
    gatewayId: 'nowpayments_stub',
  },
  {
    id: 'rial_gateway',
    label: 'Online Gateway (Rial)',
    description: 'Rial / online gateway plugin — extension point (not implemented in this phase).',
    kind: 'future',
    gatewayId: 'zarinpal_stub',
  },
];

export const IMPLEMENTED_PAYMENT_METHOD_IDS: PaymentMethodId[] =
  PAYMENT_METHOD_CATALOG.filter((m) => m.kind === 'implemented').map((m) => m.id);

export function isPaymentMethodId(value: unknown): value is PaymentMethodId {
  return (
    typeof value === 'string' &&
    (PAYMENT_METHOD_IDS as readonly string[]).includes(value)
  );
}

export function catalogEntry(id: string) {
  return PAYMENT_METHOD_CATALOG.find((m) => m.id === id || m.gatewayId === id);
}

/**
 * Single status for admin UI.
 * Active = enabled + configured; Disabled = configured but off;
 * Configured is not used as the primary chip (enabled+configured → Active).
 */
export function deriveMethodUiStatus(input: {
  kind: PaymentMethodKind;
  enabled: boolean;
  configured: boolean;
}): PaymentMethodUiStatus {
  if (input.kind === 'future') return 'not_configured';
  if (!input.configured) return 'not_configured';
  if (!input.enabled) return 'disabled';
  return 'active';
}

export function isImplementedGateway(id: string): boolean {
  const entry = catalogEntry(id);
  return !!entry && entry.kind === 'implemented';
}
