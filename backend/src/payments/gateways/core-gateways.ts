import { Injectable } from '@nestjs/common';
import type {
  CreatePaymentInput,
  PaymentGateway,
  PaymentResult,
} from '../payment-gateway.types';

function stub(
  gateway: string,
  status: PaymentResult['status'],
  extra: Partial<PaymentResult> = {},
): PaymentResult {
  return { gateway, ok: status === 'paid' || status === 'stub', status, ...extra };
}

@Injectable()
export class ManualBankGateway implements PaymentGateway {
  readonly id = 'manual_bank' as const;
  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    return stub(this.id, 'pending', {
      reference: `mb_${input.orderId}`,
      message: 'Awaiting bank receipt',
    });
  }
  async verifyPayment(reference: string): Promise<PaymentResult> {
    return stub(this.id, 'pending', { reference, message: 'Manual review required' });
  }
  async refund(reference: string): Promise<PaymentResult> {
    return stub(this.id, 'refunded', { reference });
  }
  async getStatus(reference: string): Promise<PaymentResult> {
    return stub(this.id, 'pending', { reference });
  }
}

@Injectable()
export class WalletGateway implements PaymentGateway {
  readonly id = 'wallet' as const;
  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    return stub(this.id, 'paid', { reference: `wal_${input.orderId}` });
  }
  async verifyPayment(reference: string): Promise<PaymentResult> {
    return stub(this.id, 'paid', { reference });
  }
  async refund(reference: string): Promise<PaymentResult> {
    return stub(this.id, 'refunded', { reference });
  }
  async getStatus(reference: string): Promise<PaymentResult> {
    return stub(this.id, 'paid', { reference });
  }
}

@Injectable()
export class ZarinpalStubGateway implements PaymentGateway {
  readonly id = 'zarinpal_stub' as const;
  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    return stub(this.id, 'stub', {
      reference: `zp_${input.orderId}`,
      redirectUrl: 'https://zarinpal.example/stub',
      message: 'Stub — not connected',
    });
  }
  async verifyPayment(reference: string): Promise<PaymentResult> {
    return stub(this.id, 'stub', { reference });
  }
  async refund(reference: string): Promise<PaymentResult> {
    return stub(this.id, 'stub', { reference });
  }
  async getStatus(reference: string): Promise<PaymentResult> {
    return stub(this.id, 'stub', { reference });
  }
}

@Injectable()
export class NowpaymentsStubGateway implements PaymentGateway {
  readonly id = 'nowpayments_stub' as const;
  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    return stub(this.id, 'stub', {
      reference: `np_${input.orderId}`,
      message: 'Stub — not connected',
    });
  }
  async verifyPayment(reference: string): Promise<PaymentResult> {
    return stub(this.id, 'stub', { reference });
  }
  async refund(reference: string): Promise<PaymentResult> {
    return stub(this.id, 'stub', { reference });
  }
  async getStatus(reference: string): Promise<PaymentResult> {
    return stub(this.id, 'stub', { reference });
  }
}
