export type PaymentCryptoWallet = {
  id: string;
  /** Display title override, e.g. "Main USDT" */
  title?: string;
  asset: string;
  network: string;
  address: string;
  instructions?: string;
  enabled?: boolean;
};

export const CRYPTO_ASSETS = [
  'USDT',
  'USDC',
  'TRX',
  'BTC',
  'ETH',
  'TON',
  'BNB',
  'DAI',
] as const;

export const CRYPTO_NETWORKS = [
  'TRC20',
  'ERC20',
  'BEP20',
  'TON',
  'BTC',
  'Polygon',
  'Solana',
  'Arbitrum',
] as const;

export function newPaymentCryptoWallet(
  partial?: Partial<PaymentCryptoWallet>,
): PaymentCryptoWallet {
  return {
    id: `cwallet_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    title: '',
    asset: 'USDT',
    network: 'TRC20',
    address: '',
    instructions: '',
    enabled: true,
    ...partial,
  };
}

export function normalizePaymentCryptoWallet(raw: unknown): PaymentCryptoWallet | null {
  if (!raw || typeof raw !== 'object') return null;
  const rec = raw as Record<string, unknown>;
  const address = String(rec.address || '').trim();
  if (!address) return null;
  return {
    id: String(rec.id || newPaymentCryptoWallet().id),
    title: String(rec.title || '').trim(),
    asset: String(rec.asset || 'USDT').trim().toUpperCase() || 'USDT',
    network: String(rec.network || 'TRC20').trim() || 'TRC20',
    address,
    instructions: String(rec.instructions || '').trim(),
    enabled: rec.enabled !== false,
  };
}

export function normalizePaymentCryptoWallets(raw: unknown): PaymentCryptoWallet[] {
  if (!Array.isArray(raw)) return [];
  const out: PaymentCryptoWallet[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const wallet = normalizePaymentCryptoWallet(item);
    if (!wallet) continue;
    const key = `${wallet.asset}:${wallet.network}:${wallet.address.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(wallet);
  }
  return out;
}

export function walletIsUsable(wallet: PaymentCryptoWallet): boolean {
  return wallet.enabled !== false && !!String(wallet.address || '').trim();
}

/** User-facing line: "پرداخت با USDT (BEP20)" */
export function cryptoWalletHeadline(wallet: {
  asset?: string | null;
  network?: string | null;
  title?: string | null;
}): string {
  const title = String(wallet.title || '').trim();
  if (title) return title;
  const asset = String(wallet.asset || 'USDT').trim() || 'USDT';
  const network = String(wallet.network || '').trim();
  return network ? `پرداخت با ${asset} (${network})` : `پرداخت با ${asset}`;
}

export function formatCryptoWalletBlock(wallet: {
  asset?: string | null;
  network?: string | null;
  title?: string | null;
  address?: string | null;
  instructions?: string | null;
}): string {
  const lines = [
    cryptoWalletHeadline(wallet),
    wallet.address ? String(wallet.address).trim() : null,
    wallet.instructions ? String(wallet.instructions).trim() : null,
  ].filter(Boolean);
  return lines.join('\n');
}

export function mergePaymentCryptoWallets(
  ...batches: unknown[]
): PaymentCryptoWallet[] {
  return normalizePaymentCryptoWallets(
    batches.flatMap((b) => (Array.isArray(b) ? b : [])),
  );
}
