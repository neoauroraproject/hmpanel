import { PaymentGatewayRegistry } from './payment-gateway.registry';
import {
  ManualBankGateway,
  NowpaymentsStubGateway,
  WalletGateway,
  ZarinpalStubGateway,
} from './gateways/core-gateways';

describe('PaymentGatewayRegistry', () => {
  it('registers core and stub gateways', async () => {
    const registry = new PaymentGatewayRegistry();
    registry.register(new ManualBankGateway());
    registry.register(new WalletGateway());
    registry.register(new ZarinpalStubGateway());
    registry.register(new NowpaymentsStubGateway());
    expect(registry.list().sort()).toEqual(
      ['manual_bank', 'nowpayments_stub', 'wallet', 'zarinpal_stub'].sort(),
    );
    const created = await registry.createPayment('zarinpal_stub', {
      amount: 1000,
      currency: 'IRT',
      orderId: 'o1',
    });
    expect(created.status).toBe('stub');
    const verified = await registry.verifyPayment('wallet', 'wal_o1');
    expect(verified.status).toBe('paid');
  });
});
