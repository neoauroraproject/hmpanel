import {
  amountToWalletPay,
  clampWalletPayDescription,
  decodeWalletPayCustomData,
  encodeWalletPayCustomData,
  parseTelegramUserId,
  parseWalletPayWebhookEvents,
  signWalletPayWebhook,
  verifyWalletPayWebhook,
  walletPayWebhookPathCandidates,
} from './telegram-wallet.util';

describe('telegram wallet pay helpers', () => {
  it('parses telegram user ids', () => {
    expect(parseTelegramUserId(123456789)).toBe(123456789);
    expect(parseTelegramUserId('u-987')).toBe(987);
    expect(parseTelegramUserId('abc')).toBeNull();
  });

  it('converts toman amounts to USD', () => {
    const usd = amountToWalletPay(150_000, 'TOMAN', { tomanPerUsd: 75_000, pricingCurrency: 'USD' });
    expect(usd.currencyCode).toBe('USD');
    expect(usd.amount).toBe('2.00');
    const alreadyUsd = amountToWalletPay(9.5, 'USD', { tomanPerUsd: 75_000, pricingCurrency: 'USD' });
    expect(alreadyUsd.amount).toBe('9.50');
  });

  it('clamps descriptions to Wallet Pay limits', () => {
    expect(clampWalletPayDescription('ab').length).toBeGreaterThanOrEqual(5);
    expect(clampWalletPayDescription('x'.repeat(200)).length).toBe(100);
  });

  it('encodes custom data', () => {
    const encoded = encodeWalletPayCustomData('store', 'ord-1');
    expect(decodeWalletPayCustomData(encoded)).toEqual({ surface: 'store', orderId: 'ord-1' });
  });

  it('verifies HMAC signatures across /api path variants', () => {
    const apiKey = 'test-store-api-key';
    const body = Buffer.from('[{"type":"ORDER_PAID"}]');
    const timestamp = '168824905680291';
    const path = '/api/premium-modules/payment-management/wallet-pay/webhook/adm1';
    const signature = signWalletPayWebhook({
      apiKey,
      httpMethod: 'POST',
      uriPath: path,
      timestamp,
      rawBody: body,
    });
    expect(
      verifyWalletPayWebhook({
        apiKey,
        httpMethod: 'POST',
        timestamp,
        signature,
        rawBody: body,
        uriPaths: walletPayWebhookPathCandidates(
          '/premium-modules/payment-management/wallet-pay/webhook/adm1',
        ),
      }),
    ).toBe(true);
    expect(
      verifyWalletPayWebhook({
        apiKey: 'wrong',
        httpMethod: 'POST',
        timestamp,
        signature,
        rawBody: body,
        uriPaths: [path],
      }),
    ).toBe(false);
  });

  it('parses webhook event arrays', () => {
    expect(parseWalletPayWebhookEvents([{ type: 'ORDER_PAID', payload: { id: 'w1' } }])).toHaveLength(1);
    expect(parseWalletPayWebhookEvents({ events: [{ type: 'ORDER_FAILED' }] })).toHaveLength(1);
  });
});
