import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  AdminQuotaService,
  panelMatchesQuotaFilter,
} from './admin-quota.service';

const CLIENT_ACTION_LOG_ACTIONS = [
  'CLIENT_CREATED',
  'CLIENT_UPDATED',
  'CLIENT_DELETED',
  'CLIENT_CLEANUP',
  'CLIENT_ASSIGNED_ADMIN',
  'BULK_CLIENT_CREATED',
] as const;

function isNoOpClientUpdate(details: unknown): boolean {
  if (!details || typeof details !== 'object') return true;
  const d = details as Record<string, unknown>;
  if (Array.isArray(d.changes)) return d.changes.length === 0;
  if (Array.isArray(d.changeFields)) return d.changeFields.length === 0;
  // Legacy rows that only recorded identical allocations.
  if (
    d.previousAllocation != null &&
    d.newAllocation != null &&
    String(d.previousAllocation) === String(d.newAllocation)
  ) {
    const added = Array.isArray(d.inboundsAdded) ? d.inboundsAdded : [];
    const removed = Array.isArray(d.inboundsRemoved) ? d.inboundsRemoved : [];
    const diff = d.trafficDifference;
    if (
      added.length === 0 &&
      removed.length === 0 &&
      (diff == null || String(diff) === '0')
    ) {
      return true;
    }
  }
  return false;
}

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
    const overview = await this.adminQuota.buildResellerOverview(
      adminId,
      panelId || undefined,
    );
    const panelWhere = await this.ledgerPanelWhere(
      panelId,
      overview.quotaMode === 'GLOBAL' && !overview.unlimitedTraffic,
    );
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

    const [rows, total, creditAgg, debitAgg, usageAgg, debitAllAgg] =
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
          where: {
            AND: [
              where,
              { type: 'DEBIT' },
              // Super-admin quota revokes are not reseller consumption.
              {
                OR: [
                  { action: null },
                  { action: { not: 'ADMIN_DEDUCTION' } },
                ],
              },
            ],
          },
          _sum: { amount: true },
        }),
        this.prisma.trafficTransaction.aggregate({
          where: { ...where, type: 'USAGE_CHARGE' },
          _sum: { amount: true },
        }),
        this.prisma.trafficTransaction.aggregate({
          where: { ...where, type: 'DEBIT' },
          _sum: { amount: true },
        }),
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
    const debitConsumed = Number(debitAgg._sum.amount || 0);
    const debitAll = Number(debitAllAgg._sum.amount || 0);
    const usage = Number(usageAgg._sum.amount || 0);
    const quota = await this.resolveLedgerQuota(adminId, panelId, overview, {
      credit,
      used: debitConsumed + usage,
    });

    return {
      data,
      total,
      page,
      limit,
      totals: {
        credit: creditAgg._sum.amount?.toString() || '0',
        debit: String(debitAll),
        debitConsumed: String(debitConsumed),
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
    const native =
      overview.quotaMode === 'GLOBAL'
        ? null
        : await this.nativeAccessQuota(adminId, panelId);
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

  /**
   * Client action audit log for an admin (create / update / delete / assign).
   * Visible to the reseller themselves and to super-admin when viewing that admin.
   */
  async getActionLog(
    adminId: string,
    page = 1,
    limit = 50,
    search?: string,
    action?: string,
  ) {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
      select: { id: true, username: true },
    });
    if (!admin) throw new NotFoundException('Admin not found');

    await this.purgeNoOpClientUpdates(adminId);

    const where = await this.buildActionLogWhere(adminId, search, action);
    const owned = await this.prisma.client.findMany({
      where: { adminId },
      select: { id: true, email: true },
    });
    const emailById = new Map(owned.map((c) => [c.id, c.email]));

    const [rows, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          admin: { select: { id: true, username: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    const missingIds = rows
      .map((r) => r.entityId)
      .filter((id): id is string => !!id && !emailById.has(id));
    if (missingIds.length) {
      const extras = await this.prisma.client.findMany({
        where: { id: { in: missingIds } },
        select: { id: true, email: true },
      });
      for (const c of extras) emailById.set(c.id, c.email);
    }

    const data = rows.map((r) => {
      const details = (r.details || {}) as Record<string, unknown>;
      const clientEmail =
        (typeof details.clientEmail === 'string' && details.clientEmail) ||
        (r.entityId ? emailById.get(r.entityId) : undefined) ||
        null;
      return {
        id: r.id,
        action: r.action,
        entityId: r.entityId,
        createdAt: r.createdAt,
        actor: r.admin
          ? { id: r.admin.id, username: r.admin.username }
          : null,
        clientEmail,
        details,
      };
    });

    return { data, total, page, limit };
  }

  /**
   * Delete action-log rows for an admin (selected ids, action category, or all scoped).
   */
  async deleteActionLogs(
    adminId: string,
    opts: {
      ids?: string[];
      actions?: string[];
      search?: string;
      all?: boolean;
    },
  ) {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
      select: { id: true },
    });
    if (!admin) throw new NotFoundException('Admin not found');

    const ids = Array.isArray(opts.ids)
      ? opts.ids.map((id) => String(id || '').trim()).filter(Boolean)
      : [];
    const actions = Array.isArray(opts.actions)
      ? opts.actions
          .map((a) => String(a || '').trim())
          .filter((a) =>
            (CLIENT_ACTION_LOG_ACTIONS as readonly string[]).includes(a),
          )
      : [];

    if (!opts.all && !ids.length && !actions.length && !String(opts.search || '').trim()) {
      throw new BadRequestException(
        'Specify ids, actions, search, or all=true to delete logs',
      );
    }

    const baseWhere = await this.buildActionLogWhere(
      adminId,
      opts.search,
      actions.length === 1 ? actions[0] : undefined,
    );

    const where: Prisma.AuditLogWhereInput = {
      AND: [
        baseWhere,
        ...(ids.length ? [{ id: { in: ids } }] : []),
        ...(actions.length > 1 ? [{ action: { in: actions } }] : []),
      ],
    };

    const result = await this.prisma.auditLog.deleteMany({ where });
    return { deleted: result.count };
  }

  private async buildActionLogWhere(
    adminId: string,
    search?: string,
    action?: string,
  ): Promise<Prisma.AuditLogWhereInput> {
    const owned = await this.prisma.client.findMany({
      where: { adminId },
      select: { id: true },
    });
    const ownedIds = owned.map((c) => c.id);

    const orFilters: Prisma.AuditLogWhereInput[] = [
      { adminId },
      { details: { path: ['targetAdminId'], equals: adminId } },
      { details: { path: ['toAdminId'], equals: adminId } },
      { details: { path: ['fromAdminId'], equals: adminId } },
    ];
    if (ownedIds.length) {
      orFilters.push({ entityId: { in: ownedIds } });
    }

    let actionFilter: Prisma.AuditLogWhereInput['action'] = {
      in: [...CLIENT_ACTION_LOG_ACTIONS],
    };
    const actionKey = String(action || '').trim();
    if (actionKey) {
      if (actionKey === 'CLIENT_DELETED') {
        actionFilter = { in: ['CLIENT_DELETED', 'CLIENT_CLEANUP'] };
      } else if (
        !(CLIENT_ACTION_LOG_ACTIONS as readonly string[]).includes(actionKey)
      ) {
        throw new BadRequestException('Invalid action filter');
      } else {
        actionFilter = actionKey;
      }
    }

    const where: Prisma.AuditLogWhereInput = {
      entity: 'Client',
      action: actionFilter,
      OR: orFilters,
    };

    const q = String(search || '').trim();
    if (q) {
      where.AND = [
        {
          OR: [
            { details: { path: ['clientEmail'], string_contains: q } },
            { details: { path: ['prefix'], string_contains: q } },
            { details: { path: ['toAdminUsername'], string_contains: q } },
            { details: { path: ['fromAdminUsername'], string_contains: q } },
            { admin: { username: { contains: q, mode: 'insensitive' } } },
          ],
        },
      ];
    }

    return where;
  }

  /** Remove legacy CLIENT_UPDATED rows that recorded no real field changes. */
  private async purgeNoOpClientUpdates(adminId: string) {
    const scope = await this.buildActionLogWhere(adminId, undefined, 'CLIENT_UPDATED');
    const candidates = await this.prisma.auditLog.findMany({
      where: scope,
      select: { id: true, details: true },
      take: 500,
      orderBy: { createdAt: 'desc' },
    });
    const noopIds = candidates
      .filter((c) => isNoOpClientUpdate(c.details))
      .map((c) => c.id);
    if (!noopIds.length) return;
    await this.prisma.auditLog.deleteMany({ where: { id: { in: noopIds } } });
  }

  private async ledgerPanelWhere(
    panelId?: string,
    includeGlobalPool = false,
  ): Promise<Prisma.TrafficTransactionWhereInput> {
    const filter = String(panelId || '').trim();
    if (!filter) return {};
    const scoped: Prisma.TrafficTransactionWhereInput =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        filter,
      )
        ? { panelId: filter }
        : await this.ledgerTypeWhere(filter);
    if (!includeGlobalPool) return scoped;
    return { OR: [scoped, { panelId: null }] };
  }

  private async ledgerTypeWhere(
    filter: string,
  ): Promise<Prisma.TrafficTransactionWhereInput> {
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
