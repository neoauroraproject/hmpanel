import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type PaymentLedgerStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'refunded';

export type PaymentLedgerRow = {
  id: string;
  adminId: string;
  gateway: string;
  surface: string;
  orderId: string | null;
  idempotencyKey: string;
  providerChargeId: string | null;
  amount: number;
  currency: string;
  status: PaymentLedgerStatus;
  metadata: Record<string, unknown> | null;
  createdAt: Date;
  updatedAt: Date;
};

function asRow(raw: any): PaymentLedgerRow {
  return {
    id: String(raw.id),
    adminId: String(raw.adminId),
    gateway: String(raw.gateway),
    surface: String(raw.surface),
    orderId: raw.orderId ? String(raw.orderId) : null,
    idempotencyKey: String(raw.idempotencyKey),
    providerChargeId: raw.providerChargeId ? String(raw.providerChargeId) : null,
    amount: Number(raw.amount),
    currency: String(raw.currency),
    status: raw.status as PaymentLedgerStatus,
    metadata:
      raw.metadata && typeof raw.metadata === 'object'
        ? (raw.metadata as Record<string, unknown>)
        : null,
    createdAt: raw.createdAt instanceof Date ? raw.createdAt : new Date(raw.createdAt),
    updatedAt: raw.updatedAt instanceof Date ? raw.updatedAt : new Date(raw.updatedAt),
  };
}

@Injectable()
export class PaymentLedgerService {
  private readonly logger = new Logger(PaymentLedgerService.name);

  constructor(private prisma: PrismaService) {}

  private client(): {
    create: (args: unknown) => Promise<any>;
    findUnique: (args: unknown) => Promise<any>;
    findMany: (args: unknown) => Promise<any[]>;
    update: (args: unknown) => Promise<any>;
  } {
    const ledger = (this.prisma as unknown as { paymentLedger?: any }).paymentLedger;
    if (!ledger) {
      throw new Error('PaymentLedger model is not available — run schema patch / prisma generate');
    }
    return ledger;
  }

  async createPending(input: {
    adminId: string;
    gateway: string;
    surface: string;
    orderId?: string | null;
    idempotencyKey: string;
    amount: number;
    currency: string;
    metadata?: Record<string, unknown> | null;
  }): Promise<{ row: PaymentLedgerRow; created: boolean }> {
    const existing = await this.findByIdempotency(input.idempotencyKey);
    if (existing) return { row: existing, created: false };
    try {
      const created = await this.client().create({
        data: {
          adminId: input.adminId,
          gateway: input.gateway,
          surface: input.surface,
          orderId: input.orderId || null,
          idempotencyKey: input.idempotencyKey,
          amount: input.amount,
          currency: input.currency,
          status: 'pending',
          metadata: (input.metadata || Prisma.JsonNull) as Prisma.InputJsonValue,
        },
      });
      return { row: asRow(created), created: true };
    } catch (err: any) {
      if (String(err?.code) === 'P2002') {
        const again = await this.findByIdempotency(input.idempotencyKey);
        if (again) return { row: again, created: false };
      }
      this.logger.warn(`PaymentLedger createPending failed: ${err?.message || err}`);
      throw err;
    }
  }

  async findByIdempotency(key: string): Promise<PaymentLedgerRow | null> {
    try {
      const row = await this.client().findUnique({ where: { idempotencyKey: key } });
      return row ? asRow(row) : null;
    } catch (err: any) {
      this.logger.warn(`PaymentLedger findByIdempotency failed: ${err?.message || err}`);
      return null;
    }
  }

  async findByProviderChargeId(chargeId: string): Promise<PaymentLedgerRow | null> {
    if (!chargeId) return null;
    try {
      const row = await this.client().findUnique({ where: { providerChargeId: chargeId } });
      return row ? asRow(row) : null;
    } catch {
      return null;
    }
  }

  /**
   * Mark paid exactly once. Duplicate charge ids or a second callback on the
   * same idempotency key return the existing paid row without mutating it.
   */
  async markPaid(input: {
    idempotencyKey: string;
    providerChargeId: string;
    metadata?: Record<string, unknown> | null;
  }): Promise<{ row: PaymentLedgerRow; duplicate: boolean }> {
    const byCharge = await this.findByProviderChargeId(input.providerChargeId);
    if (byCharge) {
      return { row: byCharge, duplicate: byCharge.status === 'paid' };
    }
    const existing = await this.findByIdempotency(input.idempotencyKey);
    if (!existing) {
      throw new Error('Payment ledger row not found');
    }
    if (existing.status === 'paid') {
      return { row: existing, duplicate: true };
    }
    const meta = {
      ...(existing.metadata || {}),
      ...(input.metadata || {}),
    };
    try {
      const updated = await this.client().update({
        where: { id: existing.id },
        data: {
          status: 'paid',
          providerChargeId: input.providerChargeId,
          metadata: meta as Prisma.InputJsonValue,
        },
      });
      return { row: asRow(updated), duplicate: false };
    } catch (err: any) {
      if (String(err?.code) === 'P2002') {
        const again = await this.findByProviderChargeId(input.providerChargeId);
        if (again) return { row: again, duplicate: true };
      }
      throw err;
    }
  }

  async markStatus(
    idempotencyKey: string,
    status: Exclude<PaymentLedgerStatus, 'paid'>,
    metadata?: Record<string, unknown> | null,
  ): Promise<PaymentLedgerRow | null> {
    const existing = await this.findByIdempotency(idempotencyKey);
    if (!existing) return null;
    if (existing.status === 'paid') return existing;
    const updated = await this.client().update({
      where: { id: existing.id },
      data: {
        status,
        metadata: {
          ...(existing.metadata || {}),
          ...(metadata || {}),
        } as Prisma.InputJsonValue,
      },
    });
    return asRow(updated);
  }

  async list(adminId: string, take = 50): Promise<PaymentLedgerRow[]> {
    try {
      const rows = await this.client().findMany({
        where: { adminId },
        orderBy: { createdAt: 'desc' },
        take: Math.min(200, Math.max(1, take)),
      });
      return rows.map(asRow);
    } catch (err: any) {
      this.logger.warn(`PaymentLedger list failed: ${err?.message || err}`);
      return [];
    }
  }
}
