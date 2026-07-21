import {
  Inject,
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientsService } from '../../clients/clients.service';
import { BrandingService } from '../branding/branding.service';
import { StoreCustomerService } from './store-customer.service';
import { StoreCustomerAuthService } from './store-customer-auth.service';
import { StoreCustomerNotificationsService } from './store-customer-notifications.service';
import { StoreProvisioningService } from './store-provisioning.service';
import { StoreRateLimitService } from './store-rate-limit.service';
import { StoreTelegramService } from './store-telegram.service';
import {
  CheckoutPayload,
  RenewCheckoutPayload,
  generateTrackingCode,
} from './store.types';
import {
  normalizePaymentConfig,
  primaryCardFromConfig,
  STORE_PAYMENT_METHOD_META,
} from './payment-config';
import { StoreOrderStatus, Prisma } from '@prisma/client';

@Injectable()
export class StoreService {
  private readonly logger = new Logger(StoreService.name);

  constructor(
    private prisma: PrismaService,
    private branding: BrandingService,
    private customers: StoreCustomerService,
    private customerAuth: StoreCustomerAuthService,
    private customerNotifications: StoreCustomerNotificationsService,
    private provisioning: StoreProvisioningService,
    private rateLimit: StoreRateLimitService,
    private clientsService: ClientsService,
    @Inject(forwardRef(() => StoreTelegramService))
    private telegram: StoreTelegramService,
  ) {}

  private startOfDay(d = new Date()) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  private startOfMonth(d = new Date()) {
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }

  private serializeProduct(p: any) {
    return {
      ...p,
      traffic: p.traffic?.toString?.() ?? p.traffic,
    };
  }

  private normalizeStringArray(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  }

  private async getAllowedInboundScope(adminId: string, role: string) {
    const inbounds = await this.prisma.inbound.findMany({
      where: role === 'SUPER_ADMIN' ? {} : { adminAccess: { some: { adminId } } },
      select: {
        id: true,
        tag: true,
        remark: true,
        port: true,
        protocol: true,
        panelId: true,
        panel: { select: { id: true, name: true, url: true } },
      },
      orderBy: [{ panel: { name: 'asc' } }, { tag: 'asc' }],
    });

    const panelsMap = new Map<string, { id: string; name: string; url: string }>();
    for (const inbound of inbounds) {
      if (inbound.panel) {
        panelsMap.set(inbound.panel.id, inbound.panel);
      }
    }

    return {
      panels: [...panelsMap.values()],
      inbounds,
      inboundIds: new Set(inbounds.map((inbound) => inbound.id)),
      panelIds: new Set(inbounds.map((inbound) => inbound.panelId)),
    };
  }

  async getProvisioningOptions(adminId: string, role: string) {
    const scope = await this.getAllowedInboundScope(adminId, role);
    return {
      panels: scope.panels,
      inbounds: scope.inbounds,
    };
  }

  private async assertProfileScope(
    adminId: string,
    role: string,
    panelId: string,
    inboundIds: string[],
  ) {
    const scope = await this.getAllowedInboundScope(adminId, role);

    if (!scope.panelIds.has(panelId)) {
      throw new ForbiddenException('Selected panel is not available for this account');
    }
    if (inboundIds.length === 0) {
      throw new BadRequestException('At least one inbound is required');
    }
    for (const inboundId of inboundIds) {
      if (!scope.inboundIds.has(inboundId)) {
        throw new ForbiddenException('One or more selected inbounds are not available for this account');
      }
    }

    const crossPanel = scope.inbounds.filter(
      (inbound) => inboundIds.includes(inbound.id) && inbound.panelId !== panelId,
    );
    if (crossPanel.length > 0) {
      throw new BadRequestException('All selected inbounds must belong to the selected panel');
    }
  }

  private async ensureCategoryOwned(adminId: string, categoryId: string) {
    const category = await this.prisma.productCategory.findFirst({
      where: { id: categoryId, adminId },
      select: { id: true },
    });
    if (!category) throw new NotFoundException('Category not found');
  }

  private async ensureProfileOwned(adminId: string, profileId: string) {
    const profile = await this.prisma.provisioningProfile.findFirst({
      where: { id: profileId, adminId },
      select: { id: true },
    });
    if (!profile) throw new NotFoundException('Provisioning profile not found');
  }

  private async serializeProfile(profile: any) {
    const inboundIds = this.normalizeStringArray(profile.inboundIds);
    const inboundRecords = inboundIds.length
      ? await this.prisma.inbound.findMany({
          where: { id: { in: inboundIds } },
          select: {
            id: true,
            tag: true,
            remark: true,
            port: true,
            protocol: true,
            panelId: true,
            panel: { select: { id: true, name: true } },
          },
          orderBy: { tag: 'asc' },
        })
      : [];

    return {
      ...profile,
      inboundIds,
      inbounds: inboundRecords,
    };
  }

  private serializeStoreProfile(profile: any) {
    const paymentConfig = normalizePaymentConfig(profile.paymentConfig, profile);
    return {
      ...profile,
      paymentConfig,
    };
  }

  async getOrCreateProfile(adminId: string) {
    const existing = await this.prisma.storeProfile.findUnique({ where: { adminId } });
    if (existing) return this.serializeStoreProfile(existing);

    const admin = await this.prisma.admin.findUnique({ where: { id: adminId } });
    const slugBase = `${admin?.username || 'store'}-${Date.now().toString(36)}`;
    try {
      const created = await this.prisma.storeProfile.create({
        data: {
          adminId,
          slug: slugBase,
          title: `${admin?.username || 'My'} Store`,
        },
      });
      return this.serializeStoreProfile(created);
    } catch (err: any) {
      // Concurrent create — unique adminId already exists
      if (err?.code === 'P2002') {
        const again = await this.prisma.storeProfile.findUnique({ where: { adminId } });
        if (again) return this.serializeStoreProfile(again);
      }
      throw err;
    }
  }

  async updateStoreProfile(adminId: string, data: Record<string, unknown>) {
    await this.getOrCreateProfile(adminId);

    const paymentConfig =
      data.paymentConfig !== undefined
        ? normalizePaymentConfig(data.paymentConfig, {
            bankName: data.bankName as string | undefined,
            bankCardNumber: data.bankCardNumber as string | undefined,
            bankCardHolder: data.bankCardHolder as string | undefined,
            bankIban: data.bankIban as string | undefined,
            paymentInstructions: data.paymentInstructions as string | undefined,
          })
        : undefined;

    const primary = paymentConfig ? primaryCardFromConfig(paymentConfig) : null;

    const updated = await this.prisma.storeProfile.update({
      where: { adminId },
      data: {
        title: data.title as string | undefined,
        slug: data.slug as string | undefined,
        description: data.description as string | undefined,
        domainId: data.domainId as string | undefined,
        enabled: data.enabled as boolean | undefined,
        defaultCurrency: data.defaultCurrency as string | undefined,
        paymentConfig: paymentConfig as any,
        // Keep legacy flat fields synced with the first enabled card
        paymentInstructions:
          (primary?.instructions as string | undefined) ??
          (data.paymentInstructions as string | undefined),
        bankName:
          (primary?.bankName as string | undefined) ?? (data.bankName as string | undefined),
        bankCardNumber:
          (primary?.cardNumber as string | undefined) ??
          (data.bankCardNumber as string | undefined),
        bankCardHolder:
          (primary?.cardHolder as string | undefined) ??
          (data.bankCardHolder as string | undefined),
        bankIban:
          (primary?.iban as string | undefined) ?? (data.bankIban as string | undefined),
        bankAccountInfo: data.bankAccountInfo as string | undefined,
      },
    });
    return this.serializeStoreProfile(updated);
  }

  async getDashboard(adminId: string) {
    const today = this.startOfDay();
    const monthStart = this.startOfMonth();
    const store = await this.getOrCreateProfile(adminId);

    const pendingStatuses: StoreOrderStatus[] = [
      'PAYMENT_SUBMITTED',
      'UNDER_REVIEW',
      'APPROVED',
      'PROVISIONING',
      'PROVISION_FAILED',
    ];

    const reviewStatuses: StoreOrderStatus[] = [
      'PAYMENT_SUBMITTED',
      'UNDER_REVIEW',
      'PROVISION_FAILED',
    ];

    const [
      todayOrders,
      pendingOrders,
      newOrders,
      completedOrders,
      revenueOrdersToday,
      revenueOrdersMonth,
      activeProducts,
      customers,
      renewals,
    ] = await Promise.all([
      this.prisma.storeOrder.count({
        where: { storeId: store.id, createdAt: { gte: today } },
      }),
      this.prisma.storeOrder.count({
        where: {
          storeId: store.id,
          status: { in: pendingStatuses },
        },
      }),
      this.prisma.storeOrder.count({
        where: {
          storeId: store.id,
          status: { in: reviewStatuses },
        },
      }),
      this.prisma.storeOrder.count({
        where: { storeId: store.id, status: { in: ['ACTIVE', 'RENEWED'] } },
      }),
      this.prisma.storeOrder.findMany({
        where: {
          storeId: store.id,
          createdAt: { gte: today },
          status: { in: ['ACTIVE', 'RENEWED', 'APPROVED'] },
        },
        select: {
          amount: true,
          currency: true,
          product: { select: { priceToman: true, priceUsd: true } },
        },
      }),
      this.prisma.storeOrder.findMany({
        where: {
          storeId: store.id,
          createdAt: { gte: monthStart },
          status: { in: ['ACTIVE', 'RENEWED', 'APPROVED'] },
        },
        select: {
          amount: true,
          currency: true,
          product: { select: { priceToman: true, priceUsd: true } },
        },
      }),
      this.prisma.storeProduct.count({
        where: { adminId, status: 'active', visible: true },
      }),
      this.prisma.storeCustomer.count({ where: { adminId } }),
      this.prisma.storeOrder.count({
        where: { storeId: store.id, isRenewal: true, status: { in: ['ACTIVE', 'RENEWED'] } },
      }),
    ]);

    const sumByCurrency = (
      rows: {
        amount: number | null;
        currency: string | null;
        product?: { priceToman?: number | null; priceUsd?: number | null } | null;
      }[],
    ) => {
      let usd = 0;
      let toman = 0;
      for (const row of rows) {
        const cur = String(row.currency || '').toUpperCase();
        const isTomanCur = ['TOMAN', 'IRT', 'IRR', 'TMN'].includes(cur);
        const productToman = Number(row.product?.priceToman || 0);
        const productUsd = Number(row.product?.priceUsd || 0);
        let n = Number(row.amount || 0);
        // Match OrderAmountCell: when amount is 0, fall back to product prices
        if (n === 0) {
          if (isTomanCur || productToman > 0) n = productToman || productUsd;
          else n = productUsd || productToman;
        }
        if (isTomanCur || (Number(row.amount || 0) === 0 && productToman > 0)) {
          toman += n;
        } else {
          usd += n;
        }
      }
      return { usd, toman };
    };

    const todayRev = sumByCurrency(revenueOrdersToday);
    const monthRev = sumByCurrency(revenueOrdersMonth);

    return {
      todayOrders,
      pendingOrders,
      newOrders,
      completedOrders,
      revenueToday: todayRev.usd,
      revenueMonth: monthRev.usd,
      revenueTodayToman: todayRev.toman,
      revenueMonthToman: monthRev.toman,
      activeProducts,
      customers,
      renewals,
      storeSlug: store.slug,
    };
  }

  // ── Categories ─────────────────────────────────────────────────────────────

  listCategories(adminId: string) {
    return this.prisma.productCategory.findMany({
      where: { adminId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
      include: { _count: { select: { products: true } } },
    });
  }

  createCategory(adminId: string, data: Record<string, unknown>) {
    return this.prisma.productCategory.create({
      data: {
        adminId,
        name: data.name as string,
        description: (data.description as string) || null,
        icon: (data.icon as string) || null,
        sortOrder: Number(data.sortOrder ?? 0),
        visible: data.visible !== false,
        enabled: data.enabled !== false,
      },
    });
  }

  async updateCategory(adminId: string, id: string, data: Record<string, unknown>) {
    const existing = await this.prisma.productCategory.findFirst({ where: { id, adminId } });
    if (!existing) throw new NotFoundException('Category not found');
    return this.prisma.productCategory.update({
      where: { id },
      data: {
        name: data.name as string | undefined,
        description: data.description as string | undefined,
        icon: data.icon as string | undefined,
        sortOrder: data.sortOrder !== undefined ? Number(data.sortOrder) : undefined,
        visible: data.visible as boolean | undefined,
        enabled: data.enabled as boolean | undefined,
      },
    });
  }

  async deleteCategory(adminId: string, id: string) {
    const existing = await this.prisma.productCategory.findFirst({ where: { id, adminId } });
    if (!existing) throw new NotFoundException('Category not found');
    const productCount = await this.prisma.storeProduct.count({ where: { categoryId: id, adminId } });
    if (productCount > 0) {
      throw new BadRequestException('Cannot delete category with existing products');
    }
    await this.prisma.productCategory.delete({ where: { id } });
    return { deleted: true, id };
  }

  // ── Provisioning Profiles ──────────────────────────────────────────────────

  async listProfiles(adminId: string) {
    const profiles = await this.prisma.provisioningProfile.findMany({
      where: { adminId },
      include: { panel: { select: { id: true, name: true } } },
      orderBy: { name: 'asc' },
    });
    return Promise.all(profiles.map((profile) => this.serializeProfile(profile)));
  }

  async createProfile(adminId: string, role: string, data: Record<string, unknown>) {
    const panelId = data.panelId as string;
    const inboundIds = this.normalizeStringArray(data.inboundIds);
    await this.assertProfileScope(adminId, role, panelId, inboundIds);

    const profile = await this.prisma.provisioningProfile.create({
      data: {
        adminId,
        name: data.name as string,
        description: (data.description as string) || null,
        panelId,
        inboundIds,
        protocol: (data.protocol as string) || null,
        settings: (data.settings as Prisma.InputJsonValue) ?? undefined,
        renewalPolicy: (data.renewalPolicy as Prisma.InputJsonValue) ?? undefined,
        clientPolicy: (data.clientPolicy as Prisma.InputJsonValue) ?? undefined,
        enabled: data.enabled !== false,
      },
    });
    return this.serializeProfile(profile);
  }

  async updateProvisioningProfile(adminId: string, role: string, id: string, data: Record<string, unknown>) {
    const existing = await this.prisma.provisioningProfile.findFirst({ where: { id, adminId } });
    if (!existing) throw new NotFoundException('Provisioning profile not found');

    const panelId = (data.panelId as string | undefined) ?? existing.panelId;
    const inboundIds =
      data.inboundIds !== undefined ? this.normalizeStringArray(data.inboundIds) : this.normalizeStringArray(existing.inboundIds);
    await this.assertProfileScope(adminId, role, panelId, inboundIds);

    const profile = await this.prisma.provisioningProfile.update({
      where: { id },
      data: {
        name: data.name as string | undefined,
        description: data.description as string | undefined,
        panelId: data.panelId as string | undefined,
        inboundIds: data.inboundIds !== undefined ? inboundIds : undefined,
        protocol: data.protocol as string | undefined,
        settings: data.settings as Prisma.InputJsonValue | undefined,
        renewalPolicy: data.renewalPolicy as Prisma.InputJsonValue | undefined,
        clientPolicy: data.clientPolicy as Prisma.InputJsonValue | undefined,
        enabled: data.enabled as boolean | undefined,
      },
    });
    return this.serializeProfile(profile);
  }

  async deleteProfile(adminId: string, id: string) {
    const existing = await this.prisma.provisioningProfile.findFirst({ where: { id, adminId } });
    if (!existing) throw new NotFoundException('Provisioning profile not found');
    const productCount = await this.prisma.storeProduct.count({ where: { profileId: id, adminId } });
    if (productCount > 0) {
      throw new BadRequestException('Cannot delete provisioning profile with linked products');
    }
    await this.prisma.provisioningProfile.delete({ where: { id } });
    return { deleted: true, id };
  }

  // ── Product Templates ──────────────────────────────────────────────────────

  async listTemplates(adminId: string) {
    const items = await this.prisma.productTemplate.findMany({
      where: { adminId },
      include: { profile: { include: { panel: { select: { id: true, name: true } } } } },
      orderBy: { createdAt: 'desc' },
    });
    return items.map((t) => this.serializeProduct(t));
  }

  async createTemplate(adminId: string, data: Record<string, unknown>) {
    if (data.profileId) {
      await this.ensureProfileOwned(adminId, data.profileId as string);
    }
    return this.prisma.productTemplate.create({
      data: {
        adminId,
        profileId: (data.profileId as string) || null,
        name: data.name as string,
        description: (data.description as string) || null,
        priceToman: data.priceToman != null ? Number(data.priceToman) : null,
        priceUsd: Number(data.priceUsd ?? 0),
        traffic: BigInt(data.traffic as string | number || 0),
        durationDays: Number(data.durationDays ?? 30),
        inboundIds: (data.inboundIds as Prisma.InputJsonValue) ?? undefined,
        locationSet: (data.locationSet as string) || null,
      },
    });
  }

  async updateTemplate(adminId: string, id: string, data: Record<string, unknown>) {
    const existing = await this.prisma.productTemplate.findFirst({ where: { id, adminId } });
    if (!existing) throw new NotFoundException('Template not found');
    if (data.profileId) {
      await this.ensureProfileOwned(adminId, data.profileId as string);
    }
    return this.prisma.productTemplate.update({
      where: { id },
      data: {
        profileId: data.profileId !== undefined ? ((data.profileId as string) || null) : undefined,
        name: data.name as string | undefined,
        description: data.description !== undefined ? ((data.description as string) || null) : undefined,
        priceToman: data.priceToman != null ? Number(data.priceToman) : undefined,
        priceUsd: data.priceUsd != null ? Number(data.priceUsd) : undefined,
        traffic: data.traffic != null ? BigInt(data.traffic as string | number) : undefined,
        durationDays: data.durationDays != null ? Number(data.durationDays) : undefined,
        inboundIds: data.inboundIds as Prisma.InputJsonValue | undefined,
        locationSet: data.locationSet !== undefined ? ((data.locationSet as string) || null) : undefined,
      },
    });
  }

  async deleteTemplate(adminId: string, id: string) {
    const existing = await this.prisma.productTemplate.findFirst({ where: { id, adminId } });
    if (!existing) throw new NotFoundException('Template not found');
    await this.prisma.productTemplate.delete({ where: { id } });
    return { deleted: true, id };
  }

  async cloneTemplateToProduct(adminId: string, templateId: string, categoryId: string) {
    await this.ensureCategoryOwned(adminId, categoryId);
    const template = await this.prisma.productTemplate.findFirst({
      where: { id: templateId, adminId },
    });
    if (!template) throw new NotFoundException('Template not found');
    if (!template.profileId) throw new BadRequestException('Template has no provisioning profile');

    const product = await this.prisma.storeProduct.create({
      data: {
        adminId,
        categoryId,
        profileId: template.profileId,
        templateId: template.id,
        name: template.name,
        description: template.description,
        priceToman: template.priceToman,
        priceUsd: template.priceUsd,
        traffic: template.traffic,
        durationDays: template.durationDays,
      },
    });
    return this.serializeProduct(product);
  }

  // ── Products ───────────────────────────────────────────────────────────────

  async listProducts(adminId: string) {
    const items = await this.prisma.storeProduct.findMany({
      where: { adminId },
      include: {
        category: true,
        profile: { include: { panel: { select: { id: true, name: true } } } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    return items.map((p) => this.serializeProduct(p));
  }

  async createProduct(adminId: string, data: Record<string, unknown>) {
    await this.ensureCategoryOwned(adminId, data.categoryId as string);
    await this.ensureProfileOwned(adminId, data.profileId as string);
    const product = await this.prisma.storeProduct.create({
      data: {
        adminId,
        categoryId: data.categoryId as string,
        profileId: data.profileId as string,
        templateId: (data.templateId as string) || null,
        name: data.name as string,
        description: (data.description as string) || null,
        priceToman: data.priceToman != null ? Number(data.priceToman) : null,
        priceUsd: Number(data.priceUsd ?? 0),
        traffic: BigInt(data.traffic as string | number || 0),
        durationDays: Number(data.durationDays ?? 30),
        status: (data.status as string) || 'active',
        badge: (data.badge as string) || null,
        sortOrder: Number(data.sortOrder ?? 0),
        featured: data.featured === true,
        visible: data.visible !== false,
        renewable: data.renewable !== false,
        maxQuantity: Number(data.maxQuantity ?? 1),
      },
    });
    return this.serializeProduct(product);
  }

  async updateProduct(adminId: string, id: string, data: Record<string, unknown>) {
    const existing = await this.prisma.storeProduct.findFirst({ where: { id, adminId } });
    if (!existing) throw new NotFoundException('Product not found');
    if (data.categoryId) await this.ensureCategoryOwned(adminId, data.categoryId as string);
    if (data.profileId) await this.ensureProfileOwned(adminId, data.profileId as string);
    await this.prisma.storeProduct.update({
      where: { id },
      data: {
        categoryId: data.categoryId as string | undefined,
        profileId: data.profileId as string | undefined,
        name: data.name as string | undefined,
        description: data.description as string | undefined,
        priceToman: data.priceToman != null ? Number(data.priceToman) : undefined,
        priceUsd: data.priceUsd != null ? Number(data.priceUsd) : undefined,
        traffic: data.traffic != null ? BigInt(data.traffic as string | number) : undefined,
        durationDays: data.durationDays != null ? Number(data.durationDays) : undefined,
        status: data.status as string | undefined,
        badge: data.badge as string | undefined,
        sortOrder: data.sortOrder != null ? Number(data.sortOrder) : undefined,
        featured: data.featured as boolean | undefined,
        visible: data.visible as boolean | undefined,
        renewable: data.renewable as boolean | undefined,
        maxQuantity: data.maxQuantity != null ? Number(data.maxQuantity) : undefined,
      },
    });
    const product = await this.prisma.storeProduct.findFirst({ where: { id, adminId } });
    return product ? this.serializeProduct(product) : null;
  }

  async deleteProduct(adminId: string, id: string) {
    const existing = await this.prisma.storeProduct.findFirst({ where: { id, adminId } });
    if (!existing) throw new NotFoundException('Product not found');
    await this.prisma.storeProduct.delete({ where: { id } });
    return { deleted: true, id };
  }

  // ── Orders (Admin) ─────────────────────────────────────────────────────────

  async listOrders(adminId: string, status?: string) {
    const store = await this.getOrCreateProfile(adminId);
    const orders = await this.prisma.storeOrder.findMany({
      where: {
        storeId: store.id,
        ...(status ? { status: status as StoreOrderStatus } : {}),
      },
      include: {
        product: { include: { category: true } },
        customer: true,
        payment: true,
        client: { select: { id: true, email: true, subId: true, subToken: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return orders.map((o) => ({
      ...o,
      product: o.product ? this.serializeProduct(o.product) : o.product,
    }));
  }

  async getOrder(adminId: string, orderId: string) {
    const store = await this.getOrCreateProfile(adminId);
    const order = await this.prisma.storeOrder.findFirst({
      where: { id: orderId, storeId: store.id },
      include: {
        product: { include: { category: true, profile: true } },
        customer: true,
        payment: true,
        timeline: { orderBy: { createdAt: 'asc' } },
        client: true,
        renewClient: true,
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return {
      ...order,
      product: order.product ? this.serializeProduct(order.product) : order.product,
    };
  }

  private async addTimeline(
    orderId: string,
    status: string,
    message?: string,
    actor?: string,
    metadata?: Record<string, unknown>,
  ) {
    return this.prisma.orderTimelineEvent.create({
      data: { orderId, status, message, actor, metadata: metadata as Prisma.InputJsonValue | undefined },
    });
  }

  async approveOrder(adminId: string, role: string, orderId: string) {
    const order = await this.getOrder(adminId, orderId);
    if (
      !['PAYMENT_SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'PROVISION_FAILED', 'PROVISIONING'].includes(
        order.status,
      )
    ) {
      throw new BadRequestException('Order cannot be approved in current status');
    }

    // If already payment-approved once, just retry provisioning
    if (['APPROVED', 'PROVISION_FAILED', 'PROVISIONING'].includes(order.status)) {
      return this.provisionOrder(adminId, role, orderId);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.storeOrder.update({
        where: { id: orderId },
        data: { status: 'APPROVED', provisionError: null },
      });
      await tx.storePayment.updateMany({
        where: { orderId },
        data: { status: 'APPROVED', reviewedAt: new Date(), reviewedBy: adminId },
      });
      await tx.orderTimelineEvent.create({
        data: { orderId, status: 'APPROVED', message: 'Payment approved', actor: 'admin' },
      });
    });

    // Notify customer (in-app + Telegram) that payment was approved
    await this.customerNotifications.notifyCustomer(order.customerId, {
      type: 'order_approved',
      title: '✅ سفارش تأیید شد / Order approved',
      message: 'پرداخت تأیید شد؛ در حال ساخت سرویس… / Payment approved — creating your service…',
      payload: {
        orderId,
        trackingCode: order.trackingCode,
        status: 'APPROVED',
        configName: order.configName,
        kind: 'payment_approved',
        isRenewal: !!order.isRenewal,
      },
      orderId,
    });

    return this.provisionOrder(adminId, role, orderId);
  }

  async provisionOrder(adminId: string, role: string, orderId: string) {
    const order = await this.getOrder(adminId, orderId);
    if (order.status === 'ACTIVE' || order.status === 'RENEWED') {
      return order;
    }

    // Allow retry from failed/stuck provisioning states
    if (
      !['APPROVED', 'PROVISIONING', 'PROVISION_FAILED', 'PAYMENT_SUBMITTED', 'UNDER_REVIEW'].includes(
        order.status,
      )
    ) {
      throw new BadRequestException('Order cannot be provisioned in current status');
    }

    await this.prisma.storeOrder.update({
      where: { id: orderId },
      data: { status: 'PROVISIONING', provisionError: null },
    });
    await this.addTimeline(orderId, 'PROVISIONING', 'Creating service', 'system');

    try {
      await this.provisioning.provisionOrder(orderId, adminId, role);
      const finalStatus = order.isRenewal ? 'RENEWED' : 'ACTIVE';
      await this.prisma.storeOrder.update({
        where: { id: orderId },
        data: { status: finalStatus, provisionError: null },
      });
      await this.addTimeline(orderId, finalStatus, 'Service ready', 'system');
      const ready = await this.prisma.storeOrder.findUnique({
        where: { id: orderId },
        include: {
          client: { select: { subId: true, remark: true, email: true } },
          product: { select: { name: true } },
        },
      });
      const serviceName =
        ready?.client?.remark || ready?.client?.email || ready?.product?.name || order.configName;
      await this.customerNotifications.notifyCustomer(order.customerId, {
        type: 'subscription_updated',
        title: order.isRenewal
          ? '🎉 تمدید انجام شد / Renewal complete'
          : '🎉 سرویس آماده است / Service ready',
        message: order.isRenewal
          ? 'تمدید با موفقیت انجام شد. / Your renewal is active.'
          : 'خرید شما فعال شد. / Your purchase is now active.',
        payload: {
          orderId,
          trackingCode: order.trackingCode,
          status: finalStatus,
          subId: ready?.client?.subId || undefined,
          configName: order.configName,
          serviceName,
          kind: 'service_ready',
          isRenewal: !!order.isRenewal,
        },
        orderId,
      });
    } catch (err: any) {
      const message = String(err?.message || err?.response?.message || 'Provisioning failed');
      await this.prisma.storeOrder.update({
        where: { id: orderId },
        data: { status: 'PROVISION_FAILED', provisionError: message },
      });
      await this.addTimeline(orderId, 'PROVISION_FAILED', message, 'system');
      await this.customerNotifications.notifyCustomer(order.customerId, {
        type: 'provisioning_issue',
        title: '⚠️ ساخت سرویس ناموفق / Service creation failed',
        message:
          'پرداخت تأیید شد ولی ساخت سرویس خطا داد. به‌زودی رفع می‌شود. / Payment was approved, but creating the service failed. We will fix and retry.',
        payload: {
          orderId,
          trackingCode: order.trackingCode,
          status: 'PROVISION_FAILED',
          configName: order.configName,
          kind: 'provision_failed',
        },
        orderId,
      });
      throw err;
    }

    return this.getOrder(adminId, orderId);
  }

  async rejectOrder(adminId: string, orderId: string, reason?: string) {
    const order = await this.getOrder(adminId, orderId);
    await this.prisma.$transaction(async (tx) => {
      await tx.storeOrder.update({
        where: { id: orderId },
        data: { status: 'REJECTED', rejectReason: reason || null },
      });
      await tx.storePayment.updateMany({
        where: { orderId },
        data: { status: 'REJECTED', rejectReason: reason || null, reviewedAt: new Date(), reviewedBy: adminId },
      });
      await tx.orderTimelineEvent.create({
        data: {
          orderId,
          status: 'REJECTED',
          message: reason || 'Payment rejected',
          actor: 'admin',
        },
      });
    });
    await this.customerNotifications.notifyCustomer(order.customerId, {
      type: 'payment_rejected',
      title: '❌ سفارش رد شد / Order rejected',
      message:
        reason ||
        'پرداخت رد شد. با پشتیبانی تماس بگیرید یا با رسید جدید دوباره تلاش کنید. / Your payment was rejected. Contact support or retry with a new receipt.',
      payload: {
        orderId,
        trackingCode: order.trackingCode,
        status: 'REJECTED',
        configName: order.configName,
        kind: 'payment_rejected',
        reason: reason || null,
      },
      orderId,
    });
    return this.getOrder(adminId, orderId);
  }

  private static readonly ADMIN_CANCELABLE = new Set([
    'PENDING_PAYMENT',
    'PAYMENT_SUBMITTED',
    'UNDER_REVIEW',
    'APPROVED',
    'PROVISIONING',
    'PROVISION_FAILED',
  ]);

  private static readonly CUSTOMER_CANCELABLE = new Set([
    'PENDING_PAYMENT',
    'PAYMENT_SUBMITTED',
    'UNDER_REVIEW',
  ]);

  async cancelOrder(adminId: string, orderId: string, reason?: string) {
    const order = await this.getOrder(adminId, orderId);
    if (!StoreService.ADMIN_CANCELABLE.has(order.status)) {
      throw new BadRequestException(`Cannot cancel order in status ${order.status}`);
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.storeOrder.update({
        where: { id: orderId },
        data: { status: 'CANCELLED', rejectReason: reason || order.rejectReason || null },
      });
      await tx.storePayment.updateMany({
        where: { orderId, status: { in: ['PENDING', 'SUBMITTED'] } },
        data: { status: 'REJECTED', rejectReason: reason || 'Order cancelled', reviewedAt: new Date(), reviewedBy: adminId },
      });
      await tx.orderTimelineEvent.create({
        data: {
          orderId,
          status: 'CANCELLED',
          message: reason || 'Order cancelled by admin',
          actor: 'admin',
        },
      });
    });
    await this.customerNotifications.notifyCustomer(order.customerId, {
      type: 'order_cancelled',
      title: '🚫 سفارش لغو شد / Order cancelled',
      message: reason || 'این سفارش لغو شد. / This order was cancelled.',
      payload: {
        orderId,
        trackingCode: order.trackingCode,
        status: 'CANCELLED',
        configName: order.configName,
        kind: 'order_cancelled',
      },
      orderId,
    });
    return this.getOrder(adminId, orderId);
  }

  async cancelOrderByCustomer(sessionToken: string, orderId: string) {
    const customer = await this.customerAuth.validateSession(sessionToken);
    const order = await this.prisma.storeOrder.findFirst({
      where: { id: orderId, customerId: customer.id },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (!StoreService.CUSTOMER_CANCELABLE.has(order.status)) {
      throw new BadRequestException('This order can no longer be cancelled');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.storeOrder.update({
        where: { id: orderId },
        data: { status: 'CANCELLED' },
      });
      await tx.storePayment.updateMany({
        where: { orderId, status: { in: ['PENDING', 'SUBMITTED'] } },
        data: { status: 'REJECTED', rejectReason: 'Cancelled by customer', reviewedAt: new Date() },
      });
      await tx.orderTimelineEvent.create({
        data: {
          orderId,
          status: 'CANCELLED',
          message: 'Order cancelled by customer',
          actor: 'customer',
        },
      });
    });
    await this.customerNotifications.notifyCustomer(customer.id, {
      type: 'order_cancelled',
      title: '🚫 سفارش لغو شد / Order cancelled',
      message: 'شما این سفارش را لغو کردید. / You cancelled this order.',
      payload: {
        orderId,
        trackingCode: order.trackingCode,
        status: 'CANCELLED',
        configName: order.configName,
        kind: 'order_cancelled',
      },
      orderId,
    });
    return this.buildCustomerDashboard(customer.token);
  }

  // ── Public Storefront ──────────────────────────────────────────────────────

  private async buildPublicBranding(adminId: string) {
    const branding = await this.branding.getBranding(adminId);
    return {
      name: branding.name,
      logo: branding.logo,
      logoDark: branding.logoDark,
      primaryColor: branding.primaryColor,
      accentColor: branding.accentColor,
      footerText: branding.footerText,
      supportLinks: branding.supportLinks,
      theme: branding.theme,
    };
  }

  private serializeService(
    service: {
      id: string;
      email: string;
      remark: string | null;
      subId: string | null;
      subToken: string | null;
      enable: boolean;
      expiryTime: bigint;
      total: bigint;
      up: bigint;
      down: bigint;
    },
    categoryId: string | null = null,
  ) {
    const used = service.up + service.down;
    const expired = service.expiryTime > 0n && service.expiryTime <= BigInt(Date.now());
    const disabled = !service.enable;
    // Unused traffic is still an active provisioned service (ready for first connect),
    // not "pending" — pending is reserved for unpaid/review orders in the UI.
    let status = 'active';
    if (disabled) status = 'disabled';
    else if (expired) status = 'expired';

    return {
      ...service,
      categoryId,
      status,
      unused: !disabled && !expired && used === 0n,
      total: service.total.toString(),
      up: service.up.toString(),
      down: service.down.toString(),
      expiryTime: service.expiryTime.toString(),
    };
  }

  /** Newest fulfilled order wins — used to lock renewals to the service category. */
  private categoryIdByClientId(
    orders: Array<{
      clientId: string | null;
      renewClientId: string | null;
      createdAt?: Date;
      product: { categoryId: string };
    }>,
  ): Map<string, string> {
    const sorted = [...orders].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return tb - ta;
    });
    const map = new Map<string, string>();
    for (const order of sorted) {
      const cat = order.product?.categoryId;
      if (!cat) continue;
      if (order.clientId && !map.has(order.clientId)) map.set(order.clientId, cat);
      if (order.renewClientId && !map.has(order.renewClientId)) {
        map.set(order.renewClientId, cat);
      }
    }
    return map;
  }

  private async assertRenewCategoryCompatible(
    adminId: string,
    clientId: string,
    productCategoryId: string,
  ) {
    const existing = await this.prisma.storeOrder.findFirst({
      where: {
        OR: [{ clientId }, { renewClientId: clientId }],
        status: { in: ['ACTIVE', 'RENEWED'] },
        product: { adminId },
      },
      include: { product: true },
      orderBy: { createdAt: 'desc' },
    });
    if (existing && existing.product.categoryId !== productCategoryId) {
      throw new BadRequestException(
        'Product category is not compatible with this service / دسته‌بندی پلن با این سرویس سازگار نیست',
      );
    }
  }

  private serializeNotification(notification: {
    id: string;
    type: string;
    title: string;
    message: string | null;
    payload: Prisma.JsonValue | null;
    readAt: Date | null;
    createdAt: Date;
  }) {
    return {
      ...notification,
      isRead: !!notification.readAt,
    };
  }

  private collapseNotifications<
    T extends { id: string; payload?: Prisma.JsonValue | null; isRead?: boolean },
  >(items: T[], limit = 12): T[] {
    const seenOrders = new Set<string>();
    const out: T[] = [];
    for (const item of items) {
      const payload = (item.payload ?? {}) as Record<string, unknown>;
      const orderId = typeof payload.orderId === 'string' ? payload.orderId : null;
      if (orderId) {
        if (seenOrders.has(orderId)) continue;
        seenOrders.add(orderId);
      }
      out.push(item);
      if (out.length >= limit) break;
    }
    return out;
  }

  private async resolveCustomerServices(
    customerOrders: Array<{ clientId: string | null; renewClientId: string | null }>,
    linkedClientIds: string[] = [],
  ) {
    const clientIds = new Set<string>();
    for (const order of customerOrders) {
      if (order.clientId) clientIds.add(order.clientId);
      if (order.renewClientId) clientIds.add(order.renewClientId);
    }
    for (const id of linkedClientIds) {
      if (id) clientIds.add(id);
    }

    if (!clientIds.size) return [];

    const services = await this.prisma.client.findMany({
      where: { id: { in: [...clientIds] } },
      select: {
        id: true,
        email: true,
        remark: true,
        subId: true,
        subToken: true,
        enable: true,
        expiryTime: true,
        total: true,
        up: true,
        down: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return services.map((service) => this.serializeService(service));
  }

  private getLinkedClientIds(metadata: unknown): string[] {
    const meta = (metadata || {}) as { linkedClientIds?: string[] };
    return Array.isArray(meta.linkedClientIds)
      ? meta.linkedClientIds.filter((id) => typeof id === 'string' && id.trim())
      : [];
  }

  private async linkClientToCustomer(customerId: string, clientId: string) {
    const customer = await this.prisma.storeCustomer.findUnique({
      where: { id: customerId },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const linked = this.getLinkedClientIds(customer.metadata);
    if (linked.includes(clientId)) return;

    const meta = (customer.metadata || {}) as Record<string, unknown>;
    await this.prisma.storeCustomer.update({
      where: { id: customerId },
      data: {
        metadata: {
          ...meta,
          linkedClientIds: [...linked, clientId],
        },
      },
    });
  }

  /** Resolve + attach an existing subscription (by /s/ or /sub/ link) to the logged-in customer. */
  async claimServiceBySubscriptionLink(
    sessionToken: string,
    subscriptionLink: string,
  ) {
    this.rateLimit.check('claim-service', sessionToken);
    const customer = await this.customerAuth.validateSession(sessionToken);
    const link = String(subscriptionLink || '').trim();
    if (!link) throw new BadRequestException('subscriptionLink is required');

    const client = await this.provisioning.resolveRenewClientByToken(
      customer.adminId,
      link,
    );

    // Attribute orphaned synced clients to this store admin so future lookups stay scoped
    if (!client.adminId) {
      await this.prisma.client.update({
        where: { id: client.id },
        data: { adminId: customer.adminId },
      });
      (client as { adminId: string | null }).adminId = customer.adminId;
    }

    await this.linkClientToCustomer(customer.id, client.id);

    return {
      service: this.serializeService(client),
      dashboard: await this.buildCustomerDashboard(customer.token),
    };
  }

  private async listCompatibleRenewProducts(
    adminId: string,
    orders: Array<{ clientId: string | null; renewClientId: string | null; product: { categoryId: string } }>,
  ) {
    const categoryIds = [...new Set(orders.map((order) => order.product.categoryId))];
    const products = await this.prisma.storeProduct.findMany({
      where: {
        adminId,
        visible: true,
        renewable: true,
        status: 'active',
        ...(categoryIds.length ? { categoryId: { in: categoryIds } } : {}),
      },
      include: { category: true },
      orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }],
    });
    return products.map((product) => this.serializeProduct(product));
  }

  private async buildCustomerDashboard(customerToken: string) {
    const customer = await this.customers.getByToken(customerToken);
    if (!customer) throw new NotFoundException('Customer not found');

    const [store, branding, servicesRaw, renewProducts, catalogProducts, categories] =
      await Promise.all([
        this.prisma.storeProfile.findUnique({
          where: { adminId: customer.adminId },
        }),
        this.buildPublicBranding(customer.adminId),
        this.resolveCustomerServices(
          customer.orders,
          this.getLinkedClientIds(customer.metadata),
        ),
        this.listCompatibleRenewProducts(customer.adminId, customer.orders),
        this.prisma.storeProduct.findMany({
          where: {
            adminId: customer.adminId,
            visible: true,
            status: 'active',
          },
          include: { category: true },
          orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }],
        }),
        this.prisma.productCategory.findMany({
          where: { adminId: customer.adminId, visible: true, enabled: true },
          orderBy: [{ sortOrder: 'asc' }],
        }),
      ]);

    const categoryByClient = this.categoryIdByClientId(customer.orders);
    const services = servicesRaw.map((service) => ({
      ...service,
      categoryId: categoryByClient.get(service.id) || null,
    }));

    const pendingStatuses: StoreOrderStatus[] = [
      'PENDING_PAYMENT',
      'PAYMENT_SUBMITTED',
      'UNDER_REVIEW',
      'APPROVED',
      'PROVISIONING',
      'PROVISION_FAILED',
    ];

    return {
      token: customer.token,
      profile: {
        id: customer.id,
        name: customer.name,
        telegram: customer.telegram,
        whatsapp: customer.whatsapp,
        email: customer.email,
      },
      store: {
        slug: store?.slug,
        title: store?.title,
        defaultCurrency: store?.defaultCurrency,
        payment: store
          ? (() => {
              const paymentConfig = normalizePaymentConfig(store.paymentConfig, store);
              const manualBankEnabled = paymentConfig.methods.manual_bank !== false;
              const cardsFiltered = manualBankEnabled
                ? paymentConfig.cards.filter(
                    (c) =>
                      c.enabled !== false &&
                      Boolean(c.cardNumber || c.bankName || c.iban || c.instructions),
                  )
                : [];
              const primary = cardsFiltered[0] || primaryCardFromConfig(paymentConfig);
              const cards =
                cardsFiltered.length > 0
                  ? cardsFiltered
                  : primary &&
                      (primary.cardNumber ||
                        primary.bankName ||
                        primary.iban ||
                        primary.instructions ||
                        store.bankCardNumber)
                    ? [
                        {
                          ...primary,
                          id: primary.id || 'primary',
                          bankName: primary.bankName || store.bankName || '',
                          cardNumber: primary.cardNumber || store.bankCardNumber || '',
                          cardHolder: primary.cardHolder || store.bankCardHolder || '',
                          iban: primary.iban || store.bankIban || '',
                          instructions:
                            primary.instructions || store.paymentInstructions || '',
                        },
                      ]
                    : [];
              return {
                method: 'manual_bank',
                instructions: primary?.instructions || store.paymentInstructions,
                cardNumber: primary?.cardNumber || store.bankCardNumber,
                cardHolder: primary?.cardHolder || store.bankCardHolder,
                bankName: primary?.bankName || store.bankName,
                iban: primary?.iban || store.bankIban,
                accountInfo: store.bankAccountInfo,
                cards,
              };
            })()
          : null,
      },
      branding,
      supportLinks: branding.supportLinks,
      services,
      activeServices: services.filter((service) => service.status === 'active'),
      expiredServices: services.filter((service) => service.status === 'expired' || service.status === 'disabled'),
      pendingOrders: customer.orders.filter((order) => pendingStatuses.includes(order.status)),
      orders: customer.orders.map((order) => ({
        id: order.id,
        trackingCode: order.trackingCode,
        status: order.status,
        amount: order.amount,
        currency: order.currency,
        isRenewal: order.isRenewal,
        productName: order.product.name,
        categoryId: order.product.categoryId,
        createdAt: order.createdAt,
        timeline: order.timeline,
        payment: order.payment,
      })),
      products: catalogProducts.map((product) => this.serializeProduct(product)),
      renewProducts,
      categories,
      notifications: this.collapseNotifications(
        customer.notifications.map((notification) => this.serializeNotification(notification)),
      ),
      activity: customer.activities,
    };
  }

  async getPublicStoreBySlug(slug: string) {
    const store = await this.prisma.storeProfile.findUnique({
      where: { slug },
      include: { domain: true },
    });
    if (!store || !store.enabled) throw new NotFoundException('Store not found');

    const [products, categories, branding] = await Promise.all([
      this.prisma.storeProduct.findMany({
        where: { adminId: store.adminId, visible: true, status: 'active' },
        include: { category: true },
        orderBy: [{ featured: 'desc' }, { sortOrder: 'asc' }],
      }),
      this.prisma.productCategory.findMany({
        where: { adminId: store.adminId, visible: true, enabled: true },
        orderBy: [{ sortOrder: 'asc' }],
      }),
      this.buildPublicBranding(store.adminId),
    ]);

    const paymentConfig = normalizePaymentConfig(store.paymentConfig, store);
    const manualBankEnabled = paymentConfig.methods.manual_bank !== false;
    const cards = manualBankEnabled
      ? paymentConfig.cards.filter(
          (card) =>
            card.enabled !== false &&
            Boolean(card.cardNumber || card.bankName || card.iban || card.instructions),
        )
      : [];
    const primary = cards[0] || primaryCardFromConfig(paymentConfig);

    return {
      store: {
        title: store.title,
        description: store.description,
        slug: store.slug,
        logoUrl: branding.logo || store.logo,
        logoDarkUrl: branding.logoDark || null,
        defaultCurrency: store.defaultCurrency,
        paymentInstructions: primary?.instructions || store.paymentInstructions,
        bankName: primary?.bankName || store.bankName,
        bankCardNumber: primary?.cardNumber || store.bankCardNumber,
        bankCardHolder: primary?.cardHolder || store.bankCardHolder,
        bankIban: primary?.iban || store.bankIban,
        bankAccountInfo: store.bankAccountInfo,
        branding,
        welcome: {
          headline: store.title,
          description: store.description,
          primaryAction: 'new-order',
          secondaryAction: 'login',
        },
        payment: {
          method: manualBankEnabled ? 'manual_bank' : 'none',
          methods: STORE_PAYMENT_METHOD_META.map((method) => ({
            id: method.id,
            label: method.label,
            enabled: Boolean(paymentConfig.methods[method.id]),
            available: method.available,
          })),
          cards,
          instructions: primary?.instructions || store.paymentInstructions,
          cardNumber: primary?.cardNumber || store.bankCardNumber,
          cardHolder: primary?.cardHolder || store.bankCardHolder,
          bankName: primary?.bankName || store.bankName,
          iban: primary?.iban || store.bankIban,
          accountInfo: store.bankAccountInfo,
        },
      },
      categories,
      products: products.map((p) => this.serializeProduct(p)),
    };
  }

  async getPublicStoreByDomain(host: string) {
    const normalized = host.toLowerCase().split(':')[0];
    const domain = await this.prisma.domain.findFirst({
      where: {
        domain: normalized,
        status: { in: ['VERIFIED', 'SSL_ACTIVE'] },
      },
      include: { storeProfile: true, admin: { select: { id: true } } },
    });
    if (!domain?.adminId) throw new NotFoundException('Store not found');

    let store = domain.storeProfile;
    if (!store) {
      store = await this.prisma.storeProfile.findUnique({
        where: { adminId: domain.adminId },
      });
      if (store && !store.domainId) {
        await this.prisma.storeProfile.update({
          where: { id: store.id },
          data: { domainId: domain.id },
        });
      }
    }
    if (!store?.enabled) throw new NotFoundException('Store not found');
    return this.getPublicStoreBySlug(store.slug);
  }

  async lookupCustomer(slug: string, token: string, requestKey: string) {
    this.rateLimit.check('customerLookup', requestKey);
    const customer = await this.customers.lookupByStore(slug, token);
    if (!customer) throw new NotFoundException('Customer not found');
    return {
      id: customer.id,
      token: customer.token,
      name: customer.name,
      telegram: customer.telegram,
      whatsapp: customer.whatsapp,
      email: customer.email,
    };
  }

  async createCustomerSession(
    token: string,
    requestKey: string,
    context?: { userAgent?: string; ipAddress?: string | null },
  ) {
    this.rateLimit.check('customerLogin', requestKey);
    return this.customerAuth.loginWithPermanentToken(token, context);
  }

  async getCustomerSession(sessionToken: string) {
    const customer = await this.customerAuth.validateSession(sessionToken);
    return this.buildCustomerDashboard(customer.token);
  }

  async logoutCustomerSession(sessionToken: string) {
    return this.customerAuth.revokeSession(sessionToken);
  }

  async markNotificationAsRead(sessionToken: string, notificationId: string) {
    const customer = await this.customerAuth.validateSession(sessionToken);
    await this.customerNotifications.markAsRead(customer.id, notificationId);
    return { ok: true };
  }

  async markAllNotificationsAsRead(sessionToken: string) {
    const customer = await this.customerAuth.validateSession(sessionToken);
    await this.customerNotifications.markAllAsRead(customer.id);
    return { ok: true };
  }

  async createCheckout(slug: string, payload: CheckoutPayload, requestKey = slug) {
    this.rateLimit.check('checkout', requestKey);
    const store = await this.prisma.storeProfile.findUnique({ where: { slug } });
    if (!store || !store.enabled) throw new NotFoundException('Store not found');

    const product = await this.prisma.storeProduct.findFirst({
      where: { id: payload.productId, adminId: store.adminId, visible: true, status: 'active' },
      include: { category: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    const currencyHint = (payload.currency || store.defaultCurrency || 'USD').toUpperCase();
    const hasToman = Number(product.priceToman) > 0;
    const hasUsd = Number(product.priceUsd) > 0;
    const tomanCurrencies = new Set(['IRT', 'IRR', 'TOMAN', 'TMN']);
    const useToman =
      (tomanCurrencies.has(currencyHint) && hasToman) ||
      (hasToman && !hasUsd);
    const currency = useToman
      ? currencyHint === 'IRR'
        ? 'IRR'
        : 'TOMAN'
      : hasUsd
        ? 'USD'
        : hasToman
          ? 'TOMAN'
          : 'USD';
    const amount = useToman || currency === 'TOMAN' || currency === 'IRR'
      ? Number(product.priceToman ?? 0)
      : Number(product.priceUsd ?? 0);

    let renewClientId: string | undefined;
    if (payload.isRenewal) {
      if (!payload.renewClientId) throw new BadRequestException('Renewal requires a service');
      const client = await this.provisioning.resolveRenewClient(store.adminId, payload.renewClientId);
      renewClientId = client.id;

      if (!product.renewable) {
        throw new BadRequestException('Product is not compatible for renewal');
      }
      await this.assertRenewCategoryCompatible(store.adminId, client.id, product.categoryId);
    } else if (!payload.configName && !payload.isRenewal) {
      throw new BadRequestException('Config name is required');
    }

    const customer = await this.customers.findOrCreate(store.adminId, {
      token: payload.customerToken,
      name: payload.name,
      telegram: payload.telegram,
      whatsapp: payload.whatsapp,
      email: payload.email,
    });
    if (!customer) throw new ForbiddenException('Invalid customer token');

    const configName = payload.isRenewal
      ? 'renewal'
      : await this.provisioning.generateUniqueConfigName(payload.configName!, store.adminId);

    let trackingCode = generateTrackingCode();
    while (await this.prisma.storeOrder.findUnique({ where: { trackingCode } })) {
      trackingCode = generateTrackingCode();
    }

    const hasPayment = !!(payload.receiptText || payload.receiptImage);
    const initialStatus: StoreOrderStatus = hasPayment ? 'PAYMENT_SUBMITTED' : 'PENDING_PAYMENT';

    const order = await this.prisma.$transaction(async (tx) => {
      const created = await tx.storeOrder.create({
        data: {
          trackingCode,
          storeId: store.id,
          productId: product.id,
          customerId: customer.id,
          configName,
          amount,
          currency,
          status: initialStatus,
          notes: payload.notes,
          isRenewal: !!payload.isRenewal,
          renewClientId,
        },
      });

      await tx.storePayment.create({
        data: {
          orderId: created.id,
          method: 'MANUAL_BANK',
          status: hasPayment ? 'SUBMITTED' : 'PENDING',
          amount,
          currency,
          receiptText: payload.receiptText,
          receiptImage: payload.receiptImage,
        },
      });

      await tx.orderTimelineEvent.create({
        data: { orderId: created.id, status: 'CREATED', message: 'Order created', actor: 'customer' },
      });
      if (hasPayment) {
        await tx.orderTimelineEvent.create({
          data: { orderId: created.id, status: 'PAYMENT_SUBMITTED', message: 'Payment receipt submitted', actor: 'customer' },
        });
        await tx.storeOrder.update({
          where: { id: created.id },
          data: { status: 'UNDER_REVIEW' },
        });
        await tx.orderTimelineEvent.create({
          data: { orderId: created.id, status: 'UNDER_REVIEW', message: 'Awaiting admin review', actor: 'system' },
        });
      }

      return created;
    });

    await this.customerNotifications.notifyCustomer(customer.id, {
      type: payload.isRenewal ? 'renewal_submitted' : 'order_submitted',
      title: payload.isRenewal
        ? '🔄 درخواست تمدید ثبت شد / Renewal submitted'
        : '🛒 سفارش ثبت شد / Order submitted',
      message: hasPayment
        ? 'رسید دریافت شد — در انتظار بررسی ادمین. / Receipt received — awaiting admin review.'
        : 'سفارش ساخته شد — منتظر جزئیات پرداخت. / Order created — waiting for payment details.',
      payload: {
        orderId: order.id,
        trackingCode: order.trackingCode,
        status: hasPayment ? 'UNDER_REVIEW' : order.status,
        isRenewal: !!payload.isRenewal,
        configName: order.configName,
        serviceName: product.name,
        kind: 'order_submitted',
      },
      orderId: order.id,
    });

    // Always push to the store admin bot chat (receipt optional — caption adapts).
    void this.telegram
      .notifyAdminNewOrder(store.adminId, order.id)
      .then((ok) => {
        if (!ok) {
          this.logger.warn(
            `Admin Telegram notify skipped/failed for order ${order.id} (bot disabled, no admin chat, or send error)`,
          );
        }
      })
      .catch((err) => {
        this.logger.warn(`Admin Telegram notify failed: ${err?.message || err}`);
      });

    return {
      orderId: order.id,
      trackingCode: order.trackingCode,
      customerToken: customer.token,
      status: hasPayment ? 'UNDER_REVIEW' : order.status,
      profile: {
        name: customer.name,
        telegram: customer.telegram,
        whatsapp: customer.whatsapp,
      },
    };
  }

  async createRenewCheckout(token: string, payload: RenewCheckoutPayload, requestKey = token) {
    this.rateLimit.check('renewal', requestKey);
    const customer = await this.customers.getByToken(token);
    if (!customer) throw new NotFoundException('Customer not found');

    const store = await this.prisma.storeProfile.findUnique({
      where: { adminId: customer.adminId },
    });
    if (!store) throw new NotFoundException('Store not found');

    let clientId = payload.clientId?.trim();
    if (!clientId && payload.subscriptionLink?.trim()) {
      const resolved = await this.provisioning.resolveRenewClientByToken(
        customer.adminId,
        payload.subscriptionLink.trim(),
      );
      clientId = resolved.id;
      await this.linkClientToCustomer(customer.id, resolved.id);
    }
    if (!clientId) {
      throw new BadRequestException('clientId or subscriptionLink is required');
    }

    const client = await this.provisioning.resolveRenewClient(customer.adminId, clientId);
    const product = await this.prisma.storeProduct.findFirst({
      where: { id: payload.productId, adminId: customer.adminId, renewable: true, visible: true },
      include: { category: true },
    });
    if (!product) throw new NotFoundException('Product not found');

    await this.assertRenewCategoryCompatible(customer.adminId, client.id, product.categoryId);

    return this.createCheckout(store.slug, {
      productId: product.id,
      customerToken: token,
      isRenewal: true,
      renewClientId: client.id,
      receiptText: payload.receiptText,
      receiptImage: payload.receiptImage,
      notes: payload.notes,
      currency: payload.currency,
    }, requestKey);
  }

  async createRenewCheckoutFromSession(
    sessionToken: string,
    payload: RenewCheckoutPayload,
    requestKey = sessionToken,
  ) {
    const customer = await this.customerAuth.validateSession(sessionToken);
    return this.createRenewCheckout(customer.token, payload, requestKey);
  }

  async createCheckoutFromSession(
    sessionToken: string,
    payload: CheckoutPayload,
    requestKey = sessionToken,
  ) {
    const customer = await this.customerAuth.validateSession(sessionToken);
    const store = await this.prisma.storeProfile.findUnique({
      where: { adminId: customer.adminId },
    });
    if (!store || !store.enabled) throw new NotFoundException('Store not found');

    return this.createCheckout(
      store.slug,
      {
        ...payload,
        customerToken: customer.token,
        haveToken: true,
        name: payload.name || customer.name || undefined,
        telegram: payload.telegram || customer.telegram || undefined,
        whatsapp: payload.whatsapp || customer.whatsapp || undefined,
        email: payload.email || customer.email || undefined,
        isRenewal: false,
      },
      requestKey,
    );
  }

  async trackOrder(code: string, requestKey = code) {
    this.rateLimit.check('tracking', requestKey);
    const normalized = String(code || '').trim().toUpperCase();
    const order = await this.prisma.storeOrder.findUnique({
      where: { trackingCode: normalized },
      include: {
        product: true,
        payment: true,
        timeline: { orderBy: { createdAt: 'asc' } },
        client: { select: { id: true, email: true, subId: true, subToken: true, remark: true } },
        customer: { select: { token: true, name: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');

    const allowTokenHandoff =
      !order.isRenewal && Date.now() - order.createdAt.getTime() <= 1000 * 60 * 60 * 24;

    const delivery =
      order.status === 'ACTIVE' || order.status === 'RENEWED'
        ? order.client
          ? {
              subId: order.client.subId,
              subToken: order.client.subToken,
              email: order.client.email,
              remark: order.client.remark,
            }
          : null
        : null;

    const lastTimeline = order.timeline[order.timeline.length - 1];
    const store = await this.prisma.storeProfile.findUnique({
      where: { id: order.storeId },
      select: { slug: true, title: true, adminId: true },
    });
    const branding = store ? await this.branding.getBranding(store.adminId) : null;

    return {
      trackingCode: order.trackingCode,
      status: order.status,
      productName: order.product.name,
      isRenewal: order.isRenewal,
      amount: order.amount,
      currency: order.currency,
      rejectReason: order.rejectReason,
      provisionError: order.provisionError,
      lastTimelineMessage: lastTimeline?.message || null,
      customerToken: allowTokenHandoff ? order.customer.token : undefined,
      timeline: order.timeline,
      delivery,
      storeSlug: store?.slug || null,
      storeTitle: store?.title || branding?.name || null,
      branding: branding
        ? {
            name: branding.name,
            logo: branding.logo,
            logoDark: branding.logoDark,
            primaryColor: branding.primaryColor,
            theme: branding.theme,
          }
        : null,
    };
  }

  async getCustomerPortal(token: string) {
    return this.buildCustomerDashboard(token);
  }

  listCustomers(adminId: string) {
    return this.customers.listForAdmin(adminId);
  }

  getCustomerDetail(adminId: string, customerId: string) {
    return this.customers.getDetail(adminId, customerId);
  }

  async updateCustomerServiceSubscription(
    adminId: string,
    role: string,
    customerId: string,
    clientId: string,
    input: {
      subId?: string;
      remark?: string;
      enable?: boolean;
      notifyTelegram?: boolean;
    },
  ) {
    const detail = await this.customers.getDetail(adminId, customerId);
    if (!detail) throw new NotFoundException('Customer not found');

    const service = (detail.services || []).find((s: { id: string }) => s.id === clientId);
    if (!service) {
      throw new BadRequestException('Service is not linked to this customer');
    }

    const nextSubId =
      input.subId !== undefined ? String(input.subId || '').trim() : undefined;
    const changedSub =
      nextSubId !== undefined && nextSubId !== (service.subId || '');

    await this.clientsService.update(clientId, adminId, role, {
      ...(nextSubId !== undefined ? { subId: nextSubId } : {}),
      ...(input.remark !== undefined ? { remark: input.remark } : {}),
      ...(input.enable !== undefined ? { enable: input.enable } : {}),
    });

    const updated = await this.prisma.client.findUnique({
      where: { id: clientId },
      select: {
        id: true,
        email: true,
        remark: true,
        subId: true,
        subToken: true,
        enable: true,
      },
    });

    const shouldNotify =
      !!input.notifyTelegram &&
      (changedSub || input.remark !== undefined) &&
      !!(detail as { telegramUserId?: string | null }).telegramUserId;

    if (shouldNotify && updated?.subId) {
      await this.customerNotifications.notifyCustomer(customerId, {
        type: 'subscription_updated',
        title: '🔗 لینک سابسکریپشن به‌روز شد / Subscription link updated',
        message:
          'ادمین لینک ساب شما را تغییر داد. از لینک جدید استفاده کنید. / Your admin updated the subscription link. Use the new link below.',
        payload: {
          kind: 'subscription_updated',
          subId: updated.subId,
          serviceName: updated.remark || updated.email,
          configName: updated.remark || updated.email,
          isRenewal: false,
        },
      });
    }

    return {
      service: updated,
      notified: shouldNotify,
      customer: {
        id: detail.id,
        name: detail.name,
        token: detail.token,
        telegramUserId: detail.telegramUserId || null,
      },
    };
  }
}
