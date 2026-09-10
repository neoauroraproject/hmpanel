import { Injectable } from '@nestjs/common';
import type {
  CreatePaymentInput,
  PaymentGateway,
  PaymentResult,
} from '../payment-gateway.types';

/**
 * Telegram Wallet Pay plugin — create/verify go through PaymentLedger.
 * Order create + HMAC webhook live on PaymentManagementService.
 */
@Injectable()
export class TelegramWalletGateway implements PaymentGateway {
  readonly id = 'telegram_wallet' as const;

  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    return {
      gateway: this.id,
      ok: true,
      status: 'pending',
      reference: `wpay_${input.orderId}`,
      message: 'Awaiting Telegram Wallet Pay',
    };
  }

  async verifyPayment(reference: string): Promise<PaymentResult> {
    return {
      gateway: this.id,
      ok: false,
      status: 'pending',
      reference,
      message: 'Verify via Wallet Pay HMAC webhook / PaymentLedger',
    };
  }

  async refund(reference: string): Promise<PaymentResult> {
    return {
      gateway: this.id,
      ok: false,
      status: 'failed',
      reference,
      message: 'Wallet Pay refund must be processed in the Wallet Pay merchant dashboard',
    };
  }

  async getStatus(reference: string): Promise<PaymentResult> {
    return {
      gateway: this.id,
      ok: false,
      status: 'pending',
      reference,
    };
  }
}
