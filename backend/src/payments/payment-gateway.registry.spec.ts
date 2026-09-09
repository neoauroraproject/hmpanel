import { PaymentGatewayRegistry } from './payment-gateway.registry';
import {
  ManualBankGateway,
  NowpaymentsStubGateway,
  WalletGateway,
  ZarinpalStubGateway,
} from './gateways/core-gateways';
import { TelegramStarsGateway } from './gateways/telegram-stars.gateway';

describe('PaymentGatewayRegistry', () => {
  it('registers core, Stars, and stub gateways', async () => {
    const registry = new PaymentGatewayRegistry();
    registry.register(new ManualBankGateway());
    registry.register(new WalletGateway());
    registry.register(new TelegramStarsGateway());
    registry.register(new ZarinpalStubGateway());
    registry.register(new NowpaymentsStubGateway());
    expect(registry.list().sort()).toEqual(
      ['manual_bank', 'nowpayments_stub', 'telegram_stars', 'wallet', 'zarinpal_stub'].sort(),
    );
    const created = await registry.createPayment('zarinpal_stub', {
      amount: 1000,
      currency: 'IRT',
      orderId: 'o1',
    });
    expect(created.status).toBe('stub');
    const verified = await registry.verifyPayment('wallet', 'wal_o1');
    expect(verified.status).toBe('paid');
    const stars = await registry.createPayment('telegram_stars', {
      amount: 50,
      currency: 'XTR',
      orderId: 'o2',
    });
    expect(stars.status).toBe('pending');
    expect(stars.gateway).toBe('telegram_stars');
  });
});
