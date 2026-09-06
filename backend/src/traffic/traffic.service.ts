import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdminQuotaService,
  panelMatchesQuotaFilter,
} from './admin-quota.service';

@Injectable()
export class TrafficService {
  constructor(
    private prisma: PrismaService,
    private adminQuota: AdminQuotaService,
  ) {}

  /** Top-up an admin's balance (SUPER_ADMIN action) */
  async topUp(
    adminId: string,
    amountBytes: bigint,
    description?: string,
    panelId?: string,
  ) {
    return this.adminQuota.topUp(adminId, amountBytes, panelId, description);
  }

  /** Deduct quota when creating a client (Allocation mode) */
  async provision(
    adminId: string,
    clientId: string,
    amountBytes: bigint,
    panelId?: string,
  ) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const client = await tx.client.findUnique({
        where: { id: clientId },
        select: { uuid: true, panelId: true },
      });
      const admin = await this.adminQuota.loadAdmin(adminId, tx);
      const resolvedPanelId = panelId || client?.panelId;
      if (!resolvedPanelId) {
        throw new Error('panelId required for traffic provision');
      }

      if (admin.trafficMode === 'ALLOCATION') {
        await this.adminQuota.assertCanAllocate(
          admin,
          amountBytes,
          resolvedPanelId,
        );
        await this.adminQuota.debit(tx, admin, resolvedPanelId, amountBytes, {
          clientId,
          targetClientUuid: client?.uuid ?? clientId,
          action: 'CLIENT_PROVISIONING',
          description: 'Client provisioned',
        });
      }
    });
  }

  /** Refund remaining traffic when deleting a client */
  async refund(
    adminId: string,
    clientId: string,
    totalBytes: bigint,
    usedBytes: bigint,
    panelId?: string,
  ) {
    const remaining = totalBytes - usedBytes;
    if (remaining <= 0n) return;

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const client = await tx.client.findUnique({
        where: { id: clientId },
        select: { uuid: true, panelId: true },
      });
      const admin = await this.adminQuota.loadAdmin(adminId, tx);
      const resolvedPanelId = panelId || client?.panelId;
      if (!resolvedPanelId) return;

      await this.adminQuota.credit(tx, admin, resolvedPanelId, remaining, {
        clientId,
        targetClientUuid: client?.uuid ?? clientId,
        action: 'CLIENT_DELETION_REFUND',
        description: 'Client deleted — remaining traffic refunded',
      });
    });
  }

  /** Get ledger for an admin */
  async getLedger(
    adminId: string,
    page = 1,
    limit = 100,
    type?: string,
    search?: string,
    panelId?: string,
  ) {
    const panelWhere = await this.ledgerPanelWhere(panelId);
    const where: Prisma.TrafficTransactionWhereInput = {
      adminId,
      ...panelWhere,
      ...(type ? { type: type as any } : {}),
      ...(search
        ? {
            OR: [
              { description: { contains: search, mode: 'insensitive' } },
              { client: { email: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const [rows, total, creditAgg, debitAgg, usageAgg, overview] =
      await Promise.all([
        this.prisma.trafficTransaction.findMany({
          where,
          skip: (page - 1) * limit,
          take: limit,
          select: {
            id: true,
            amount: true,
            type: true,
            description: true,
            createdAt: true,
            balanceBefore: true,
            balanceAfter: true,
            action: true,
            targetClientUuid: true,
            panelId: true,
            client: { select: { id: true, email: true, uuid: true } },
          },
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.trafficTransaction.count({ where }),
        this.prisma.trafficTransaction.aggregate({
          where: { ...where, type: 'CREDIT' },
          _sum: { amount: true },
        }),
        this.prisma.trafficTransaction.aggregate({
          where: { ...where, type: 'DEBIT' },
          _sum: { amount: true },
        }),
        this.prisma.trafficTransaction.aggregate({
          where: { ...where, type: 'USAGE_CHARGE' },
          _sum: { amount: true },
        }),
        this.adminQuota.buildResellerOverview(adminId, panelId || undefined),
      ]);

    const panelIds = [
      ...new Set(rows.map((r) => r.panelId).filter((id): id is string => !!id)),
    ];
    const panels = panelIds.length
      ? await this.prisma.panel.findMany({
          where: { id: { in: panelIds } },
          select: { id: true, name: true, panelType: true },
        })
      : [];
    const panelMap = new Map(panels.map((p) => [p.id, p]));
    const data = rows.map((row) => ({
      ...row,
      panel: row.panelId ? panelMap.get(row.panelId) ?? null : null,
    }));

    const credit = Number(creditAgg._sum.amount || 0);
    const debit = Number(debitAgg._sum.amount || 0);
    const usage = Number(usageAgg._sum.amount || 0);
    const quota = await this.resolveLedgerQuota(adminId, panelId, overview, {
      credit,
      used: debit + usage,
    });

    return {
      data,
      total,
      page,
      limit,
      totals: {
        credit: creditAgg._sum.amount?.toString() || '0',
        debit: debitAgg._sum.amount?.toString() || '0',
      },
      quota,
    };
  }

  /**
   * Destination tabs for Traffic History: each 3x-ui / Eylan / Pasarguard
   * instance this admin may use, then type-level fallbacks if needed.
   */
  async getDestinations(adminId: string) {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
      select: {
        id: true,
        adminInbounds: {
          select: {
            inbound: {
              select: {
                panel: { select: { id: true, name: true, panelType: true } },
              },
            },
          },
        },
      },
    });
    if (!admin) throw new NotFoundException('Admin not found');

    const byId = new Map<
      string,
      { id: string; name: string; panelType: string }
    >();
    const addPanel = (p?: { id: string; name: string; panelType?: string | null } | null) => {
      if (!p?.id) return;
      const panelType = p.panelType || '3x-ui';
      if (!byId.has(p.id)) byId.set(p.id, { id: p.id, name: p.name, panelType });
    };

    for (const row of admin.adminInbounds) {
      addPanel(row.inbound?.panel);
    }

    const quotas = await this.adminQuota.listPanelQuotas(adminId);
    for (const q of quotas) {
      addPanel({ id: q.panelId, name: q.panelName, panelType: q.panelType });
    }

    const clientPanels = await this.prisma.client.findMany({
      where: { adminId },
      distinct: ['panelId'],
      select: { panel: { select: { id: true, name: true, panelType: true } } },
    });
    for (const c of clientPanels) addPanel(c.panel);

    const [grants, accesses, overview] = await Promise.all([
      this.prisma.storeAddonGrant.findMany({
        where: { granteeAdminId: adminId, enabled: true },
        select: { providerId: true, trafficQuotaBytes: true },
      }),
      this.prisma.adminProviderAccess.findMany({
        where: { adminId, enabled: true },
        select: {
          provider: true,
          unlimitedTraffic: true,
          trafficBytes: true,
          usedTrafficBytes: true,
        },
      }),
      this.adminQuota.buildResellerOverview(adminId),
    ]);

    const nativeEnabled = new Set<string>();
    for (const g of grants) {
      if (g.providerId === 'eylan' || g.providerId === 'pasarguard') {
        nativeEnabled.add(g.providerId);
      }
    }
    let xuiAccess = false;
    for (const a of accesses) {
      if (a.provider === 'eylan' || a.provider === 'pasarguard') {
        nativeEnabled.add(a.provider);
      }
      if (a.provider === '3xui' || a.provider === '3x-ui') xuiAccess = true;
    }
    for (const p of byId.values()) {
      if (p.panelType === 'eylan' || p.panelType === 'pasarguard') {
        nativeEnabled.add(p.panelType);
      }
    }

    if (nativeEnabled.size) {
      const extraNative = await this.prisma.panel.findMany({
        where: { panelType: { in: [...nativeEnabled] } },
        select: { id: true, name: true, panelType: true },
      });
      for (const p of extraNative) addPanel(p);
    }

    const remainingFor = (filterId: string): number | null => {
      if (overview.unlimitedTraffic) return null;
      if (overview.quotaMode === 'GLOBAL') return overview.availableTraffic;
      return overview.panels
        .filter((p) =>
          panelMatchesQuotaFilter(p.panelId, p.panelType, filterId),
        )
        .reduce((s, p) => s + p.availableTraffic, 0);
    };
    const usedFor = (filterId: string): number | null => {
      if (overview.unlimitedTraffic) return null;
      if (overview.quotaMode === 'GLOBAL') return overview.usedTraffic;
      return overview.panels
        .filter((p) =>
          panelMatchesQuotaFilter(p.panelId, p.panelType, filterId),
        )
        .reduce((s, p) => s + p.usedTraffic, 0);
    };
    const totalFor = (filterId: string): number | null => {
      if (overview.unlimitedTraffic) return null;
      if (overview.quotaMode === 'GLOBAL') return overview.allTimeTraffic;
      return overview.panels
        .filter((p) =>
          panelMatchesQuotaFilter(p.panelId, p.panelType, filterId),
        )
        .reduce((s, p) => s + p.allTimeTraffic, 0);
    };

    const nativeSlice = (
      providerId: 'eylan' | 'pasarguard',
    ): {
      remainingBytes: number | null;
      usedBytes: number | null;
      totalBytes: number | null;
    } => {
      const access = accesses.find((a) => a.provider === providerId);
      if (access) {
        if (access.unlimitedTraffic) {
          return { remainingBytes: null, usedBytes: null, totalBytes: null };
        }
        const total = Number(access.trafficBytes);
        const used = Number(access.usedTrafficBytes);
        return {
          remainingBytes: total - used,
          usedBytes: used,
          totalBytes: total,
        };
      }
      const grant = grants.find((g) => g.providerId === providerId);
      if (grant) {
        return {
          remainingBytes: Number(grant.trafficQuotaBytes),
          usedBytes: 0,
          totalBytes: Number(grant.trafficQuotaBytes),
        };
      }
      return {
        remainingBytes: remainingFor(providerId),
        usedBytes: usedFor(providerId),
        totalBytes: totalFor(providerId),
      };
    };

    const destinations: Array<{
      id: string;
      name: string;
      panelType: string;
      remainingBytes: number | null;
      usedBytes: number | null;
      totalBytes: number | null;
    }> = [];

    const xuiPanels = [...byId.values()]
      .filter((p) => p.panelType !== 'eylan' && p.panelType !== 'pasarguard')
      .sort((a, b) => a.name.localeCompare(b.name));

    for (const p of xuiPanels) {
      destinations.push({
        id: p.id,
        name: p.name,
        panelType: p.panelType || '3x-ui',
        remainingBytes: remainingFor(p.id),
        usedBytes: usedFor(p.id),
        totalBytes: totalFor(p.id),
      });
    }
    if (!xuiPanels.length && xuiAccess) {
      destinations.push({
        id: '3x-ui',
        name: '3x-ui',
        panelType: '3x-ui',
        remainingBytes: remainingFor('3x-ui'),
        usedBytes: usedFor('3x-ui'),
        totalBytes: totalFor('3x-ui'),
      });
    }

    const pushedNative = new Set<string>();
    for (const id of ['pasarguard', 'eylan'] as const) {
      const instances = [...byId.values()]
        .filter((p) => p.panelType === id)
        .sort((a, b) => a.name.localeCompare(b.name));
      const slice = nativeSlice(id);
      if (instances.length) {
        for (const p of instances) {
          destinations.push({
            id: p.id,
            name: p.name,
            panelType: id,
            remainingBytes: slice.remainingBytes,
            usedBytes: slice.usedBytes,
            totalBytes: slice.totalBytes,
          });
        }
        pushedNative.add(id);
        continue;
      }
      if (!nativeEnabled.has(id) || pushedNative.has(id)) continue;
      destinations.push({
        id,
        name: id === 'eylan' ? 'Eylan' : 'Pasarguard',
        panelType: id,
        remainingBytes: slice.remainingBytes,
        usedBytes: slice.usedBytes,
        totalBytes: slice.totalBytes,
      });
    }

    return { destinations };
  }

  private async resolveLedgerQuota(
    adminId: string,
    panelId: string | undefined,
    overview: {
      quotaMode: string;
      unlimitedTraffic: boolean;
      availableTraffic: number;
      usedTraffic: number;
      allTimeTraffic: number;
    },
    txSums: { credit: number; used: number },
  ) {
    const native = await this.nativeAccessQuota(adminId, panelId);
    if (native) return native;

    const base = {
      quotaMode: overview.quotaMode,
      unlimitedTraffic: overview.unlimitedTraffic,
      availableTraffic: overview.availableTraffic,
      usedTraffic: overview.usedTraffic,
      allTimeTraffic: overview.allTimeTraffic,
      sharedRemaining: overview.quotaMode === 'GLOBAL' && !overview.unlimitedTraffic,
    };

    if (
      overview.quotaMode === 'GLOBAL' &&
      panelId &&
      !overview.unlimitedTraffic
    ) {
      return {
        ...base,
        usedTraffic: txSums.used,
        allTimeTraffic:
          txSums.credit > 0
            ? txSums.credit
            : txSums.used + overview.availableTraffic,
        sharedRemaining: true,
      };
    }

    return {
      ...base,
      sharedRemaining: false,
    };
  }

  private async nativeAccessQuota(adminId: string, panelId?: string) {
    const filter = String(panelId || '').trim();
    if (!filter) return null;
    let provider: 'eylan' | 'pasarguard' | null = null;
    if (filter === 'eylan' || filter === 'pasarguard') {
      provider = filter;
    } else if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        filter,
      )
    ) {
      const panel = await this.prisma.panel.findUnique({
        where: { id: filter },
        select: { panelType: true },
      });
      if (panel?.panelType === 'eylan' || panel?.panelType === 'pasarguard') {
        provider = panel.panelType;
      }
    }
    if (!provider) return null;

    const access = await this.prisma.adminProviderAccess.findFirst({
      where: { adminId, provider, enabled: true },
      select: {
        unlimitedTraffic: true,
        trafficBytes: true,
        usedTrafficBytes: true,
      },
    });
    if (!access) return null;

    const total = Number(access.trafficBytes);
    const used = Number(access.usedTrafficBytes);
    return {
      quotaMode: 'PROVIDER',
      unlimitedTraffic: access.unlimitedTraffic,
      availableTraffic: access.unlimitedTraffic ? 0 : Math.max(0, total - used),
      usedTraffic: used,
      allTimeTraffic: total,
      sharedRemaining: false,
    };
  }

  private async ledgerPanelWhere(
    panelId?: string,
  ): Promise<Prisma.TrafficTransactionWhereInput> {
    const filter = String(panelId || '').trim();
    if (!filter) return {};
    if (
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        filter,
      )
    ) {
      return { panelId: filter };
    }
    const panels = await this.prisma.panel.findMany({
      select: { id: true, panelType: true },
    });
    const ids = panels
      .filter((p) =>
        panelMatchesQuotaFilter(p.id, p.panelType || '3x-ui', filter),
      )
      .map((p) => p.id);
    if (!ids.length) {
      return { panelId: '00000000-0000-0000-0000-000000000000' };
    }
    return { panelId: { in: ids } };
  }
}
