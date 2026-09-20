import { Inject, Injectable, Logger, Optional, forwardRef } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StoreWalletService } from '../store/store-wallet.service';
import { StoreCustomerNotificationsService } from '../store/store-customer-notifications.service';
import { PaygLimitSyncService } from './payg-limit-sync.service';
import {
  computeTimeDelta,
  computeVolumeDelta,
  resolvePricePerByte,
  resolvePricePerHour,
  volumeMeterCursorKey,
} from './payg-math.util';

/** Re-warn at most once per hour while balance stays low. */
const WARN_THROTTLE_MS = 60 * 60 * 1000;

@Injectable()
export class PaygMeterService {
  private readonly logger = new Logger(PaygMeterService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly wallet: StoreWalletService,
    private readonly limits: PaygLimitSyncService,
    @Optional()
    @Inject(forwardRef(() => StoreCustomerNotificationsService))
    private readonly notifications?: StoreCustomerNotificationsService,
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

    let result: {
      subscriptionId: string;
      charged: boolean;
      amount: number;
      skipped?: string;
      suspended?: boolean;
    };

    if (mode === 'VOLUME') {
      result = await this.meterVolume(sub, now);
    } else if (mode === 'TIME') {
      result = await this.meterTime(sub, now);
    } else {
      result = { subscriptionId, charged: false, amount: 0, skipped: 'bad_mode' };
    }

    if (!result.skipped || result.skipped === 'no_delta') {
      await this.maybeWarnOrNotify(sub.customerId, sub.adminId, !!result.suspended);
    } else if (result.suspended) {
      await this.maybeWarnOrNotify(sub.customerId, sub.adminId, true);
    }

    return result;
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

  private async maybeWarnOrNotify(
    customerId: string,
    adminId: string,
    suspended: boolean,
  ) {
    if (suspended) {
      await this.notifySuspended(customerId);
      return;
    }
    if (!this.notifications) return;

    try {
      const balance = await this.limits.getWalletBalance(customerId);
      const settings = await this.prisma.paygSettings.findUnique({
        where: { adminId },
      });
      const minBalance = Number(settings?.minWalletBalance || 0);

      const activeTime = await this.prisma.paygSubscription.findMany({
        where: {
          customerId,
          status: 'ACTIVE',
        },
        include: { plan: true },
      });
      let hourlyBurn = 0;
      for (const s of activeTime) {
        if (String(s.plan.billingMode || '').toUpperCase() !== 'TIME') continue;
        const pph = resolvePricePerHour(s.plan);
        if (pph != null && pph > 0) hourlyBurn += pph;
      }

      // Warn before empty: within ~3h of burn or 2× min balance, whichever is higher.
      const warnThreshold = Math.max(minBalance * 2, hourlyBurn * 3);
      if (!(balance <= warnThreshold)) return;
      // Still warn at/below min so they know charge is urgent (before suspend path).
      const hoursLeft =
        hourlyBurn > 0 ? Math.max(0, Math.floor(balance / hourlyBurn)) : null;

      const customer = await this.prisma.storeCustomer.findUnique({
        where: { id: customerId },
        select: { metadata: true },
      });
      const meta =
        customer?.metadata && typeof customer.metadata === 'object'
          ? ({ ...(customer.metadata as Record<string, unknown>) } as Record<
              string,
              unknown
            >)
          : {};
      const lastWarnAt = Number(meta.paygLastWarnAt || 0);
      if (lastWarnAt && Date.now() - lastWarnAt < WARN_THROTTLE_MS) return;

      const hoursNote =
        hoursLeft == null
          ? ''
          : ` ≈${hoursLeft}h left at current burn / حدود ${hoursLeft} ساعت تا اتمام.`;
      await this.notifications.notifyCustomer(customerId, {
        type: 'payg_low_balance',
        title: '⚠️ موجودی کیف پول PAYG کم است / Low PAYG balance',
        message: `موجودی: ${balance} | حداقل: ${minBalance} | مصرف ساعتی: ${hourlyBurn}.${hoursNote} لطفاً شارژ کنید تا سرویس قطع نشود.`,
        payload: { balance, minBalance, warnThreshold, hourlyBurn, hoursLeft },
      });

      meta.paygLastWarnAt = Date.now();
      await this.prisma.storeCustomer.update({
        where: { id: customerId },
        data: { metadata: meta as Prisma.InputJsonValue },
      });
    } catch (err: any) {
      this.logger.warn(`PAYG low-balance warn failed: ${err?.message || err}`);
    }
  }

  private async notifySuspended(customerId: string) {
    if (!this.notifications) return;
    try {
      await this.notifications.notifyCustomer(customerId, {
        type: 'payg_suspended',
        title: '⛔ PAYG suspended / سرویس PAYG معلق شد',
        message:
          'Your PAYG service was suspended due to low wallet balance. Top up and resume. / به‌دلیل کمبود موجودی معلق شد؛ شارژ کنید.',
        payload: {},
      });
    } catch (err: any) {
      this.logger.warn(`PAYG suspended notify failed: ${err?.message || err}`);
    }
  }
}
