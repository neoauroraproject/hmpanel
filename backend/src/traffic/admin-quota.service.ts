import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, QuotaMode } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { calculateAdminTrafficSummary } from '../common/utils/traffic.util';

export type AdminQuotaAdmin = {
  id: string;
  role: string;
  balance: number;
  totalAssigned: number;
  trafficMode: string;
  unlimitedTraffic: boolean;
  quotaMode: QuotaMode;
};

type Tx = Prisma.TransactionClient;

export function panelMatchesQuotaFilter(
  panelId: string,
  panelType: string | undefined,
  filterPanelId: string,
) {
  if (panelId === filterPanelId) return true;
  const type = panelType || '3x-ui';
  if (filterPanelId === 'eylan' || filterPanelId === 'pasarguard') {
    return type === filterPanelId;
  }
  if (filterPanelId === '3x-ui' || filterPanelId === '3xui') {
    return type !== 'eylan' && type !== 'pasarguard';
  }
  return false;
}

@Injectable()
export class AdminQuotaService {
  constructor(private readonly prisma: PrismaService) {}

  skipTrafficAccounting(admin: {
    role?: string | null;
    unlimitedTraffic?: boolean | null;
  }): boolean {
    return admin.role === 'SUPER_ADMIN' || admin.unlimitedTraffic === true;
  }

  providerFromPanelType(panelType?: string | null): '3xui' | 'eylan' | 'pasarguard' {
    if (panelType === 'eylan' || panelType === 'pasarguard') return panelType;
    return '3xui';
  }

  async resolveTrafficMode(
    adminId: string,
    panelType?: string | null,
    tx?: Tx,
  ): Promise<'ALLOCATION' | 'USAGE'> {
    const provider = this.providerFromPanelType(panelType);
    if (provider === 'eylan' || provider === 'pasarguard') {
      const db = tx ?? this.prisma;
      const access = await db.adminProviderAccess.findUnique({
        where: { adminId_provider: { adminId, provider } },
        select: { metadata: true },
      });
      const rec =
        access?.metadata && typeof access.metadata === 'object'
          ? (access.metadata as Record<string, unknown>)
          : {};
      if (rec.trafficMode === 'USAGE' || rec.trafficMode === 'ALLOCATION') {
        return rec.trafficMode;
      }
    }
    const db = tx ?? this.prisma;
    const admin = await db.admin.findUnique({
      where: { id: adminId },
      select: { trafficMode: true },
    });
    return admin?.trafficMode === 'USAGE' ? 'USAGE' : 'ALLOCATION';
  }

  isPerPanel(admin: { quotaMode?: QuotaMode | string | null }): boolean {
    return admin.quotaMode === 'PER_PANEL';
  }

  async loadAdmin(adminId: string, tx?: Tx): Promise<AdminQuotaAdmin> {
    const db = tx ?? this.prisma;
    return db.admin.findUniqueOrThrow({
      where: { id: adminId },
      select: {
        id: true,
        role: true,
        balance: true,
        totalAssigned: true,
        trafficMode: true,
        unlimitedTraffic: true,
        quotaMode: true,
      },
    });
  }

  async getPanelBalance(
    admin: AdminQuotaAdmin,
    panelId: string,
    tx?: Tx,
  ): Promise<{ balance: number; totalAssigned: number }> {
    if (!this.isPerPanel(admin)) {
      return { balance: admin.balance, totalAssigned: admin.totalAssigned };
    }
    const db = tx ?? this.prisma;
    const row = await db.adminPanelQuota.findUnique({
      where: { adminId_panelId: { adminId: admin.id, panelId } },
    });
    return {
      balance: row?.balance ?? 0,
      totalAssigned: row?.totalAssigned ?? 0,
    };
  }

  async assertCanAllocate(
    admin: AdminQuotaAdmin,
    bytes: bigint,
    panelId: string | null,
    opts?: { usageMode?: boolean },
  ): Promise<void> {
    if (this.skipTrafficAccounting(admin)) return;
    if (this.isPerPanel(admin) && !panelId) {
      throw new BadRequestException('panelId is required for per-panel quota checks.');
    }
    const amount = Number(bytes);
    const bucket = await this.getPanelBalance(admin, panelId || '');
    if (opts?.usageMode || admin.trafficMode === 'USAGE') {
      if (bucket.balance <= 0) {
        throw new BadRequestException(
          this.isPerPanel(admin) && panelId
            ? 'Insufficient traffic balance for this panel.'
            : 'Insufficient traffic balance. Cannot create clients when balance is zero or below.',
        );
      }
      return;
    }
    if (bucket.balance <= 0) {
      throw new BadRequestException(
        this.isPerPanel(admin) && panelId
          ? 'Insufficient traffic balance for this panel.'
          : 'Insufficient traffic balance. Cannot create clients when balance is zero or below.',
      );
    }
    if (bucket.balance < amount) {
      throw new BadRequestException(
        this.isPerPanel(admin) && panelId
          ? 'Insufficient traffic balance for this panel.'
          : 'Insufficient traffic balance',
      );
    }
  }

  async debit(
    tx: Tx,
    admin: AdminQuotaAdmin,
    panelId: string,
    bytes: bigint,
    meta: {
      clientId?: string;
      targetClientUuid?: string;
      action: string;
      description?: string;
    },
  ): Promise<{ balanceBefore: number; balanceAfter: number }> {
    const amount = Number(bytes);
    if (this.skipTrafficAccounting(admin) || amount <= 0) {
      return { balanceBefore: admin.balance, balanceAfter: admin.balance };
    }

    if (this.isPerPanel(admin)) {
      const row = await tx.adminPanelQuota.findUnique({
        where: { adminId_panelId: { adminId: admin.id, panelId } },
      });
      const before = row?.balance ?? 0;
      if (before < amount) {
        throw new BadRequestException('Insufficient traffic balance for this panel.');
      }
      const after = before - amount;
      await tx.adminPanelQuota.upsert({
        where: { adminId_panelId: { adminId: admin.id, panelId } },
        create: {
          adminId: admin.id,
          panelId,
          balance: after,
          totalAssigned: amount,
        },
        update: { balance: after },
      });
      await tx.trafficTransaction.create({
        data: {
          adminId: admin.id,
          panelId,
          clientId: meta.clientId,
          targetClientUuid: meta.targetClientUuid,
          amount: bytes,
          type: 'DEBIT',
          action: meta.action,
          description: meta.description,
          balanceBefore: before,
          balanceAfter: after,
        },
      });
      return { balanceBefore: before, balanceAfter: after };
    }

    const locked = await tx.admin.findUniqueOrThrow({
      where: { id: admin.id },
      select: { balance: true },
    });
    if (locked.balance < amount) {
      throw new BadRequestException('Insufficient traffic balance');
    }
    const after = locked.balance - amount;
    await tx.admin.update({
      where: { id: admin.id },
      data: { balance: after },
    });
    await tx.trafficTransaction.create({
      data: {
        adminId: admin.id,
        panelId,
        clientId: meta.clientId,
        targetClientUuid: meta.targetClientUuid,
        amount: bytes,
        type: 'DEBIT',
        action: meta.action,
        description: meta.description,
        balanceBefore: locked.balance,
        balanceAfter: after,
      },
    });
    return { balanceBefore: locked.balance, balanceAfter: after };
  }

  async credit(
    tx: Tx,
    admin: AdminQuotaAdmin,
    panelId: string | null,
    bytes: bigint,
    meta: {
      clientId?: string;
      targetClientUuid?: string;
      action: string;
      description?: string;
    },
  ): Promise<{ balanceBefore: number; balanceAfter: number }> {
    const amount = Number(bytes);
    if (this.skipTrafficAccounting(admin) || amount <= 0) {
      return { balanceBefore: admin.balance, balanceAfter: admin.balance };
    }

    if (this.isPerPanel(admin)) {
      if (!panelId) {
        throw new BadRequestException('panelId required for per-panel credit');
      }
      const row = await tx.adminPanelQuota.findUnique({
        where: { adminId_panelId: { adminId: admin.id, panelId } },
      });
      const before = row?.balance ?? 0;
      const after = before + amount;
      await tx.adminPanelQuota.upsert({
        where: { adminId_panelId: { adminId: admin.id, panelId } },
        create: {
          adminId: admin.id,
          panelId,
          balance: after,
          totalAssigned: 0,
        },
        update: { balance: after },
      });
      await tx.trafficTransaction.create({
        data: {
          adminId: admin.id,
          panelId,
          clientId: meta.clientId,
          targetClientUuid: meta.targetClientUuid,
          amount: bytes,
          type: 'CREDIT',
          action: meta.action,
          description: meta.description,
          balanceBefore: before,
          balanceAfter: after,
        },
      });
      return { balanceBefore: before, balanceAfter: after };
    }

    const locked = await tx.admin.findUniqueOrThrow({
      where: { id: admin.id },
      select: { balance: true },
    });
    const after = locked.balance + amount;
    await tx.admin.update({
      where: { id: admin.id },
      data: { balance: after },
    });
    await tx.trafficTransaction.create({
      data: {
        adminId: admin.id,
        panelId: panelId || undefined,
        clientId: meta.clientId,
        targetClientUuid: meta.targetClientUuid,
        amount: bytes,
        type: 'CREDIT',
        action: meta.action,
        description: meta.description,
        balanceBefore: locked.balance,
        balanceAfter: after,
      },
    });
    return { balanceBefore: locked.balance, balanceAfter: after };
  }

  async applyUsageCharge(
    adminId: string,
    panelId: string,
    delta: bigint,
  ): Promise<void> {
    if (delta <= 0n) return;
    const admin = await this.loadAdmin(adminId);
    if (this.skipTrafficAccounting(admin)) return;
    const panel = await this.prisma.panel.findUnique({
      where: { id: panelId },
      select: { panelType: true },
    });
    const mode = await this.resolveTrafficMode(adminId, panel?.panelType);
    if (mode !== 'USAGE') return;

    await this.prisma.$transaction(async (tx) => {
      if (this.isPerPanel(admin)) {
        const row = await tx.adminPanelQuota.findUnique({
          where: { adminId_panelId: { adminId, panelId } },
        });
        const before = row?.balance ?? 0;
        const after = Math.max(0, before - Number(delta));
        await tx.adminPanelQuota.upsert({
          where: { adminId_panelId: { adminId, panelId } },
          create: {
            adminId,
            panelId,
            balance: after,
            totalAssigned: 0,
          },
          update: { balance: after },
        });
        await tx.trafficTransaction.create({
          data: {
            adminId,
            panelId,
            amount: delta,
            type: 'USAGE_CHARGE',
            action: 'DAILY_USAGE_CHARGE',
            description: 'Daily Summarized Usage Charge',
            balanceBefore: before,
            balanceAfter: after,
          },
        });
        return;
      }

      const locked = await tx.admin.findUniqueOrThrow({
        where: { id: adminId },
        select: { balance: true },
      });
      const after = Math.max(0, locked.balance - Number(delta));
      await tx.admin.update({
        where: { id: adminId },
        data: { balance: after },
      });
      await tx.trafficTransaction.create({
        data: {
          adminId,
          panelId,
          amount: delta,
          type: 'USAGE_CHARGE',
          action: 'DAILY_USAGE_CHARGE',
          description: 'Daily Summarized Usage Charge',
          balanceBefore: locked.balance,
          balanceAfter: after,
        },
      });
    });
  }

  async topUp(
    adminId: string,
    amountBytes: bigint,
    panelId?: string | null,
    description?: string,
  ) {
    const admin = await this.loadAdmin(adminId);
    if (this.isPerPanel(admin)) {
      if (!panelId) {
        throw new BadRequestException('panelId is required for per-panel top-up');
      }
      return this.prisma.$transaction(async (tx) => {
        const row = await tx.adminPanelQuota.findUnique({
          where: { adminId_panelId: { adminId, panelId } },
        });
        const before = row?.balance ?? 0;
        const after = before + Number(amountBytes);
        await tx.adminPanelQuota.upsert({
          where: { adminId_panelId: { adminId, panelId } },
          create: {
            adminId,
            panelId,
            balance: after,
            totalAssigned: Number(amountBytes),
          },
          update: {
            balance: after,
            totalAssigned: { increment: Number(amountBytes) },
          },
        });
        await tx.trafficTransaction.create({
          data: {
            adminId,
            panelId,
            amount: amountBytes,
            type: 'CREDIT',
            action: 'BALANCE_TOPUP',
            description: description || 'Balance top-up',
            balanceBefore: before,
            balanceAfter: after,
          },
        });
        return { balance: after, panelId };
      });
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.admin.update({
        where: { id: adminId },
        data: {
          balance: { increment: Number(amountBytes) },
          totalAssigned: { increment: Number(amountBytes) },
        },
        select: { balance: true },
      });
      await tx.trafficTransaction.create({
        data: {
          adminId,
          panelId: panelId || undefined,
          amount: amountBytes,
          type: 'CREDIT',
          action: 'BALANCE_TOPUP',
          description: description || 'Balance top-up',
          balanceBefore: updated.balance - Number(amountBytes),
          balanceAfter: updated.balance,
        },
      });
      return updated;
    });
  }

  async derivePanelIds(inboundIds: string[]): Promise<string[]> {
    if (!inboundIds.length) return [];
    const rows = await this.prisma.inbound.findMany({
      where: { id: { in: inboundIds } },
      select: { panelId: true },
    });
    return [...new Set(rows.map((r) => r.panelId))];
  }

  async syncPanelQuotas(
    adminId: string,
    input: {
      quotaMode: QuotaMode;
      unlimited: boolean;
      inboundIds: string[];
      panelQuotas?: Array<{ panelId: string; balanceBytes: number }>;
      previousMode?: QuotaMode;
    },
  ): Promise<void> {
    const panelIds = await this.derivePanelIds(input.inboundIds);

    if (input.unlimited) {
      await this.prisma.adminPanelQuota.deleteMany({ where: { adminId } });
      await this.prisma.admin.update({
        where: { id: adminId },
        data: { quotaMode: input.quotaMode, balance: 0, totalAssigned: 0 },
      });
      return;
    }

    if (input.quotaMode === 'GLOBAL') {
      const rows = await this.prisma.adminPanelQuota.findMany({
        where: { adminId },
      });
      const mergedBalance =
        rows.reduce((sum, r) => sum + r.balance, 0) +
        (input.previousMode === 'PER_PANEL' ? 0 : 0);
      const mergedAssigned = rows.reduce((sum, r) => sum + r.totalAssigned, 0);
      const admin = await this.prisma.admin.findUniqueOrThrow({
        where: { id: adminId },
        select: { balance: true, totalAssigned: true, quotaMode: true },
      });
      const nextBalance =
        input.previousMode === 'PER_PANEL'
          ? mergedBalance
          : admin.balance;
      const nextAssigned =
        input.previousMode === 'PER_PANEL'
          ? mergedAssigned
          : admin.totalAssigned;
      await this.prisma.$transaction([
        this.prisma.adminPanelQuota.deleteMany({ where: { adminId } }),
        this.prisma.admin.update({
          where: { id: adminId },
          data: {
            quotaMode: 'GLOBAL',
            balance: nextBalance,
            totalAssigned: nextAssigned,
          },
        }),
      ]);
      return;
    }

    // PER_PANEL
    const quotas = input.panelQuotas ?? [];
    if (!input.unlimited && panelIds.length > 0) {
      const missing = panelIds.filter(
        (pid) => !quotas.some((q) => q.panelId === pid),
      );
      if (missing.length > 0) {
        throw new BadRequestException(
          'Each assigned panel must have a traffic quota in per-panel mode.',
        );
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.admin.update({
        where: { id: adminId },
        data: { quotaMode: 'PER_PANEL', balance: 0, totalAssigned: 0 },
      });
      await tx.adminPanelQuota.deleteMany({
        where: {
          adminId,
          ...(panelIds.length ? { panelId: { notIn: panelIds } } : {}),
        },
      });
      for (const pid of panelIds) {
        const spec = quotas.find((q) => q.panelId === pid);
        const balanceBytes = spec?.balanceBytes ?? 0;
        await tx.adminPanelQuota.upsert({
          where: { adminId_panelId: { adminId, panelId: pid } },
          create: {
            adminId,
            panelId: pid,
            balance: balanceBytes,
            totalAssigned: balanceBytes,
          },
          update: {
            balance: balanceBytes,
            totalAssigned: balanceBytes,
          },
        });
      }
    });
  }

  async updatePanelQuotaBalances(
    adminId: string,
    panelQuotas: Array<{ panelId: string; balanceBytes: number }>,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      for (const q of panelQuotas) {
        const existing = await tx.adminPanelQuota.findUnique({
          where: { adminId_panelId: { adminId, panelId: q.panelId } },
        });
        const before = existing?.balance ?? 0;
        const diff = q.balanceBytes - before;
        await tx.adminPanelQuota.upsert({
          where: { adminId_panelId: { adminId, panelId: q.panelId } },
          create: {
            adminId,
            panelId: q.panelId,
            balance: q.balanceBytes,
            totalAssigned: q.balanceBytes,
          },
          update: {
            balance: q.balanceBytes,
            ...(diff > 0 ? { totalAssigned: { increment: diff } } : {}),
          },
        });
        if (diff !== 0) {
          await tx.trafficTransaction.create({
            data: {
              adminId,
              panelId: q.panelId,
              amount: BigInt(Math.abs(Math.round(diff))),
              type: diff > 0 ? 'CREDIT' : 'DEBIT',
              action: diff > 0 ? 'ADMIN_RECHARGE' : 'ADMIN_DEDUCTION',
              description:
                diff > 0 ? 'Per-panel admin recharge' : 'Per-panel admin deduction',
              balanceBefore: before,
              balanceAfter: q.balanceBytes,
            },
          });
        }
      }
    });
  }

  async listPanelQuotas(adminId: string) {
    const rows = await this.prisma.adminPanelQuota.findMany({
      where: { adminId },
      include: { panel: { select: { id: true, name: true, panelType: true } } },
      orderBy: { panel: { name: 'asc' } },
    });
    return rows.map((r) => {
      const summary = calculateAdminTrafficSummary(r.totalAssigned, r.balance);
      return {
        panelId: r.panelId,
        panelName: r.panel.name,
        panelType: r.panel.panelType || "3x-ui",
        balance: r.balance,
        totalAssigned: r.totalAssigned,
        availableTraffic: summary.availableTraffic,
        usedTraffic: summary.usedTraffic,
      };
    });
  }

  async buildResellerOverview(adminId: string, filterPanelId?: string) {
    const admin = await this.loadAdmin(adminId);
    const unlimited =
      admin.unlimitedTraffic === true || admin.role === 'SUPER_ADMIN';

    if (!this.isPerPanel(admin) || unlimited) {
      const summary = calculateAdminTrafficSummary(
        admin.totalAssigned,
        admin.balance,
      );
      return {
        quotaMode: 'GLOBAL' as const,
        unlimitedTraffic: unlimited,
        availableTraffic: unlimited ? 0 : summary.availableTraffic,
        allTimeTraffic: unlimited ? 0 : summary.totalAllocated,
        usedTraffic: unlimited ? 0 : summary.usedTraffic,
        panels: [] as Array<{
          panelId: string;
          name: string;
          availableTraffic: number;
          allTimeTraffic: number;
          usedTraffic: number;
        }>,
      };
    }

    const quotas = await this.listPanelQuotas(adminId);
    const panels = quotas.map((q) => ({
      panelId: q.panelId,
      name: q.panelName,
      panelType: q.panelType,
      availableTraffic: q.availableTraffic,
      allTimeTraffic: q.totalAssigned,
      usedTraffic: q.usedTraffic,
    }));

    const matching = filterPanelId
      ? panels.filter((p) => panelMatchesQuotaFilter(p.panelId, p.panelType, filterPanelId))
      : panels;
    const sumAvailable = matching.reduce((s, p) => s + p.availableTraffic, 0);
    const sumAssigned = matching.reduce((s, p) => s + p.allTimeTraffic, 0);
    const sumUsed = matching.reduce((s, p) => s + p.usedTraffic, 0);

    return {
      quotaMode: 'PER_PANEL' as const,
      unlimitedTraffic: false,
      availableTraffic: sumAvailable,
      allTimeTraffic: sumAssigned,
      usedTraffic: sumUsed,
      panels,
    };
  }
}
