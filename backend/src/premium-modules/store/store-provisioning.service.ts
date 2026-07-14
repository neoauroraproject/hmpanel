import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientsService } from '../../clients/clients.service';
import { PanelsService } from '../../panels/panels.service';

@Injectable()
export class StoreProvisioningService {
  private readonly logger = new Logger(StoreProvisioningService.name);

  constructor(
    private prisma: PrismaService,
    private clientsService: ClientsService,
    private panelsService: PanelsService,
  ) {}

  private random4(): string {
    return String(Math.floor(1000 + Math.random() * 9000));
  }

  private normalizeBaseName(baseName: string): string {
    let name = (baseName || 'user').trim().replace(/\s+/g, '-').replace(/-+/g, '-');
    // strip any trailing numeric suffixes so we always regenerate fresh unique endings
    name = name.replace(/(-\d{4})+$/g, '');
    name = name.slice(0, 28);
    if (!name) name = 'user';
    return name;
  }

  private hasFourDigitSuffix(name: string): boolean {
    return /-\d{4}$/.test(name.trim());
  }

  private isNameCollision(message: string): boolean {
    const lower = message.toLowerCase();
    return (
      lower.includes('already exists') ||
      lower.includes('already in use') ||
      lower.includes('duplicate')
    );
  }

  async generateUniqueConfigName(baseName: string, adminId: string): Promise<string> {
    const name = this.normalizeBaseName(baseName);

    for (let attempts = 0; attempts < 40; attempts++) {
      const candidate = `${name}-${this.random4()}`;
      const exists = await this.prisma.client.findFirst({
        where: {
          OR: [
            { adminId, email: candidate },
            { email: candidate },
          ],
        },
        select: { id: true },
      });
      if (!exists) return candidate;
    }

    return `${name}-${Date.now().toString().slice(-4)}`;
  }

  async resolveRenewClient(adminId: string, renewClientId: string) {
    const client = await this.prisma.client.findFirst({
      where: { id: renewClientId, adminId },
    });
    if (!client) throw new BadRequestException('Service not found for renewal');
    return client;
  }

  async resolveRenewClientByToken(adminId: string, tokenOrUrl: string) {
    let token = tokenOrUrl.trim();
    const urlMatch = token.match(/\/s\/([^/?#]+)/);
    if (urlMatch) token = urlMatch[1];

    const client = await this.prisma.client.findFirst({
      where: {
        adminId,
        OR: [
          { subToken: token },
          { subId: token },
          { email: token },
          { id: token },
          { uuid: token },
        ],
      },
    });
    if (!client) throw new BadRequestException('Invalid subscription link or token');
    return client;
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
  ): Promise<{ clientId: string }> {
    const order = await this.prisma.storeOrder.findUnique({
      where: { id: orderId },
      include: {
        product: { include: { profile: true, category: true } },
      },
    });
    if (!order) throw new BadRequestException('Order not found');
    if (order.isRenewal) throw new BadRequestException('Use renew provisioning for renewal orders');

    const profile = order.product.profile;
    const inboundIds = Array.isArray(profile.inboundIds)
      ? (profile.inboundIds as string[])
      : [];
    if (!inboundIds.length) throw new BadRequestException('Provisioning profile has no inbounds');

    await this.ensurePanelSynced(profile.panelId, inboundIds);

    const totalBytes = Number(order.product.traffic);
    const expiryTime = Date.now() + order.product.durationDays * 86400000;
    const remarkBase = this.normalizeBaseName(order.configName || 'user');

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
        });

        await this.prisma.storeOrder.update({
          where: { id: orderId },
          data: { clientId: client.id, configName: email, provisionError: null },
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
        throw err;
      }
    }

    throw lastError || new BadRequestException('Could not provision a unique client name');
  }

  async provisionRenewalOrder(
    orderId: string,
    adminId: string,
    role: string,
  ): Promise<{ clientId: string }> {
    const order = await this.prisma.storeOrder.findUnique({
      where: { id: orderId },
      include: { product: true },
    });
    if (!order) throw new BadRequestException('Order not found');
    if (!order.isRenewal || !order.renewClientId) {
      throw new BadRequestException('Not a renewal order');
    }

    const existing = await this.resolveRenewClient(adminId, order.renewClientId);
    const addTraffic = Number(order.product.traffic);
    const addDays = order.product.durationDays;

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
