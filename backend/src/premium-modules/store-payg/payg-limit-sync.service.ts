import {
  Inject,
  Injectable,
  Logger,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientsService } from '../../clients/clients.service';
import {
  computeTimeExpiryMs,
  computeVolumeTotalBytes,
  effectiveMinWalletBalance,
  resolvePricePerByte,
  resolvePricePerMs,
} from './payg-math.util';

type PlanLike = {
  billingMode: string;
  pricePerDay?: number | null;
  pricePerHour?: number | null;
  pricePerGb?: number | null;
  limitIp?: number | null;
  minWalletBalance?: number | null;
};

@Injectable()
export class PaygLimitSyncService {
  private readonly logger = new Logger(PaygLimitSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clients: ClientsService,
  ) {}

  async getWalletBalance(customerId: string): Promise<number> {
    const account = await this.prisma.storeWalletAccount.findUnique({
      where: { customerId },
    });
    return Number(account?.balance || 0);
  }

  async resolveMinBalance(
    adminId: string,
    plan: { minWalletBalance?: number | null },
  ): Promise<number> {
    const settings = await this.prisma.paygSettings.findUnique({
      where: { adminId },
    });
    return effectiveMinWalletBalance(plan.minWalletBalance, settings?.minWalletBalance);
  }

  /**
   * Apply panel limits from wallet balance for one subscription.
   * VOLUME: total = used + floor(balance/pricePerByte)
   * TIME: expiry = now + floor(balance/pricePerMs); traffic unlimited (0)
   */
  async syncSubscriptionLimits(subscriptionId: string): Promise<{
    balance: number;
    minBalance: number;
    shouldSuspend: boolean;
    applied: { total?: number; expiryTime?: number; enable?: boolean } | null;
  }> {
    const sub = await this.prisma.paygSubscription.findUnique({
      where: { id: subscriptionId },
      include: { plan: true },
    });
    if (!sub || !sub.clientId) {
      return { balance: 0, minBalance: 0, shouldSuspend: false, applied: null };
    }
    if (!['ACTIVE', 'SUSPENDED'].includes(sub.status)) {
      return { balance: 0, minBalance: 0, shouldSuspend: false, applied: null };
    }

    const balance = await this.getWalletBalance(sub.customerId);
    const minBalance = await this.resolveMinBalance(sub.adminId, sub.plan);
    const shouldSuspend = balance + 1e-9 < minBalance;

    const client = await this.prisma.client.findUnique({
      where: { id: sub.clientId },
      select: { id: true, up: true, down: true, enable: true, adminId: true },
    });
    if (!client) {
      return { balance, minBalance, shouldSuspend, applied: null };
    }

    const used = Number(client.up || 0n) + Number(client.down || 0n);
    const patch = this.buildLimitPatch(sub.plan, balance, used, !shouldSuspend);

    try {
      await this.clients.update(client.id, sub.adminId, 'ADMIN', {
        ...patch,
        enable: !shouldSuspend,
        limitIp: Number(sub.plan.limitIp || 0) || 0,
      });
    } catch (err: any) {
      this.logger.warn(
        `limit sync failed for sub ${subscriptionId}: ${err?.message || err}`,
      );
      return { balance, minBalance, shouldSuspend, applied: null };
    }

    return {
      balance,
      minBalance,
      shouldSuspend,
      applied: { ...patch, enable: !shouldSuspend },
    };
  }

  buildLimitPatch(
    plan: PlanLike,
    balance: number,
    usedBytes: number,
    online: boolean,
  ): { total?: number; expiryTime?: number } {
    const mode = String(plan.billingMode || '').toUpperCase();
    if (mode === 'VOLUME') {
      const pricePerByte = resolvePricePerByte(plan);
      if (pricePerByte == null) return { total: usedBytes };
      const total = computeVolumeTotalBytes(usedBytes, online ? balance : 0, pricePerByte);
      return { total: total ?? usedBytes };
    }
    // TIME — huge/unlimited traffic; expiry from balance
    const pricePerMs = resolvePricePerMs(plan);
    const now = Date.now();
    if (pricePerMs == null) {
      return { total: 0, expiryTime: online ? now + PAYG_MS_FALLBACK : now };
    }
    const expiry = computeTimeExpiryMs(now, online ? balance : 0, pricePerMs);
    return { total: 0, expiryTime: expiry ?? now };
  }

  /** After wallet credit: sync limits and auto-resume suspended PAYG subs. */
  async onWalletCredited(customerId: string): Promise<void> {
    const subs = await this.prisma.paygSubscription.findMany({
      where: {
        customerId,
        status: { in: ['ACTIVE', 'SUSPENDED'] },
      },
      include: { plan: true },
    });
    if (!subs.length) return;

    const settingsByAdmin = new Map<string, { autoResume: boolean; minWalletBalance: number }>();

    for (const sub of subs) {
      let settings = settingsByAdmin.get(sub.adminId);
      if (!settings) {
        const row = await this.prisma.paygSettings.findUnique({
          where: { adminId: sub.adminId },
        });
        settings = {
          autoResume: row?.autoResume !== false,
          minWalletBalance: Number(row?.minWalletBalance || 0),
        };
        settingsByAdmin.set(sub.adminId, settings);
      }

      const sync = await this.syncSubscriptionLimits(sub.id);
      if (
        sub.status === 'SUSPENDED' &&
        settings.autoResume &&
        !sync.shouldSuspend &&
        sync.balance + 1e-9 >= sync.minBalance
      ) {
        await this.prisma.paygSubscription.update({
          where: { id: sub.id },
          data: { status: 'ACTIVE', suspendedAt: null },
        });
        if (sub.clientId) {
          try {
            await this.clients.update(sub.clientId, sub.adminId, 'ADMIN', {
              enable: true,
            });
          } catch (err: any) {
            this.logger.warn(
              `auto-resume enable failed ${sub.id}: ${err?.message || err}`,
            );
          }
        }
      }
    }
  }
}

const PAYG_MS_FALLBACK = 60_000;

export interface PaygWalletHook {
  onWalletCredited(customerId: string): Promise<void>;
}

@Injectable()
export class PaygWalletHookAdapter implements PaygWalletHook {
  constructor(
    @Inject(forwardRef(() => PaygLimitSyncService))
    private readonly limits: PaygLimitSyncService,
  ) {}

  onWalletCredited(customerId: string) {
    return this.limits.onWalletCredited(customerId);
  }
}
