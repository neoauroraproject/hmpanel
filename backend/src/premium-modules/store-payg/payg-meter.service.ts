import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StoreWalletService } from '../store/store-wallet.service';
import { PaygLimitSyncService } from './payg-limit-sync.service';
import {
  computeTimeDelta,
  computeVolumeDelta,
  resolvePricePerByte,
  resolvePricePerHour,
  volumeMeterCursorKey,
} from './payg-math.util';

@Injectable()
export class PaygMeterService {
  private readonly logger = new Logger(PaygMeterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: StoreWalletService,
    private readonly limits: PaygLimitSyncService,
  ) {}

  /** Meter all ACTIVE (and optionally SUSPENDED for catch-up) subscriptions for an admin, or globally. */
  async runMeterTick(opts?: { adminId?: string; subscriptionId?: string }) {
    const where: Prisma.PaygSubscriptionWhereInput = {
      status: { in: ['ACTIVE', 'SUSPENDED'] },
      ...(opts?.adminId ? { adminId: opts.adminId } : {}),
      ...(opts?.subscriptionId ? { id: opts.subscriptionId } : {}),
    };

    const subs = await this.prisma.paygSubscription.findMany({
      where,
      include: { plan: true },
      take: 500,
      orderBy: { updatedAt: 'asc' },
    });

    const results: Array<{
      subscriptionId: string;
      charged: boolean;
      amount: number;
      skipped?: string;
      suspended?: boolean;
    }> = [];

    for (const sub of subs) {
      try {
        const r = await this.meterOne(sub.id);
        results.push(r);
      } catch (err: any) {
        this.logger.warn(`meter ${sub.id} failed: ${err?.message || err}`);
        results.push({
          subscriptionId: sub.id,
          charged: false,
          amount: 0,
          skipped: String(err?.message || err),
        });
      }
    }

    return {
      processed: results.length,
      charged: results.filter((r) => r.charged).length,
      results,
    };
  }

  async meterOne(subscriptionId: string) {
    const sub = await this.prisma.paygSubscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });
    if (!sub) {
      return { subscriptionId, charged: false, amount: 0, skipped: 'not_found' };
    }
    if (!['ACTIVE', 'SUSPENDED'].includes(sub.status)) {
      return { subscriptionId, charged: false, amount: 0, skipped: 'status' };
    }

    const mode = String(sub.plan.billingMode || '').toUpperCase();
    const now = new Date();

    if (mode === 'VOLUME') {
      return this.meterVolume(sub, now);
    }
    if (mode === 'TIME') {
      return this.meterTime(sub, now);
    }
    return { subscriptionId, charged: false, amount: 0, skipped: 'bad_mode' };
  }

  private async meterVolume(
    sub: {
      id: string;
      adminId: string;
      customerId: string;
      clientId: string | null;
      status: string;
      meterCursorBytes: bigint;
      plan: {
        billingMode: string;
        pricePerGb: number | null;
        minWalletBalance: number | null;
        limitIp: number;
      };
    },
    now: Date,
  ) {
    if (!sub.clientId) {
      return { subscriptionId: sub.id, charged: false, amount: 0, skipped: 'no_client' };
    }
    const pricePerByte = resolvePricePerByte(sub.plan);
    if (pricePerByte == null) {
      return { subscriptionId: sub.id, charged: false, amount: 0, skipped: 'no_price' };
    }

    const client = await this.prisma.client.findUnique({
      where: { id: sub.clientId },
      select: { up: true, down: true },
    });
    if (!client) {
      return { subscriptionId: sub.id, charged: false, amount: 0, skipped: 'client_missing' };
    }

    const used = (client.up || 0n) + (client.down || 0n);
    // Traffic reset: if used dropped below cursor, rebase cursor without charging.
    if (used < sub.meterCursorBytes) {
      await this.prisma.paygSubscription.update({
        where: { id: sub.id },
        data: {
          meterCursorBytes: used,
          meterCursorAt: now,
        },
      });
      const sync = await this.limits.syncSubscriptionLimits(sub.id);
      return {
        subscriptionId: sub.id,
        charged: false,
        amount: 0,
        skipped: 'cursor_rebase',
        suspended: sync.shouldSuspend,
      };
    }

    const delta = computeVolumeDelta({
      usedBytes: used,
      meterCursorBytes: sub.meterCursorBytes,
      pricePerByte,
    });
    if (!delta || delta.deltaBytes <= 0 || !(delta.amount > 0)) {
      const sync = await this.limits.syncSubscriptionLimits(sub.id);
      if (sync.shouldSuspend && sub.status === 'ACTIVE') {
        await this.suspend(sub.id, 'Insufficient wallet balance');
      }
      return {
        subscriptionId: sub.id,
        charged: false,
        amount: 0,
        skipped: 'no_delta',
        suspended: sync.shouldSuspend,
      };
    }

    const meterCursor = volumeMeterCursorKey(delta.nextCursor);
    const existing = await this.prisma.paygUsageLedger.findUnique({
      where: {
        subscriptionId_meterCursor: { subscriptionId: sub.id, meterCursor },
      },
    });
    if (existing) {
      await this.limits.syncSubscriptionLimits(sub.id);
      return {
        subscriptionId: sub.id,
        charged: false,
        amount: 0,
        skipped: 'idempotent',
      };
    }

    let chargedAmount = 0;
    let suspended = false;

    try {
      await this.prisma.$transaction(async (tx) => {
        const debit = await this.wallet.debit(
          tx,
          sub.customerId,
          delta.amount,
          'payg_usage',
          {
            note: `PAYG volume ${delta.quantityGb.toFixed(4)} GB`,
          },
        );

        await tx.paygUsageLedger.create({
          data: {
            subscriptionId: sub.id,
            kind: 'VOLUME',
            quantity: delta.quantityGb,
            amount: delta.amount,
            meterCursor,
            walletLedgerId: debit.ledgerId,
            note: `bytes=${delta.deltaBytes}`,
          },
        });

        await tx.paygSubscription.update({
          where: { id: sub.id },
          data: {
            meterCursorBytes: delta.nextCursor,
            meterCursorAt: now,
            lastBilledAt: now,
          },
        });

        chargedAmount = delta.amount;
      });
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (/Unique constraint|unique constraint|P2002/i.test(msg)) {
        return {
          subscriptionId: sub.id,
          charged: false,
          amount: 0,
          skipped: 'idempotent',
        };
      }
      if (/Insufficient wallet/i.test(msg)) {
        // Charge what we can? v1: suspend without partial charge of this tick.
        await this.suspend(sub.id, 'Insufficient wallet balance');
        return {
          subscriptionId: sub.id,
          charged: false,
          amount: 0,
          skipped: 'insufficient',
          suspended: true,
        };
      }
      throw err;
    }

    const sync = await this.limits.syncSubscriptionLimits(sub.id);
    if (sync.shouldSuspend) {
      await this.suspend(sub.id, 'Balance below minimum');
      suspended = true;
    }

    return {
      subscriptionId: sub.id,
      charged: chargedAmount > 0,
      amount: chargedAmount,
      suspended,
    };
  }

  private async meterTime(
    sub: {
      id: string;
      adminId: string;
      customerId: string;
      clientId: string | null;
      status: string;
      lastBilledAt: Date | null;
      activatedAt: Date | null;
      createdAt: Date;
      plan: {
        billingMode: string;
        pricePerDay: number | null;
        pricePerHour: number | null;
        minWalletBalance: number | null;
      };
    },
    now: Date,
  ) {
    const pricePerHour = resolvePricePerHour(sub.plan);
    if (pricePerHour == null) {
      return { subscriptionId: sub.id, charged: false, amount: 0, skipped: 'no_price' };
    }

    const from =
      sub.lastBilledAt?.getTime() ||
      sub.activatedAt?.getTime() ||
      sub.createdAt.getTime();
    const delta = computeTimeDelta({
      fromMs: from,
      toMs: now.getTime(),
      pricePerHour,
    });
    if (!delta || !(delta.amount > 0) || delta.quantityHours <= 0) {
      const sync = await this.limits.syncSubscriptionLimits(sub.id);
      if (sync.shouldSuspend && sub.status === 'ACTIVE') {
        await this.suspend(sub.id, 'Insufficient wallet balance');
      }
      return {
        subscriptionId: sub.id,
        charged: false,
        amount: 0,
        skipped: 'no_delta',
        suspended: sync.shouldSuspend,
      };
    }

    const meterCursor = delta.meterCursor;
    const existing = await this.prisma.paygUsageLedger.findUnique({
      where: {
        subscriptionId_meterCursor: { subscriptionId: sub.id, meterCursor },
      },
    });
    if (existing) {
      await this.limits.syncSubscriptionLimits(sub.id);
      return {
        subscriptionId: sub.id,
        charged: false,
        amount: 0,
        skipped: 'idempotent',
      };
    }

    let chargedAmount = 0;
    let suspended = false;

    try {
      await this.prisma.$transaction(async (tx) => {
        const debit = await this.wallet.debit(
          tx,
          sub.customerId,
          delta.amount,
          'payg_usage',
          {
            note: `PAYG time ${delta.quantityHours.toFixed(4)} h`,
          },
        );

        await tx.paygUsageLedger.create({
          data: {
            subscriptionId: sub.id,
            kind: 'TIME',
            quantity: delta.quantityHours,
            amount: delta.amount,
            meterCursor,
            walletLedgerId: debit.ledgerId,
          },
        });

        await tx.paygSubscription.update({
          where: { id: sub.id },
          data: {
            meterCursorAt: now,
            lastBilledAt: now,
          },
        });

        chargedAmount = delta.amount;
      });
    } catch (err: any) {
      const msg = String(err?.message || err);
      if (/Unique constraint|unique constraint|P2002/i.test(msg)) {
        return {
          subscriptionId: sub.id,
          charged: false,
          amount: 0,
          skipped: 'idempotent',
        };
      }
      if (/Insufficient wallet/i.test(msg)) {
        await this.suspend(sub.id, 'Insufficient wallet balance');
        return {
          subscriptionId: sub.id,
          charged: false,
          amount: 0,
          skipped: 'insufficient',
          suspended: true,
        };
      }
      throw err;
    }

    const sync = await this.limits.syncSubscriptionLimits(sub.id);
    if (sync.shouldSuspend) {
      await this.suspend(sub.id, 'Balance below minimum');
      suspended = true;
    }

    return {
      subscriptionId: sub.id,
      charged: chargedAmount > 0,
      amount: chargedAmount,
      suspended,
    };
  }

  private async suspend(subscriptionId: string, _reason: string) {
    const sub = await this.prisma.paygSubscription.findUnique({
      where: { id: subscriptionId },
    });
    if (!sub || sub.status === 'SUSPENDED' || sub.status === 'CLOSED') return;
    await this.prisma.paygSubscription.update({
      where: { id: subscriptionId },
      data: { status: 'SUSPENDED', suspendedAt: new Date() },
    });
    if (sub.clientId) {
      try {
        await this.limits.syncSubscriptionLimits(subscriptionId);
      } catch {
        /* best-effort */
      }
    }
  }
}
