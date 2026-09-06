export type PaymentGatewayId =
  | 'manual_bank'
  | 'wallet'
  | 'zarinpal_stub'
  | 'nowpayments_stub';

export interface CreatePaymentInput {
  amount: number;
  currency: string;
  orderId: string;
  returnUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface PaymentResult {
  gateway: PaymentGatewayId | string;
  ok: boolean;
  status: 'pending' | 'paid' | 'failed' | 'refunded' | 'stub';
  reference?: string;
  redirectUrl?: string;
  message?: string;
}

export interface PaymentGateway {
  readonly id: PaymentGatewayId | string;
  createPayment(input: CreatePaymentInput): Promise<PaymentResult>;
  verifyPayment(reference: string): Promise<PaymentResult>;
  refund(reference: string, amount?: number): Promise<PaymentResult>;
  getStatus(reference: string): Promise<PaymentResult>;
}
