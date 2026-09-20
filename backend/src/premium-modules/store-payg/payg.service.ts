import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientsService } from '../../clients/clients.service';
import { PanelsService } from '../../panels/panels.service';
import {
  parsePanel3xuiSettings,
  profileLooksLikeEylan,
  profileLooksLikePasarguard,
} from '../store/providers/store-fulfillment.types';
import { PaygLimitSyncService } from './payg-limit-sync.service';
import { PaygMeterService } from './payg-meter.service';
import {
  aggregateDailyUsage,
  normalizeBillingMode,
  resolvePricePerHour,
  resolvePricePerByte,
} from './payg-math.util';

@Injectable()
export class PaygService {
  private readonly logger = new Logger(PaygService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly clients: ClientsService,
    private readonly panels: PanelsService,
    private readonly limits: PaygLimitSyncService,
    private readonly meter: PaygMeterService,
  ) {}

  // â”€â”€ Settings â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  async getOrCreateSettings(adminId: string) {
    const existing = await this.prisma.paygSettings.findUnique({ where: { adminId } });
    if (existing) return existing;
    return this.prisma.paygSettings.create({
      data: { id: randomUUID(), adminId },
    });
  }

  async updateSettings(adminId: string, body: Record<string, unknown>) {
    await this.getOrCreateSettings(adminId);
    const data: Prisma.PaygSettingsUpdateInput = {};
    if (body.minWalletBalance != null) data.minWalletBalance = Number(body.minWalletBalance);
    if (body.meterIntervalHours != null) {
      data.meterIntervalHours = Math.max(1, Math.floor(Number(body.meterIntervalHours) || 1));
    }
    if (body.botButtonLabel !== undefined) {
      data.botButtonLabel = body.botButtonLabel == null ? null : String(body.botButtonLabel);
    }
    if (body.botMenuEnabled != null) data.botMenuEnabled = !!body.botMenuEnabled;
    if (body.autoResume != null) data.autoResume = !!body.autoResume;
    if (body.currency !== undefined) {
      data.currency = body.currency == null ? null : String(body.currency);
    }
    return this.prisma.paygSettings.update({ where: { adminId }, data });
  }

  // â”€â”€ Categories â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  listCategories(adminId: string) {
    return this.prisma.paygCategory.findMany({
      where: { adminId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { plans: true } } },
    });
  }

  async createCategory(adminId: string, body: Record<string, unknown>) {
    const name = String(body.name || '').trim();
    if (!name) throw new BadRequestException('name is required');
    return this.prisma.paygCategory.create({
      data: {
        id: randomUUID(),
        adminId,
        name,
        description: body.description != null ? String(body.description) : null,
        sortOrder: Math.floor(Number(body.sortOrder) || 0),
        visible: body.visible != null ? !!body.visible : true,
        enabled: body.enabled != null ? !!body.enabled : true,
      },
    });
  }

  async updateCategory(adminId: string, id: string, body: Record<string, unknown>) {
    await this.requireCategory(adminId, id);
    const data: Prisma.PaygCategoryUpdateInput = {};
    if (body.name != null) data.name = String(body.name).trim();
    if (body.description !== undefined) {
      data.description = body.description == null ? null : String(body.description);
    }
    if (body.sortOrder != null) data.sortOrder = Math.floor(Number(body.sortOrder) || 0);
    if (body.visible != null) data.visible = !!body.visible;
    if (body.enabled != null) data.enabled = !!body.enabled;
    return this.prisma.paygCategory.update({ where: { id }, data });
  }

  async deleteCategory(adminId: string, id: string) {
    await this.requireCategory(adminId, id);
    const plans = await this.prisma.paygPlan.count({ where: { categoryId: id } });
    if (plans > 0) {
      throw new BadRequestException('Category has plans; move or delete them first');
    }
    await this.prisma.paygCategory.delete({ where: { id } });
    return { ok: true };
  }

  // â”€â”€ Plans â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  listPlans(adminId: string, categoryId?: string) {
    return this.prisma.paygPlan.findMany({
      where: {
        adminId,
        ...(categoryId ? { categoryId } : {}),
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { category: { select: { id: true, name: true } } },
    });
  }

  async createPlan(adminId: string, body: Record<string, unknown>) {
    const categoryId = String(body.categoryId || '');
    await this.requireCategory(adminId, categoryId);
    const name = String(body.name || '').trim();
    if (!name) throw new BadRequestException('name is required');

    let billingMode: string;
    try {
      billingMode = normalizeBillingMode(body.billingMode);
    } catch {
      throw new BadRequestException('billingMode must be TIME or VOLUME');
    }

    const provisioningProfileId = String(body.provisioningProfileId || '').trim();
    if (!provisioningProfileId) {
      throw new BadRequestException('provisioningProfileId is required');
    }
    await this.require3xUiProfile(adminId, provisioningProfileId);
    this.assertPlanPricing(billingMode, body);

    return this.prisma.paygPlan.create({
      data: {
        id: randomUUID(),
        adminId,
        categoryId,
        name,
        description: body.description != null ? String(body.description) : null,
        billingMode,
        pricePerDay: body.pricePerDay != null ? Number(body.pricePerDay) : null,
        pricePerHour: body.pricePerHour != null ? Number(body.pricePerHour) : null,
        pricePerGb: body.pricePerGb != null ? Number(body.pricePerGb) : null,
        limitIp: Math.max(0, Math.floor(Number(body.limitIp) || 0)),
        provisioningProfileId,
        minWalletBalance:
          body.minWalletBalance != null ? Number(body.minWalletBalance) : null,
        sortOrder: Math.floor(Number(body.sortOrder) || 0),
        active: body.active != null ? !!body.active : true,
      },
    });
  }

  async updatePlan(adminId: string, id: string, body: Record<string, unknown>) {
    const plan = await this.requirePlan(adminId, id);
    const data: Prisma.PaygPlanUpdateInput = {};

    if (body.categoryId != null) {
      await this.requireCategory(adminId, String(body.categoryId));
      data.category = { connect: { id: String(body.categoryId) } };
    }
    if (body.name != null) data.name = String(body.name).trim();
    if (body.description !== undefined) {
      data.description = body.description == null ? null : String(body.description);
    }
    let billingMode = plan.billingMode;
    if (body.billingMode != null) {
      try {
        billingMode = normalizeBillingMode(body.billingMode);
      } catch {
        throw new BadRequestException('billingMode must be TIME or VOLUME');
      }
      data.billingMode = billingMode;
    }
    if (body.pricePerDay !== undefined) {
      data.pricePerDay = body.pricePerDay == null ? null : Number(body.pricePerDay);
    }
    if (body.pricePerHour !== undefined) {
      data.pricePerHour = body.pricePerHour == null ? null : Number(body.pricePerHour);
    }
    if (body.pricePerGb !== undefined) {
      data.pricePerGb = body.pricePerGb == null ? null : Number(body.pricePerGb);
    }
    if (body.limitIp != null) data.limitIp = Math.max(0, Math.floor(Number(body.limitIp) || 0));
    if (body.provisioningProfileId != null) {
      const pid = String(body.provisioningProfileId).trim();
      await this.require3xUiProfile(adminId, pid);
      data.provisioningProfileId = pid;
    }
    if (body.minWalletBalance !== undefined) {
      data.minWalletBalance =
        body.minWalletBalance == null ? null : Number(body.minWalletBalance);
    }
    if (body.sortOrder != null) data.sortOrder = Math.floor(Number(body.sortOrder) || 0);
    if (body.active != null) data.active = !!body.active;

    const merged = {
      billingMode,
      pricePerDay: (data.pricePerDay as number | null) ?? plan.pricePerDay,
      pricePerHour: (data.pricePerHour as number | null) ?? plan.pricePerHour,
      pricePerGb: (data.pricePerGb as number | null) ?? plan.pricePerGb,
    };
    this.assertPlanPricing(billingMode, merged);

    return this.prisma.paygPlan.update({ where: { id }, data });
  }

  async deletePlan(adminId: string, id: string) {
    await this.requirePlan(adminId, id);
    const active = await this.prisma.paygSubscription.count({
      where: {
        planId: id,
        status: { in: ['PENDING', 'ACTIVE', 'SUSPENDED'] },
      },
    });
    if (active > 0) {
      throw new BadRequestException('Plan has open subscriptions');
    }
    await this.prisma.paygPlan.delete({ where: { id } });
    return { ok: true };
  }

  // â”€â”€ Subscriptions â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  listSubscriptions(
    adminId: string,
    filter?: { status?: string; customerId?: string; planId?: string },
  ) {
    return this.prisma.paygSubscription.findMany({
      where: {
        adminId,
        ...(filter?.status ? { status: filter.status } : {}),
        ...(filter?.customerId ? { customerId: filter.customerId } : {}),
        ...(filter?.planId ? { planId: filter.planId } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        plan: {
          select: {
            id: true,
            name: true,
            billingMode: true,
            pricePerGb: true,
            pricePerHour: true,
            pricePerDay: true,
            limitIp: true,
          },
        },
        customer: {
          select: { id: true, token: true, name: true, telegram: true, telegramUserId: true },
        },
        client: {
          select: {
            id: true,
            email: true,
            enable: true,
            up: true,
            down: true,
            total: true,
            expiryTime: true,
          },
        },
      },
    });
  }

  async activate(adminId: string, body: { customerId?: string; planId?: string }) {
    const customerId = String(body.customerId || '');
    const planId = String(body.planId || '');
    if (!customerId || !planId) {
      throw new BadRequestException('customerId and planId are required');
    }

    const customer = await this.prisma.storeCustomer.findFirst({
      where: { id: customerId, adminId },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const plan = await this.requirePlan(adminId, planId);
    if (!plan.active) throw new BadRequestException('Plan is not active');

    const profile = await this.require3xUiProfile(adminId, plan.provisioningProfileId);
    const inboundIds = Array.isArray(profile.inboundIds)
      ? (profile.inboundIds as string[])
      : [];
    if (!inboundIds.length) {
      throw new BadRequestException('Provisioning profile has no inbounds');
    }
    if (!profile.panelId) {
      throw new BadRequestException('Provisioning profile has no panel');
    }

    const balance = await this.limits.getWalletBalance(customerId);
    const minBalance = await this.limits.resolveMinBalance(adminId, plan);
    if (balance + 1e-9 < minBalance) {
      throw new BadRequestException(
        `Wallet balance ${balance} is below minimum ${minBalance}`,
      );
    }

    await this.ensurePanelSynced(profile.panelId, inboundIds);

    const email = await this.generateUniqueConfigName('payg', adminId);
    const panel3xSettings = parsePanel3xuiSettings(profile.settings);
    const mode = String(plan.billingMode).toUpperCase();

    // Initial panel limits: TIME unlimited traffic + short expiry; VOLUME used+affordance
    const initial =
      mode === 'TIME'
        ? { total: 0, expiryTime: Date.now() + 60_000 }
        : { total: 0, expiryTime: 0 };

    const client = await this.clients.create(adminId, {
      email,
      inboundIds,
      remark: `payg-${customer.token || customerId.slice(0, 8)}`,
      total: initial.total,
      expiryTime: initial.expiryTime,
      adminId,
      limitIp: Number(plan.limitIp || 0) || 0,
      trafficReset: panel3xSettings.trafficReset,
      trafficResetDay: panel3xSettings.trafficResetDay,
      reset: panel3xSettings.reset,
      resetMax: panel3xSettings.resetMax,
    });

    const now = new Date();
    const sub = await this.prisma.paygSubscription.create({
      data: {
        id: randomUUID(),
        adminId,
        customerId,
        planId,
        clientId: client.id,
        status: 'ACTIVE',
        activatedAt: now,
        lastBilledAt: now,
        meterCursorBytes: 0n,
        meterCursorAt: now,
      },
      include: {
        plan: true,
        customer: { select: { id: true, token: true, name: true } },
        client: {
          select: { id: true, email: true, enable: true, total: true, expiryTime: true },
        },
      },
    });

    await this.limits.syncSubscriptionLimits(sub.id);
    this.logger.log(`PAYG activated sub=${sub.id} client=${client.id} plan=${planId}`);
    return sub;
  }

  async suspend(adminId: string, id: string) {
    const sub = await this.requireSubscription(adminId, id);
    if (sub.status === 'CLOSED' || sub.status === 'CANCELLED') {
      throw new BadRequestException('Subscription is closed');
    }
    if (sub.status === 'SUSPENDED') return sub;
    const updated = await this.prisma.paygSubscription.update({
      where: { id },
      data: { status: 'SUSPENDED', suspendedAt: new Date() },
    });
    if (sub.clientId) {
      try {
        await this.clients.update(sub.clientId, adminId, 'ADMIN', { enable: false });
      } catch (err: any) {
        this.logger.warn(`suspend disable failed: ${err?.message || err}`);
      }
    }
    return updated;
  }

  async resume(adminId: string, id: string) {
    const sub = await this.requireSubscription(adminId, id);
    if (sub.status !== 'SUSPENDED') {
      throw new BadRequestException('Only SUSPENDED subscriptions can be resumed');
    }
    const plan = await this.requirePlan(adminId, sub.planId);
    const balance = await this.limits.getWalletBalance(sub.customerId);
    const minBalance = await this.limits.resolveMinBalance(adminId, plan);
    if (balance + 1e-9 < minBalance) {
      throw new BadRequestException(
        `Wallet balance ${balance} is below minimum ${minBalance}`,
      );
    }
    const updated = await this.prisma.paygSubscription.update({
      where: { id },
      data: { status: 'ACTIVE', suspendedAt: null },
    });
    await this.limits.syncSubscriptionLimits(id);
    return updated;
  }

  async close(adminId: string, id: string) {
    const sub = await this.requireSubscription(adminId, id);
    if (sub.status === 'CLOSED') return sub;
    const updated = await this.prisma.paygSubscription.update({
      where: { id },
      data: { status: 'CLOSED', closedAt: new Date() },
    });
    if (sub.clientId) {
      try {
        await this.clients.update(sub.clientId, adminId, 'ADMIN', { enable: false });
      } catch (err: any) {
        this.logger.warn(`close disable failed: ${err?.message || err}`);
      }
    }
    return updated;
  }

  async getUsage(adminId: string, id: string) {
    await this.requireSubscription(adminId, id);
    const entries = await this.prisma.paygUsageLedger.findMany({
      where: { subscriptionId: id },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    const daily = aggregateDailyUsage(entries);
    return { entries, daily };
  }

  async dashboard(adminId: string) {
    const [active, suspended, closed, plans, ledgerAgg, recent] = await Promise.all([
      this.prisma.paygSubscription.count({ where: { adminId, status: 'ACTIVE' } }),
      this.prisma.paygSubscription.count({ where: { adminId, status: 'SUSPENDED' } }),
      this.prisma.paygSubscription.count({
        where: { adminId, status: { in: ['CLOSED', 'CANCELLED'] } },
      }),
      this.prisma.paygPlan.count({ where: { adminId, active: true } }),
      this.prisma.paygUsageLedger.aggregate({
        where: { subscription: { adminId } },
        _sum: { amount: true, quantity: true },
        _count: true,
      }),
      this.prisma.paygUsageLedger.findMany({
        where: { subscription: { adminId } },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          kind: true,
          quantity: true,
          amount: true,
          createdAt: true,
          subscriptionId: true,
        },
      }),
    ]);

    return {
      subscriptions: { active, suspended, closed },
      active,
      suspended,
      closed,
      revenue: ledgerAgg._sum.amount || 0,
      usageRows: ledgerAgg._count || 0,
      activePlans: plans,
      usage: {
        entries: ledgerAgg._count,
        totalAmount: ledgerAgg._sum.amount || 0,
        totalQuantity: ledgerAgg._sum.quantity || 0,
      },
      daily: aggregateDailyUsage(recent),
      recent,
    };
  }

  runMeter(adminId: string, subscriptionId?: string) {
    return this.meter.runMeterTick({ adminId, subscriptionId });
  }

  /** Optional daily digest prep â€” returns per-admin usage summary for bots/logs. */
  async prepareDailyDigest(adminId: string) {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const entries = await this.prisma.paygUsageLedger.findMany({
      where: {
        createdAt: { gte: since },
        subscription: { adminId },
      },
      select: {
        kind: true,
        quantity: true,
        amount: true,
        createdAt: true,
        subscriptionId: true,
      },
    });
    return {
      adminId,
      since,
      daily: aggregateDailyUsage(entries),
      entryCount: entries.length,
      totalAmount: entries.reduce((s, e) => s + Number(e.amount || 0), 0),
    };
  }

  /** Bot catalog: visible+enabled categories with active plans. */
  async listBotCatalog(adminId: string) {
    return this.prisma.paygCategory.findMany({
      where: { adminId, visible: true, enabled: true },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: {
        plans: {
          where: { active: true },
          orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
        },
      },
    });
  }

  listCustomerSubscriptions(adminId: string, customerId: string) {
    return this.listSubscriptions(adminId, { customerId });
  }

  // â”€â”€ Internals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  private assertPlanPricing(billingMode: string, body: Record<string, unknown>) {
    if (billingMode === 'VOLUME') {
      if (resolvePricePerByte(body as any) == null) {
        throw new BadRequestException('VOLUME plans require pricePerGb > 0');
      }
    } else if (resolvePricePerHour(body as any) == null) {
      throw new BadRequestException(
        'TIME plans require pricePerHour and/or pricePerDay > 0',
      );
    }
  }

  private async requireCategory(adminId: string, id: string) {
    const row = await this.prisma.paygCategory.findFirst({ where: { id, adminId } });
    if (!row) throw new NotFoundException('Category not found');
    return row;
  }

  private async requirePlan(adminId: string, id: string) {
    const row = await this.prisma.paygPlan.findFirst({ where: { id, adminId } });
    if (!row) throw new NotFoundException('Plan not found');
    return row;
  }

  private async requireSubscription(adminId: string, id: string) {
    const row = await this.prisma.paygSubscription.findFirst({ where: { id, adminId } });
    if (!row) throw new NotFoundException('Subscription not found');
    return row;
  }

  private async require3xUiProfile(adminId: string, profileId: string) {
    const profile = await this.prisma.provisioningProfile.findFirst({
      where: { id: profileId, adminId },
    });
    if (!profile) throw new NotFoundException('Provisioning profile not found');
    if (profileLooksLikeEylan(profile) || profileLooksLikePasarguard(profile)) {
      throw new BadRequestException('PAYG v1 supports 3x-ui provisioning profiles only');
    }
    const providerId = String((profile as any).providerId || 'panel_3xui').toLowerCase();
    if (providerId !== 'panel_3xui' && providerId !== '3x-ui' && providerId !== '') {
      throw new BadRequestException('PAYG v1 supports 3x-ui provisioning profiles only');
    }
    return profile;
  }

  private async ensurePanelSynced(panelId: string, inboundIds: string[]) {
    const inbounds = await this.prisma.inbound.findMany({
      where: { id: { in: inboundIds } },
      select: { id: true, panelInboundId: true },
    });
    const needsSync = inbounds.some((item) => item.panelInboundId == null);
    if (!needsSync) return;
    this.logger.warn(`PAYG activate: syncing panel ${panelId} before client create`);
    await this.panels.sync(panelId);
  }

  private normalizeBaseName(baseName: string): string {
    const cleaned = String(baseName || 'payg')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24);
    return cleaned || 'payg';
  }

  private async generateUniqueConfigName(baseName: string, adminId: string): Promise<string> {
    const base = this.normalizeBaseName(baseName);
    for (let i = 0; i < 20; i++) {
      const suffix = String(Math.floor(1000 + Math.random() * 9000));
      const email = `${base}-${suffix}`;
      const clash = await this.prisma.client.findFirst({
        where: { adminId, email },
        select: { id: true },
      });
      if (!clash) return email;
    }
    return `${base}-${Date.now().toString(36).slice(-4)}`;
  }
}
