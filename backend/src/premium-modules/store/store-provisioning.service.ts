import { Inject, Injectable, BadRequestException, Logger, forwardRef } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientsService } from '../../clients/clients.service';
import { PanelsService } from '../../panels/panels.service';
import { FeatureManagerService } from '../../platform/feature-manager.service';
import { EylanFulfillmentProvider } from './providers/eylan/eylan.provider';
import { PasarguardFulfillmentProvider } from './providers/pasarguard/pasarguard.provider';
import {
  isEylanProvider,
  isPasarguardProvider,
  parsePanel3xuiSettings,
  profileLooksLikeEylan,
  profileLooksLikePasarguard,
} from './providers/store-fulfillment.types';
import { buildOnHoldExpiry3xUi } from './providers/activation-policy.util';

@Injectable()
export class StoreProvisioningService {
  private readonly logger = new Logger(StoreProvisioningService.name);

  private checkoutMeta(order: { fulfillment?: Prisma.JsonValue | null }): {
    finalDurationDays?: number;
    finalLimitIp?: number;
  } {
    const ff =
      order.fulfillment && typeof order.fulfillment === 'object'
        ? (order.fulfillment as Record<string, unknown>)
        : {};
    const checkout =
      ff.checkout && typeof ff.checkout === 'object'
        ? (ff.checkout as Record<string, unknown>)
        : {};
    return {
      finalDurationDays: Number(checkout.finalDurationDays || 0) || undefined,
      finalLimitIp: Number(checkout.finalLimitIp || 0) || undefined,
    };
  }

  constructor(
    private prisma: PrismaService,
    private clientsService: ClientsService,
    private panelsService: PanelsService,
    @Inject(forwardRef(() => EylanFulfillmentProvider))
    private eylan: EylanFulfillmentProvider,
    @Inject(forwardRef(() => PasarguardFulfillmentProvider))
    private pasarguard: PasarguardFulfillmentProvider,
    private features: FeatureManagerService,
  ) {}

  private async assertExternalFulfillment() {
    if (!(await this.features.canWrite('external-panels'))) {
      throw new BadRequestException(
        'Premium unavailable — external panel fulfillment is frozen. Existing orders are preserved.',
      );
    }
  }

  /** Stem for readable names: "Jack_01" / "jack1" → "jack", "@Ali" → "ali". */
  private friendlyStem(baseName: string): string {
    let name = String(baseName || 'user')
      .trim()
      .replace(/^@+/, '')
      .replace(/\s+/g, '')
      .replace(/[^A-Za-z0-9_]/g, '');
    name = name.replace(/\d+$/g, '');
    name = name.slice(0, 20).toLowerCase();
    if (!name || !/^[a-z]/.test(name)) name = 'user';
    return name;
  }

  private normalizeBaseName(baseName: string): string {
    // Keep for remark / legacy callers — prefer friendlyStem for uniqueness.
    return this.friendlyStem(baseName);
  }

  /** Already looks like an allocated friendly or legacy unique name. */
  private hasAllocatedSuffix(name: string): boolean {
    const n = name.trim();
    return /-\d{4}$/.test(n) || /^[A-Za-z][A-Za-z0-9_]{0,20}\d{1,4}$/.test(n);
  }

  private hasFourDigitSuffix(name: string): boolean {
    return this.hasAllocatedSuffix(name);
  }

  private isNameCollision(message: string): boolean {
    const lower = message.toLowerCase();
    return (
      lower.includes('already exists') ||
      lower.includes('already in use') ||
      lower.includes('duplicate')
    );
  }

  private isStrictVerificationFailure(message: string): boolean {
    const lower = String(message || '').toLowerCase();
    return (
      lower.includes('strict provisioning verification failed') ||
      lower.includes('panel did not confirm existence') ||
      lower.includes('missing inboundids')
    );
  }

  private async recoverClientAfterStrictFailure(input: {
    panelId: string;
    email: string;
    adminId: string;
    inboundIds: string[];
  }) {
    const targetInboundIds = [...input.inboundIds].sort();
    for (let i = 0; i < 3; i++) {
      await this.panelsService.sync(input.panelId).catch(() => {});
      const found = await this.prisma.client.findFirst({
        where: {
          panelId: input.panelId,
          email: input.email,
          OR: [{ adminId: input.adminId }, { adminId: null }],
        },
        include: {
          inbounds: {
            select: { inboundId: true },
          },
        },
      });
      if (!found) {
        continue;
      }
      const foundInboundIds = found.inbounds.map((x) => x.inboundId).sort();
      const inboundsMatch =
        foundInboundIds.length === targetInboundIds.length &&
        foundInboundIds.every((id, idx) => id === targetInboundIds[idx]);
      if (!inboundsMatch) {
        continue;
      }
      if (!found.adminId || found.adminId !== input.adminId) {
        await this.prisma.client.update({
          where: { id: found.id },
          data: { adminId: input.adminId },
        });
      }
      return found.id;
    }
    return null;
  }

  private async isConfigNameTaken(candidate: string, adminId: string): Promise<boolean> {
    const [client, order] = await Promise.all([
      this.prisma.client.findFirst({
        where: {
          OR: [{ adminId, email: candidate }, { email: candidate }],
        },
        select: { id: true },
      }),
      this.prisma.storeOrder.findFirst({
        where: { store: { adminId }, configName: candidate },
        select: { id: true },
      }),
    ]);
    return !!(client || order);
  }

  /**
   * Readable unique names: jack1, jack2, … (not tg-mstrznv5).
   * Used for Telegram bot and store checkout.
   */
  async generateUniqueConfigName(baseName: string, adminId: string): Promise<string> {
    const stem = this.friendlyStem(baseName);
    for (let n = 1; n <= 9999; n++) {
      const candidate = `${stem}${n}`;
      if (!(await this.isConfigNameTaken(candidate, adminId))) return candidate;
    }
    return `${stem}${Date.now().toString().slice(-4)}`;
  }

  async resolveRenewClient(adminId: string, renewClientId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: renewClientId, adminId },
    });
    if (!client) throw new BadRequestException('Service not found for renewal');
    return client;
  }

  async resolveRenewClientByToken(adminId: string, tokenOrUrl: string) {
    const token = this.extractSubscriptionToken(tokenOrUrl);
    if (!token) throw new BadRequestException('Invalid subscription link or token');

    // Match by subId / subToken first (3x-ui /sub/{subId} and panel /s/{token}).
    // Do NOT require adminId in the DB query — synced clients are often orphaned (adminId null).
    let candidates = await this.prisma.client.findMany({
      where: {
        OR: [
          { subId: token },
          { subToken: token },
          { email: token },
          { id: token },
          { uuid: token },
        ],
      },
      take: 20,
    });

    if (!candidates.length) {
      // Case-insensitive fallback for subId / email
      candidates = await this.prisma.client.findMany({
        where: {
          OR: [
            { subId: { equals: token, mode: 'insensitive' } },
            { email: { equals: token, mode: 'insensitive' } },
          ],
        },
        take: 20,
      });
    }

    if (!candidates.length) {
      throw new BadRequestException(
        'Subscription not found in this panel / این لینک ساب در لیست کلاینت‌های فروشگاه پیدا نشد',
      );
    }

    const owned = await this.pickClientOwnedByAdmin(adminId, candidates);
    if (!owned) {
      throw new BadRequestException(
        'This subscription was not found under your store account / این ساب متعلق به این فروشگاه نیست',
      );
    }
    return owned;
  }

  /** Pull subId/token from /s/, /sub/, or trailing URL path (incl. native 3x-ui / Sanaei). */
  private extractSubscriptionToken(tokenOrUrl: string): string {
    let token = String(tokenOrUrl || '').trim();
    const pathPatterns = [
      /\/s\/([^/?#]+)/i,
      /\/sub\/([^/?#]+)/i,
      /\/subscribe\/([^/?#]+)/i,
      /\/api\/v1\/client\/subscribe\/([^/?#]+)/i,
    ];
    for (const re of pathPatterns) {
      const match = token.match(re);
      if (match?.[1]) {
        token = decodeURIComponent(match[1]).trim();
        break;
      }
    }
    if (/^https?:\/\//i.test(token)) {
      try {
        const u = new URL(token);
        // Query helpers used by some panel links
        const q =
          u.searchParams.get('token') ||
          u.searchParams.get('subId') ||
          u.searchParams.get('sub') ||
          '';
        if (q.trim()) {
          token = decodeURIComponent(q.trim());
        } else {
          const segments = u.pathname.split('/').filter(Boolean);
          const last = segments[segments.length - 1];
          if (last) token = decodeURIComponent(last).trim();
        }
      } catch {
        /* keep */
      }
    }
    return token.replace(/^[@#]/, '').trim();
  }

  /**
   * Prefer clients this store admin owns; allow orphaned clients on panels in their scope.
   */
  private async pickClientOwnedByAdmin(
    adminId: string,
    candidates: Array<{
      id: string;
      adminId: string | null;
      panelId: string;
      subId: string | null;
      subToken: string | null;
      email: string;
      uuid: string;
      [key: string]: unknown;
    }>,
  ) {
    const direct = candidates.find((c) => c.adminId === adminId);
    if (direct) return direct;

    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
      select: { role: true },
    });
    const isSuper = admin?.role === 'SUPER_ADMIN';
    if (isSuper) return candidates[0] || null;

    const accessibleInbounds = await this.prisma.inbound.findMany({
      where: { adminAccess: { some: { adminId } } },
      select: { panelId: true },
    });
    // Also include panels referenced by this admin's provisioning profiles / products
    const profilePanels = await this.prisma.provisioningProfile.findMany({
      where: { adminId },
      select: { panelId: true },
    });
    const panelIds = new Set([
      ...accessibleInbounds.map((p) => p.panelId),
      ...profilePanels.map((p) => p.panelId),
    ]);

    // Orphan (or same-admin) clients sitting on this seller's panels
    const scoped = candidates.find(
      (c) =>
        (!c.adminId || c.adminId === adminId) && panelIds.has(c.panelId),
    );
    if (scoped) return scoped;

    return null;
  }

  private async ensurePanelSynced(panelId: string, inboundIds: string[]) {
    const inbounds = await this.prisma.inbound.findMany({
      where: { id: { in: inboundIds } },
      select: { id: true, panelInboundId: true },
    });
    const needsSync = inbounds.some((item) => item.panelInboundId == null);
    if (!needsSync) return;

    this.logger.warn(`Store provisioning: syncing panel ${panelId} before client create`);
    await this.panelsService.sync(panelId);

    const refreshed = await this.prisma.inbound.findMany({
      where: { id: { in: inboundIds } },
      select: { id: true, panelInboundId: true },
    });
    const stillMissing = refreshed.filter((item) => item.panelInboundId == null);
    if (stillMissing.length) {
      throw new BadRequestException(
        `Panel sync required before creating clients. The following inbounds have not been synced yet: ${stillMissing
          .map((item) => item.id)
          .join(', ')}. Please trigger a panel sync and retry.`,
      );
    }
  }

  async provisionNewOrder(
    orderId: string,
    adminId: string,
    role: string,
  ): Promise<{ clientId: string | null }> {
    const order = await this.prisma.storeOrder.findUnique({
      where: { id: orderId },
      include: {
        product: { include: { profile: true, category: true } },
      },
    });
    if (!order) throw new BadRequestException('Order not found');
    if (order.isRenewal) throw new BadRequestException('Use renew provisioning for renewal orders');

    if (!order.product) throw new BadRequestException('Order product is missing');

    const profile = order.product.profile;
    if (profileLooksLikeEylan(profile)) {
      await this.assertExternalFulfillment();
      const result = await this.eylan.provision({ orderId, adminId, role });
      await this.prisma.storeOrder.update({
        where: { id: orderId },
        data: {
          clientId: null,
          configName: result.configName,
          provisionError: null,
          fulfillment: (result.fulfillment || null) as Prisma.InputJsonValue,
        },
      });
      return { clientId: null };
    }

    if (profileLooksLikePasarguard(profile)) {
      await this.assertExternalFulfillment();
      const result = await this.pasarguard.provision({ orderId, adminId, role });
      await this.prisma.storeOrder.update({
        where: { id: orderId },
        data: {
          clientId: null,
          configName: result.configName,
          provisionError: null,
          fulfillment: (result.fulfillment || null) as Prisma.InputJsonValue,
        },
      });
      return { clientId: null };
    }

    if (!profile) {
      throw new BadRequestException(
        'Product has no provisioning profile / برای این محصول پروفایل ساخت سرویس تنظیم نشده',
      );
    }
    const inboundIds = Array.isArray(profile.inboundIds)
      ? (profile.inboundIds as string[])
      : [];
    if (!inboundIds.length) throw new BadRequestException('Provisioning profile has no inbounds');
    if (!profile.panelId) throw new BadRequestException('Provisioning profile has no panel');

    // 3x-ui fulfill uses ClientsService.create, which calls ProvisioningEngine when adapter_xui_v1 is on.

    await this.ensurePanelSynced(profile.panelId, inboundIds);

    const checkout = this.checkoutMeta(order);
    const totalBytes = Number(order.product.traffic);
    const effectiveDays = Math.max(0, Number(checkout.finalDurationDays || order.product.durationDays || 0));
    // On-hold: timer starts after first connection
    const expiryTime = buildOnHoldExpiry3xUi(effectiveDays);
    const remarkBase = this.normalizeBaseName(order.configName || 'user');
    const panel3xSettings = parsePanel3xuiSettings(profile.settings);

    let lastError: Error | null = null;
    const candidatesTried = new Set<string>();

    for (let attempt = 0; attempt < 8; attempt++) {
      // Only reuse stored configName if it already has a 4-digit suffix (never bare names like "test")
      const email =
        attempt === 0 && order.configName && this.hasFourDigitSuffix(order.configName)
          ? order.configName
          : await this.generateUniqueConfigName(order.configName || 'user', adminId);

      if (candidatesTried.has(email)) continue;
      candidatesTried.add(email);

      try {
        const client = await this.clientsService.create(adminId, {
          email,
          inboundIds,
          remark: remarkBase,
          total: totalBytes,
          expiryTime,
          adminId,
          limitIp: Number(checkout.finalLimitIp || order.limitIp || 0) || 0,
          trafficReset: panel3xSettings.trafficReset,
          trafficResetDay: panel3xSettings.trafficResetDay,
          reset: panel3xSettings.reset,
          resetMax: panel3xSettings.resetMax,
        });

        const existingFf =
          order.fulfillment && typeof order.fulfillment === 'object'
            ? (order.fulfillment as Record<string, unknown>)
            : {};
        const subToken = String(
          (client as { subId?: string | null; subToken?: string | null }).subId ||
            (client as { subToken?: string | null }).subToken ||
            '',
        ).trim();
        await this.prisma.storeOrder.update({
          where: { id: orderId },
          data: {
            clientId: client.id,
            configName: email,
            provisionError: null,
            fulfillment: {
              ...existingFf,
              providerId: existingFf.providerId || 'panel_3xui',
              ...(subToken
                ? { subToken, subUrl: `/s/${encodeURIComponent(subToken)}` }
                : {}),
            } as Prisma.InputJsonValue,
          },
        });

        this.logger.log(`Provisioned order ${order.trackingCode} → client ${client.id} (${email})`);
        return { clientId: client.id };
      } catch (err: any) {
        lastError = err;
        const message = String(err?.message || err?.response?.message || '');
        if (this.isNameCollision(message)) {
          this.logger.warn(
            `Store provision collision for ${order.trackingCode} with ${email}; retrying`,
          );
          continue;
        }
        if (this.isStrictVerificationFailure(message) && profile?.panelId) {
          const recoveredClientId = await this.recoverClientAfterStrictFailure({
            panelId: profile.panelId,
            email,
            adminId,
            inboundIds,
          });
          if (recoveredClientId) {
            const recovered = await this.prisma.client.findUnique({
              where: { id: recoveredClientId },
              select: { subId: true, subToken: true },
            });
            const existingFf =
              order.fulfillment && typeof order.fulfillment === 'object'
                ? (order.fulfillment as Record<string, unknown>)
                : {};
            const subToken = String(recovered?.subId || recovered?.subToken || '').trim();
            await this.prisma.storeOrder.update({
              where: { id: orderId },
              data: {
                clientId: recoveredClientId,
                configName: email,
                provisionError: null,
                fulfillment: {
                  ...existingFf,
                  providerId: existingFf.providerId || 'panel_3xui',
                  ...(subToken
                    ? { subToken, subUrl: `/s/${encodeURIComponent(subToken)}` }
                    : {}),
                } as Prisma.InputJsonValue,
              },
            });
            this.logger.warn(
              `Recovered store order ${order.trackingCode} after strict verify failure → client ${recoveredClientId} (${email})`,
            );
            return { clientId: recoveredClientId };
          }
        }
        throw err;
      }
    }

    throw lastError || new BadRequestException('Could not provision a unique client name');
  }

  async provisionRenewalOrder(
    orderId: string,
    adminId: string,
    role: string,
  ): Promise<{ clientId: string | null }> {
    const order = await this.prisma.storeOrder.findUnique({
      where: { id: orderId },
      include: { product: { include: { profile: true } } },
    });
    if (!order) throw new BadRequestException('Order not found');
    if (!order.isRenewal) {
      throw new BadRequestException('Not a renewal order');
    }
    if (!order.product) throw new BadRequestException('Order product is missing');

    const fulfillmentProvider =
      order.fulfillment && typeof order.fulfillment === 'object'
        ? (order.fulfillment as { providerId?: string }).providerId
        : null;
    if (profileLooksLikeEylan(order.product.profile) || isEylanProvider(fulfillmentProvider)) {
      await this.assertExternalFulfillment();
      const result = await this.eylan.renew({ orderId, adminId, role });
      await this.prisma.storeOrder.update({
        where: { id: orderId },
        data: {
          clientId: null,
          configName: result.configName,
          provisionError: null,
          fulfillment: (result.fulfillment || null) as Prisma.InputJsonValue,
        },
      });
      return { clientId: null };
    }

    if (
      profileLooksLikePasarguard(order.product.profile) ||
      isPasarguardProvider(fulfillmentProvider)
    ) {
      await this.assertExternalFulfillment();
      const result = await this.pasarguard.renew({ orderId, adminId, role });
      await this.prisma.storeOrder.update({
        where: { id: orderId },
        data: {
          clientId: null,
          configName: result.configName,
          provisionError: null,
          fulfillment: (result.fulfillment || null) as Prisma.InputJsonValue,
        },
      });
      return { clientId: null };
    }

    if (!order.renewClientId) {
      throw new BadRequestException('Not a renewal order');
    }

    const existing = await this.resolveRenewClient(adminId, order.renewClientId);
    const checkout = this.checkoutMeta(order);
    const addTraffic = Number(order.product.traffic);
    const addDays = Number(checkout.finalDurationDays || order.product.durationDays || 0);

    // Additive renew: keep used traffic (up/down) untouched; only ADD volume + extend expiry.
    const newTotal =
      existing.total === 0n
        ? 0n // already unlimited — stay unlimited
        : existing.total + BigInt(addTraffic);

    let newExpiry = existing.expiryTime;
    if (addDays > 0) {
      const base =
        existing.expiryTime > BigInt(Date.now())
          ? Number(existing.expiryTime)
          : Date.now();
      newExpiry = BigInt(base + addDays * 86400000);
    }

    await this.clientsService.update(existing.id, adminId, role, {
      total: Number(newTotal),
      expiryTime: Number(newExpiry),
      enable: true,
      // do NOT reset up/down — remaining quota = newTotal - used
    });

    await this.prisma.storeOrder.update({
      where: { id: orderId },
      data: { clientId: existing.id, provisionError: null },
    });

    this.logger.log(`Renewed order ${order.trackingCode} → client ${existing.id}`);
    return { clientId: existing.id };
  }

  async provisionOrder(orderId: string, adminId: string, role: string) {
    const order = await this.prisma.storeOrder.findUnique({ where: { id: orderId } });
    if (!order) throw new BadRequestException('Order not found');

    if (order.isRenewal) {
      return this.provisionRenewalOrder(orderId, adminId, role);
    }
    return this.provisionNewOrder(orderId, adminId, role);
  }
}
