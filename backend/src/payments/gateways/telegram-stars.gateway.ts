import { Injectable } from '@nestjs/common';
import type {
  CreatePaymentInput,
  PaymentGateway,
  PaymentResult,
} from '../payment-gateway.types';

/**
 * Telegram Stars plugin — create/verify go through PaymentLedger (idempotent).
 * Invoice send / pre-checkout live on PaymentManagementService so the bot token
 * and Telegram HTTP proxy stay in one place.
 */
@Injectable()
export class TelegramStarsGateway implements PaymentGateway {
  readonly id = 'telegram_stars' as const;

  async createPayment(input: CreatePaymentInput): Promise<PaymentResult> {
    return {
      gateway: this.id,
      ok: true,
      status: 'pending',
      reference: `stars_${input.orderId}`,
      message: 'Awaiting Telegram Stars payment',
    };
  }

  async verifyPayment(reference: string): Promise<PaymentResult> {
    return {
      gateway: this.id,
      ok: false,
      status: 'pending',
      reference,
      message: 'Verify via backend successful_payment / PaymentLedger',
    };
  }

  async refund(reference: string): Promise<PaymentResult> {
    return {
      gateway: this.id,
      ok: false,
      status: 'failed',
      reference,
      message: 'Stars refund must be processed in Telegram / Bot API',
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
