import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  forwardRef,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { generateCustomerToken, generateReferralCode } from './store.types';
import { StoreReferralRewardService } from './store-referral-reward.service';
import {
  EYLAN_PROVIDER,
  PASARGUARD_PROVIDER,
  PANEL_3XUI_PROVIDER,
  eylanServiceId,
  pasarguardServiceId,
  isEylanProvider,
  isPasarguardProvider,
  parseEylanServiceId,
  parsePasarguardServiceId,
  parseFulfillment,
} from './providers/store-fulfillment.types';

type ServiceClientRow = {
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
  createdAt: Date;
};

const SERVICE_CLIENT_SELECT = {
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
  createdAt: true,
} satisfies Prisma.ClientSelect;

@Injectable()
export class StoreCustomerService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => StoreReferralRewardService))
    private referralRewards: StoreReferralRewardService,
  ) {}

  private getLinkedClientIds(metadata: unknown): string[] {
    const meta = (metadata || {}) as { linkedClientIds?: unknown };
    if (!Array.isArray(meta.linkedClientIds)) return [];
    return meta.linkedClientIds.filter(
      (id): id is string => typeof id === 'string' && !!id.trim(),
    );
  }

  private getClientCategories(metadata: unknown): Record<string, string> {
    const meta = (metadata || {}) as { clientCategories?: unknown };
    if (!meta.clientCategories || typeof meta.clientCategories !== 'object') return {};
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(meta.clientCategories as Record<string, unknown>)) {
      if (typeof k === 'string' && k && typeof v === 'string' && v) out[k] = v;
    }
    return out;
  }

  /** Newest fulfilled order wins; claimed metadata fills gaps. */
  private categoryIdByClientId(
    orders: Array<{
      id?: string;
      clientId: string | null;
      renewClientId?: string | null;
      createdAt?: Date;
      fulfillment?: unknown;
      product?: { categoryId?: string | null } | null;
    }>,
    metadata?: unknown,
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
      if (order.id && isEylanProvider(parseFulfillment(order.fulfillment)?.providerId)) {
        const sid = eylanServiceId(order.id);
        if (!map.has(sid)) map.set(sid, cat);
      }
      if (order.id && isPasarguardProvider(parseFulfillment(order.fulfillment)?.providerId)) {
        const sid = pasarguardServiceId(order.id);
        if (!map.has(sid)) map.set(sid, cat);
      }
    }
    const claimed = this.getClientCategories(metadata);
    for (const [clientId, categoryId] of Object.entries(claimed)) {
      if (clientId && categoryId && !map.has(clientId)) map.set(clientId, categoryId);
    }
    return map;
  }

  private collectServiceClientIds(
    orders: Array<{ clientId: string | null; renewClientId?: string | null }>,
    metadata?: unknown,
  ): string[] {
    const ids = new Set<string>();
    for (const order of orders) {
      if (order.clientId) ids.add(order.clientId);
      if (order.renewClientId) ids.add(order.renewClientId);
    }
    for (const id of this.getLinkedClientIds(metadata)) {
      if (!parseEylanServiceId(id) && !parsePasarguardServiceId(id)) ids.add(id);
    }
    return [...ids];
  }

  private serializeAdminEylanServices(
    orders: Array<{
      id: string;
      status: string;
      configName: string | null;
      fulfillment?: unknown;
    }>,
  ) {
    const seen = new Set<string>();
    const out: Array<Record<string, unknown>> = [];
    for (const order of orders) {
      if (order.status !== 'ACTIVE' && order.status !== 'RENEWED') continue;
      const ff = parseFulfillment(order.fulfillment);
      if (!isEylanProvider(ff?.providerId)) continue;
      const id = eylanServiceId(order.id);
      if (seen.has(id)) continue;
      seen.add(id);
      const username = ff?.username || String(order.configName || 'eylan');
      out.push({
        id,
        email: username,
        remark: username,
        subId: null,
        subToken: ff?.subToken || null,
        subUrl: ff?.subUrl || null,
        providerId: EYLAN_PROVIDER,
        enable: true,
        expiryTime: '0',
        total: '0',
        up: '0',
        down: '0',
        status: 'active',
        createdAt: new Date(0),
      });
    }
    return out;
  }

  private serializeAdminPasarguardServices(
    orders: Array<{
      id: string;
      status: string;
      configName: string | null;
      fulfillment?: unknown;
    }>,
  ) {
    const seen = new Set<string>();
    const out: Array<Record<string, unknown>> = [];
    for (const order of orders) {
      if (order.status !== 'ACTIVE' && order.status !== 'RENEWED') continue;
      const ff = parseFulfillment(order.fulfillment);
      if (!isPasarguardProvider(ff?.providerId)) continue;
      const id = pasarguardServiceId(order.id);
      if (seen.has(id)) continue;
      seen.add(id);
      const username = ff?.username || String(order.configName || 'vpn');
      out.push({
        id,
        email: username,
        remark: username,
        subId: null,
        subToken: null,
        subUrl: ff?.subUrl || null,
        providerId: PASARGUARD_PROVIDER,
        enable: true,
        expiryTime: '0',
        total: '0',
        up: '0',
        down: '0',
        status: 'active',
        createdAt: new Date(0),
      });
    }
    return out;
  }

  private serializeAdminService(s: ServiceClientRow) {
    const now = Date.now();
    const expiryMs = Number(s.expiryTime || 0);
    const total = Number(s.total || 0);
    const used = Number(s.up || 0) + Number(s.down || 0);
    const depleted = total > 0 && used >= total;
    const status = !s.enable
      ? 'disabled'
      : expiryMs > 0 && now >= expiryMs
        ? 'expired'
        : depleted
          ? 'depleted'
          : 'active';
    return {
      ...s,
      status,
      total: s.total.toString(),
      up: s.up.toString(),
      down: s.down.toString(),
      expiryTime: s.expiryTime.toString(),
    };
  }

  /**
   * Resolve all VPN clients belonging to a store customer:
   * order.client / renewClient, order FKs, metadata.linkedClientIds (claimed),
   * and email=configName fallback for ACTIVE orders whose FK was lost.
   */
  private async resolveAdminCustomerServices(
    adminId: string,
    customerId: string,
    orders: Array<{
      id: string;
      status: string;
      configName: string | null;
      clientId: string | null;
      renewClientId: string | null;
      fulfillment?: unknown;
      client: ServiceClientRow | null;
      renewClient: ServiceClientRow | null;
    }>,
    metadata: unknown,
  ) {
    const byId = new Map<string, ServiceClientRow>();

    for (const order of orders) {
      if (order.client) byId.set(order.client.id, order.client);
      if (order.renewClient) byId.set(order.renewClient.id, order.renewClient);
    }

    const knownIds = this.collectServiceClientIds(orders, metadata);
    const missingIds = knownIds.filter(
      (id) => !byId.has(id) && !parseEylanServiceId(id) && !parsePasarguardServiceId(id),
    );
    if (missingIds.length) {
      const found = await this.prisma.client.findMany({
        where: { id: { in: missingIds } },
        select: SERVICE_CLIENT_SELECT,
      });
      for (const row of found) byId.set(row.id, row);
    }

    // Heal ACTIVE/RENEWED orders that lost clientId but still have configName (= client email)
    const orphanOrders = orders.filter((order) => {
      if (order.status !== 'ACTIVE' && order.status !== 'RENEWED') return false;
      if (isEylanProvider(parseFulfillment(order.fulfillment)?.providerId)) return false;
      if (!order.configName || order.configName === 'renewal') return false;
      if (order.clientId && byId.has(order.clientId)) return false;
      if (order.renewClientId && byId.has(order.renewClientId)) return false;
      if (order.client || order.renewClient) return false;
      return true;
    });

    if (orphanOrders.length) {
      const emails = [
        ...new Set(
          orphanOrders
            .map((o) => String(o.configName || '').trim())
            .filter(Boolean),
        ),
      ];
      const byEmail = emails.length
        ? await this.prisma.client.findMany({
            where: {
              email: { in: emails },
              OR: [{ adminId }, { adminId: null }],
            },
            select: SERVICE_CLIENT_SELECT,
            orderBy: { createdAt: 'desc' },
          })
        : [];
      const emailMap = new Map<string, ServiceClientRow>();
      for (const row of byEmail) {
        if (!emailMap.has(row.email)) emailMap.set(row.email, row);
      }

      for (const order of orphanOrders) {
        const email = String(order.configName || '').trim();
        const match = emailMap.get(email);
        if (!match) continue;
        byId.set(match.id, match);
        // Re-attach / repair FK so future lookups work
        if (order.clientId !== match.id) {
          await this.prisma.storeOrder.update({
            where: { id: order.id },
            data: { clientId: match.id },
          });
          order.clientId = match.id;
        }
      }
    }

    // Keep linkedClientIds in sync: add discovered (orders/claimed/healed), drop dead IDs
    const linked = this.getLinkedClientIds(metadata);
    const nextLinked = [
      ...new Set([
        ...linked.filter(
          (id) => byId.has(id) || !!parseEylanServiceId(id) || !!parsePasarguardServiceId(id),
        ),
        ...byId.keys(),
      ]),
    ];
    const linkedChanged =
      nextLinked.length !== linked.length || nextLinked.some((id) => !linked.includes(id));
    if (linkedChanged) {
      const meta =
        metadata && typeof metadata === 'object'
          ? { ...(metadata as Record<string, unknown>) }
          : {};
      await this.prisma.storeCustomer.update({
        where: { id: customerId },
        data: {
          metadata: {
            ...meta,
            linkedClientIds: nextLinked,
          } as Prisma.InputJsonValue,
        },
      });
    }

    return [
      ...[...byId.values()]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((s) => ({ ...this.serializeAdminService(s), providerId: PANEL_3XUI_PROVIDER })),
      ...this.serializeAdminEylanServices(orders),
      ...this.serializeAdminPasarguardServices(orders),
    ];
  }

  async findOrCreate(
    adminId: string,
    data: {
      token?: string;
      name?: string;
      telegram?: string;
      whatsapp?: string;
      email?: string;
      referredById?: string;
    },
  ) {
    const emptyToNull = (v?: string | null) => {
      const s = String(v ?? '').trim();
      return s.length ? s : null;
    };
    const name = emptyToNull(data.name);
    const telegram = emptyToNull(data.telegram);
    const whatsapp = emptyToNull(data.whatsapp);
    const email = emptyToNull(data.email);

    if (data.token) {
      const existing = await this.prisma.storeCustomer.findUnique({
        where: { token: data.token },
      });
      if (existing) {
        if (existing.adminId !== adminId) return null;
        return this.prisma.storeCustomer.update({
          where: { id: existing.id },
          data: {
            name: name ?? existing.name,
            telegram: telegram ?? existing.telegram,
            whatsapp: whatsapp ?? existing.whatsapp,
            email: email ?? existing.email,
            lastSeenAt: new Date(),
          },
        });
      }
    }

    let token = generateCustomerToken();
    while (await this.prisma.storeCustomer.findUnique({ where: { token } })) {
      token = generateCustomerToken();
    }

    let referralCode = generateReferralCode();
    while (await this.prisma.storeCustomer.findUnique({ where: { referralCode } })) {
      referralCode = generateReferralCode();
    }

    try {
      return await this.prisma.storeCustomer.create({
        data: {
          adminId,
          token,
          referralCode,
          name,
          telegram,
          whatsapp,
          email,
          lastSeenAt: new Date(),
          ...(data.referredById ? { referredById: data.referredById } : {}),
        },
      });
    } catch (err: any) {
      // Unique (adminId, telegramUserId) can collide if empty-string rows exist
      // from older builds — never write empty telegramUserId; retry once with fresh codes.
      const code = String(err?.code || '');
      if (code === 'P2002') {
        token = generateCustomerToken();
        referralCode = generateReferralCode();
        return this.prisma.storeCustomer.create({
          data: {
            adminId,
            token,
            referralCode,
            name,
            telegram,
            whatsapp,
            email,
            lastSeenAt: new Date(),
            ...(data.referredById ? { referredById: data.referredById } : {}),
          },
        });
      }
      throw err;
    }
  }

  async ensureReferralCode(customerId: string) {
    const c = await this.prisma.storeCustomer.findUnique({ where: { id: customerId } });
    if (!c) return null;
    if (c.referralCode) return c.referralCode;
    let referralCode = generateReferralCode();
    while (await this.prisma.storeCustomer.findUnique({ where: { referralCode } })) {
      referralCode = generateReferralCode();
    }
    await this.prisma.storeCustomer.update({
      where: { id: customerId },
      data: { referralCode },
    });
    return referralCode;
  }

  async attachReferrer(customerId: string, referralCode: string) {
    const code = String(referralCode || '').trim().toUpperCase();
    if (!code) return null;
    const customer = await this.prisma.storeCustomer.findUnique({ where: { id: customerId } });
    if (!customer || customer.referredById) return customer;
    const referrer = await this.prisma.storeCustomer.findFirst({
      where: { adminId: customer.adminId, referralCode: code },
    });
    if (!referrer || referrer.id === customerId) return customer;
    const updated = await this.prisma.storeCustomer.update({
      where: { id: customerId },
      data: { referredById: referrer.id },
    });
    void this.referralRewards.evaluateForCustomer(customerId, 'join');
    return updated;
  }

  async getReferralStats(customerId: string) {
    const code = await this.ensureReferralCode(customerId);
    const referrals = await this.prisma.storeCustomer.findMany({
      where: { referredById: customerId },
      select: {
        id: true,
        token: true,
        name: true,
        telegram: true,
        createdAt: true,
        _count: { select: { orders: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const referralIds = referrals.map((r) => r.id);
    const sales = referralIds.length
      ? await this.prisma.storeOrder.aggregate({
          where: {
            customerId: { in: referralIds },
            status: { in: ['ACTIVE', 'RENEWED'] },
          },
          _sum: { amount: true },
          _count: true,
        })
      : { _sum: { amount: 0 }, _count: 0 };
    return {
      referralCode: code,
      count: referrals.length,
      referrals,
      attributedOrders: sales._count,
      attributedRevenue: sales._sum.amount || 0,
    };
  }

  async lookupByStore(slug: string, token: string) {
    const store = await this.prisma.storeProfile.findUnique({
      where: { slug },
      select: { adminId: true, enabled: true },
    });
    if (!store?.enabled) return null;

    const customer = await this.prisma.storeCustomer.findUnique({
      where: { token },
      select: {
        id: true,
        adminId: true,
        token: true,
        name: true,
        telegram: true,
        whatsapp: true,
        email: true,
      },
    });
    if (!customer || customer.adminId !== store.adminId) return null;
    return customer;
  }

  async getByToken(token: string) {
    return this.prisma.storeCustomer.findUnique({
      where: { token },
      include: {
        notifications: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
        activities: {
          orderBy: { createdAt: 'desc' },
          take: 30,
        },
        orders: {
          include: {
            product: {
              include: {
                category: true,
                profile: { select: { providerId: true } },
              },
            },
            payment: true,
            timeline: { orderBy: { createdAt: 'asc' } },
            client: {
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
            },
            renewClient: {
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
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  }

  async listForAdmin(
    adminId: string,
    filters?: {
      segment?: 'all' | 'new' | 'with_service' | 'without_service' | 'telegram_only';
      search?: string;
    },
  ) {
    const customers = await this.prisma.storeCustomer.findMany({
      where: { adminId },
      include: {
        _count: { select: { referrals: true } },
        wallet: { select: { balance: true, currency: true } },
        orders: {
          select: {
            id: true,
            amount: true,
            status: true,
            createdAt: true,
            configName: true,
            clientId: true,
            renewClientId: true,
            fulfillment: true,
            client: { select: { id: true, enable: true, expiryTime: true, email: true } },
            renewClient: { select: { id: true, enable: true, expiryTime: true, email: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const now = Date.now();
    const weekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);

    // Batch-load clients referenced by orders + claimed linkedClientIds
    const allLinkedIds = new Set<string>();
    const orphanEmails = new Set<string>();
    for (const c of customers) {
      for (const id of this.getLinkedClientIds(c.metadata)) {
        if (!parseEylanServiceId(id) && !parsePasarguardServiceId(id)) allLinkedIds.add(id);
      }
      for (const o of c.orders) {
        if (o.clientId) allLinkedIds.add(o.clientId);
        if (o.renewClientId) allLinkedIds.add(o.renewClientId);
        const fulfilled = o.status === 'ACTIVE' || o.status === 'RENEWED';
        const hasLiveClient = !!(o.client?.id || o.renewClient?.id);
        const email = String(o.configName || '').trim();
        if (isEylanProvider(parseFulfillment((o as { fulfillment?: unknown }).fulfillment)?.providerId)) {
          continue;
        }
        if (fulfilled && email && email !== 'renewal' && !hasLiveClient) {
          orphanEmails.add(email);
        }
      }
    }

    const existingClients = new Map<
      string,
      { id: string; enable: boolean; expiryTime: bigint; email?: string }
    >();
    if (allLinkedIds.size) {
      const existing = await this.prisma.client.findMany({
        where: { id: { in: [...allLinkedIds] } },
        select: { id: true, enable: true, expiryTime: true, email: true },
      });
      for (const row of existing) existingClients.set(row.id, row);
    }

    // Resolve ACTIVE/RENEWED orders whose client FK was lost (same as getDetail)
    const clientsByEmail = new Map<
      string,
      { id: string; enable: boolean; expiryTime: bigint; email: string }
    >();
    if (orphanEmails.size) {
      const byEmail = await this.prisma.client.findMany({
        where: {
          email: { in: [...orphanEmails] },
          OR: [{ adminId }, { adminId: null }],
        },
        select: { id: true, enable: true, expiryTime: true, email: true },
        orderBy: { createdAt: 'desc' },
      });
      for (const row of byEmail) {
        if (!clientsByEmail.has(row.email)) clientsByEmail.set(row.email, row);
        existingClients.set(row.id, row);
      }
    }

    const rows = customers.map((c) => {
      const paidOrders = c.orders.filter(
        (o) => o.status === 'ACTIVE' || o.status === 'RENEWED',
      );
      const revenue = paidOrders.reduce((sum, o) => sum + (Number(o.amount) || 0), 0);
      const candidateIds = this.collectServiceClientIds(c.orders, c.metadata);
      const serviceIdSet = new Set<string>();
      for (const id of candidateIds) {
        if (existingClients.has(id)) serviceIdSet.add(id);
      }
      for (const o of c.orders) {
        if (o.client?.id) serviceIdSet.add(o.client.id);
        if (o.renewClient?.id) serviceIdSet.add(o.renewClient.id);
        if (
          (o.status === 'ACTIVE' || o.status === 'RENEWED') &&
          isEylanProvider(parseFulfillment((o as { fulfillment?: unknown }).fulfillment)?.providerId)
        ) {
          serviceIdSet.add(eylanServiceId(o.id));
          continue;
        }
        if (
          (o.status === 'ACTIVE' || o.status === 'RENEWED') &&
          isPasarguardProvider(parseFulfillment((o as { fulfillment?: unknown }).fulfillment)?.providerId)
        ) {
          serviceIdSet.add(pasarguardServiceId(o.id));
          continue;
        }
        if (
          (o.status === 'ACTIVE' || o.status === 'RENEWED') &&
          o.configName &&
          o.configName !== 'renewal'
        ) {
          const viaEmail = clientsByEmail.get(String(o.configName).trim());
          if (viaEmail) serviceIdSet.add(viaEmail.id);
        }
      }

      const hasActiveService = [...serviceIdSet].some((id) => {
        if (parseEylanServiceId(id) || parsePasarguardServiceId(id)) return true;
        const fromOrder = c.orders.find(
          (o) => o.client?.id === id || o.renewClient?.id === id,
        );
        const client =
          fromOrder?.client?.id === id
            ? fromOrder.client
            : fromOrder?.renewClient?.id === id
              ? fromOrder.renewClient
              : existingClients.get(id);
        if (!client) return false;
        if (!client.enable) return false;
        const expiry = Number(client.expiryTime || 0);
        // 0 = unlimited time — still counts as active
        return expiry === 0 || expiry > now;
      });
      const lastPurchase = paidOrders[0]?.createdAt ?? null;
      const isNew =
        c.createdAt >= weekAgo &&
        paidOrders.length === 0 &&
        !!c.telegramUserId;
      return {
        id: c.id,
        token: c.token,
        name: c.name,
        status: c.status || 'active',
        telegram: c.telegram,
        telegramUserId: c.telegramUserId,
        telegramUsername: c.telegramUsername,
        whatsapp: c.whatsapp,
        email: c.email,
        referralCode: c.referralCode,
        referralCount: (c as any)._count?.referrals ?? 0,
        orderCount: c.orders.length,
        paidOrderCount: paidOrders.length,
        serviceCount: serviceIdSet.size,
        hasActiveService,
        revenue,
        walletBalance: Number(c.wallet?.balance ?? 0),
        walletCurrency: c.wallet?.currency ?? null,
        lastPurchase,
        lastSeenAt: c.lastSeenAt,
        createdAt: c.createdAt,
        isNew,
      };
    });

    let filtered = rows;
    const segment = filters?.segment || 'all';
    if (segment === 'new') filtered = filtered.filter((r) => r.isNew);
    else if (segment === 'with_service') filtered = filtered.filter((r) => r.hasActiveService);
    else if (segment === 'without_service')
      filtered = filtered.filter((r) => !!r.telegramUserId && !r.hasActiveService);
    else if (segment === 'telegram_only')
      filtered = filtered.filter((r) => !!r.telegramUserId);

    const q = String(filters?.search || '')
      .trim()
      .toLowerCase();
    if (q) {
      filtered = filtered.filter((r) => {
        const hay = [
          r.name,
          r.token,
          r.telegram,
          r.telegramUserId,
          r.telegramUsername,
          r.email,
          r.whatsapp,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
    }

    return filtered;
  }

  /** Block / restrict / re-enable a customer. Blocked: bot ignores them.
   *  Restricted: bot + storefront work, but receipts never auto-approve. */
  async setCustomerStatus(
    adminId: string,
    customerId: string,
    status: string,
  ) {
    const normalized = String(status || '').trim().toLowerCase();
    if (!['active', 'blocked', 'restricted'].includes(normalized)) {
      throw new BadRequestException('Invalid status — use active, blocked or restricted');
    }
    const existing = await this.prisma.storeCustomer.findFirst({
      where: { id: customerId, adminId },
      select: { id: true },
    });
    if (!existing) throw new NotFoundException('Customer not found');
    const updated = await this.prisma.storeCustomer.update({
      where: { id: customerId },
      data: { status: normalized },
    });
    return {
      id: updated.id,
      status: updated.status,
      name: updated.name,
      telegramUserId: updated.telegramUserId,
    };
  }

  async getDetail(adminId: string, customerId: string) {
    const customer = await this.prisma.storeCustomer.findFirst({
      where: { id: customerId, adminId },
      include: {
        orders: {
          include: {
            product: true,
            payment: true,
            timeline: { orderBy: { createdAt: 'asc' } },
            client: { select: SERVICE_CLIENT_SELECT },
            renewClient: { select: SERVICE_CLIENT_SELECT },
          },
          orderBy: { createdAt: 'desc' },
        },
        wallet: true,
        walletDeposits: {
          orderBy: { createdAt: 'desc' },
          take: 20,
        },
      },
    });
    if (!customer) return null;

    const services = await this.resolveAdminCustomerServices(
      adminId,
      customer.id,
      customer.orders,
      customer.metadata,
    );

    const categoryByClient = this.categoryIdByClientId(customer.orders, customer.metadata);
    const categoryIds = [...new Set([...categoryByClient.values()])];
    const categoryNameById = new Map<string, string>();
    if (categoryIds.length) {
      const cats = await this.prisma.productCategory.findMany({
        where: { adminId, id: { in: categoryIds } },
        select: { id: true, name: true },
      });
      for (const cat of cats) categoryNameById.set(cat.id, cat.name);
    }
    const servicesWithCategory = services.map((service) => {
      const categoryId = categoryByClient.get(String(service.id)) || null;
      return {
        ...service,
        categoryId,
        categoryName: categoryId ? categoryNameById.get(categoryId) || null : null,
      };
    });

    const ledger = customer.wallet
      ? await this.prisma.storeWalletLedger.findMany({
          where: { accountId: customer.wallet.id },
          orderBy: { createdAt: 'desc' },
          take: 30,
        })
      : [];

    return {
      ...customer,
      services: servicesWithCategory,
      referral: await this.getReferralStats(customer.id),
      walletBalance: customer.wallet?.balance ?? 0,
      walletCurrency: customer.wallet?.currency ?? null,
      walletLedger: ledger,
    };
  }
}
