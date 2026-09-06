import { Injectable } from '@nestjs/common';
import type {
  CreatePaymentInput,
  PaymentGateway,
} from './payment-gateway.types';

@Injectable()
export class PaymentGatewayRegistry {
  private readonly gateways = new Map<string, PaymentGateway>();

  register(gateway: PaymentGateway): void {
    this.gateways.set(gateway.id, gateway);
  }

  get(id: string): PaymentGateway | undefined {
    return this.gateways.get(id);
  }

  require(id: string): PaymentGateway {
    const g = this.get(id);
    if (!g) throw new Error(`Unknown payment gateway: ${id}`);
    return g;
  }

  createPayment(id: string, input: CreatePaymentInput) {
    return this.require(id).createPayment(input);
  }

  verifyPayment(id: string, reference: string) {
    return this.require(id).verifyPayment(reference);
  }

  list(): string[] {
    return [...this.gateways.keys()];
  }
}
