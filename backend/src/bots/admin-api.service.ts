import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { Prisma } from '@prisma/client';
import { ClientsService } from '../clients/clients.service';
import { PrismaService } from '../prisma/prisma.service';

const GB = 1024 ** 3;
const DAY_MS = 86_400_000;

export type ApiActor = { adminId: string; role: string };

type ClientRow = Prisma.ClientGetPayload<{
  include: {
    admin: { select: { id: true; username: true } };
    panel: { select: { id: true; name: true; panelType: true; subUrl: true } };
  };
}>;

/**
 * Data side of the per-admin API. Every read is scoped the same way the panel
 * scopes the admin's own session (resellers: their clients; super admins: all),
 * and every write goes through ClientsService so balance, caps and panel sync
 * behave exactly as in the UI.
 */
@Injectable()
export class AdminApiService {
  constructor(
    private prisma: PrismaService,
    private moduleRef: ModuleRef,
  ) {}

  async profile(actor: ApiActor) {
    const a = await this.prisma.admin.findUnique({
      where: { id: actor.adminId },
      select: {
        id: true,
        username: true,
        email: true,
        role: true,
        status: true,
        balance: true,
        trafficMode: true,
        unlimitedTraffic: true,
        expiryTime: true,
        maxClients: true,
        maxDeviceLimit: true,
        maxExpireDays: true,
        maxClientTrafficGb: true,
        _count: { select: { clients: true } },
      },
    });
    if (!a) throw new NotFoundException('Admin not found');
    const { _count, expiryTime, ...rest } = a;
    return { ...rest, expiryTime: Number(expiryTime), clientCount: _count.clients };
  }

  async listClients(
    actor: ApiActor,
    q: { page?: number; limit?: number; search?: string; status?: string; adminId?: string },
    origin: string,
  ) {
    const page = Math.max(1, q.page || 1);
    const limit = Math.min(Math.max(q.limit || 50, 1), 200);
    const where: Prisma.ClientWhereInput = {
      ...this.scope(actor),
      provisioningStatus: { not: 'FAILED' },
      isDeleting: false,
    };
    if (actor.role === 'SUPER_ADMIN' && q.adminId) where.adminId = q.adminId;
    if (q.search) {
      where.OR = [
        { email: { contains: q.search, mode: 'insensitive' } },
        { remark: { contains: q.search, mode: 'insensitive' } },
        { subId: q.search },
        { subToken: q.search },
      ];
    }
    const now = BigInt(Date.now());
    if (q.status === 'active') where.enable = true;
    if (q.status === 'disabled') where.enable = false;
    if (q.status === 'expired') where.AND = [{ expiryTime: { gt: 0 } }, { expiryTime: { lte: now } }];

    const [total, rows] = await Promise.all([
      this.prisma.client.count({ where }),
      this.prisma.client.findMany({
        where,
        include: this.include(),
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);
    return { data: rows.map((r) => this.toApi(r, origin)), page, limit, total };
  }

  /**
   * Find one client by any key a subscription link can carry:
   * HMPanel token (`/s/{token}`), 3x-ui subId, email, uuid or provider username.
   */
  async lookup(actor: ApiActor, key: string, origin: string) {
    const k = String(key || '').trim();
    if (!k) throw new BadRequestException('Pass ?key= (subscription token, subId, email or uuid)');
    const row = await this.prisma.client.findFirst({
      where: {
        ...this.scope(actor),
        provisioningStatus: { not: 'FAILED' },
        isDeleting: false,
        OR: [{ subToken: k }, { subId: k }, { email: k }, { uuid: k }, { remoteUsername: k }],
      },
      include: this.include(),
      orderBy: { updatedAt: 'desc' },
    });
    if (!row) throw new NotFoundException('Client not found');
    return this.toApi(row, origin);
  }

  async getClient(actor: ApiActor, id: string, origin: string) {
    await this.clients().findOne(id, actor.adminId, actor.role);
    const row = await this.prisma.client.findUnique({ where: { id }, include: this.include() });
    if (!row) throw new NotFoundException('Client not found');
    return this.toApi(row, origin);
  }

  /**
   * Extend expiry by `days` from the later of now and the current expiry, set
   * the quota (GB, 0 = unlimited) and optionally zero the usage.
   */
  async renew(
    actor: ApiActor,
    id: string,
    body: { days?: number; totalGb?: number; resetUsage?: boolean },
    origin: string,
  ) {
    const days = Number(body.days ?? 0);
    if (!Number.isFinite(days) || days < 0 || days > 3650) throw new BadRequestException('days must be 0–3650');
    const existing = await this.clients().findOne(id, actor.adminId, actor.role);
    const patch: { expiryTime?: number; total?: number; enable: boolean } = { enable: true };
    if (days > 0) {
      const current = Number(existing.expiryTime ?? 0);
      const base = current > Date.now() ? current : Date.now();
      patch.expiryTime = base + days * DAY_MS;
    }
    if (body.totalGb !== undefined) {
      const gb = Number(body.totalGb);
      if (!Number.isFinite(gb) || gb < 0) throw new BadRequestException('totalGb must be ≥ 0');
      patch.total = Math.round(gb * GB);
    }
    await this.clients().update(id, actor.adminId, actor.role, patch);
    if (body.resetUsage) await this.clients().resetUsage(id, actor.adminId, actor.role);
    return this.getClient(actor, id, origin);
  }

  async resetUsage(actor: ApiActor, id: string, origin: string) {
    await this.clients().resetUsage(id, actor.adminId, actor.role);
    return this.getClient(actor, id, origin);
  }

  async inbounds(actor: ApiActor) {
    const rows = await this.prisma.inbound.findMany({
      where: actor.role === 'SUPER_ADMIN' ? {} : { adminAccess: { some: { adminId: actor.adminId } } },
      select: {
        id: true,
        tag: true,
        remark: true,
        protocol: true,
        port: true,
        panel: { select: { id: true, name: true, panelType: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    return { data: rows };
  }

  async stats(actor: ApiActor) {
    const base: Prisma.ClientWhereInput = {
      ...this.scope(actor),
      provisioningStatus: { not: 'FAILED' },
      isDeleting: false,
    };
    const now = BigInt(Date.now());
    const soon = BigInt(Date.now() + 3 * DAY_MS);
    const [total, enabled, expired, expiringSoon, usage] = await Promise.all([
      this.prisma.client.count({ where: base }),
      this.prisma.client.count({ where: { ...base, enable: true } }),
      this.prisma.client.count({ where: { ...base, expiryTime: { gt: 0, lte: now } } }),
      this.prisma.client.count({ where: { ...base, expiryTime: { gt: now, lte: soon } } }),
      this.prisma.client.aggregate({ where: base, _sum: { up: true, down: true } }),
    ]);
    return {
      clients: { total, enabled, disabled: total - enabled, expired, expiringSoon },
      usedBytes: Number((usage._sum.up ?? 0n) + (usage._sum.down ?? 0n)),
    };
  }

  private scope(actor: ApiActor): Prisma.ClientWhereInput {
    return actor.role === 'SUPER_ADMIN' ? {} : { adminId: actor.adminId };
  }

  private include() {
    return {
      admin: { select: { id: true, username: true } },
      panel: { select: { id: true, name: true, panelType: true, subUrl: true } },
    } as const;
  }

  private toApi(c: ClientRow, origin: string) {
    const used = c.up + c.down;
    const now = Date.now();
    const expiry = Number(c.expiryTime);
    const token = c.subToken || c.subId;
    let status: 'active' | 'disabled' | 'expired' | 'limited' = 'active';
    if (!c.enable) status = 'disabled';
    else if (expiry > 0 && expiry <= now) status = 'expired';
    else if (c.total > 0n && used >= c.total) status = 'limited';
    return {
      id: c.id,
      email: c.email,
      remark: c.remark,
      subId: c.subId,
      subToken: c.subToken,
      subscriptionUrl: token ? `${origin}/s/${encodeURIComponent(token)}` : null,
      enable: c.enable,
      disableReason: c.disableReason,
      status,
      upBytes: Number(c.up),
      downBytes: Number(c.down),
      usedBytes: Number(used),
      totalBytes: Number(c.total),
      remainingBytes: c.total > 0n ? Math.max(0, Number(c.total - used)) : null,
      expiryTime: expiry,
      limitIp: c.limitIp,
      admin: c.admin ? { id: c.admin.id, username: c.admin.username } : null,
      panel: { id: c.panel.id, name: c.panel.name, type: c.panel.panelType },
      lastSyncedAt: c.lastSyncedAt?.toISOString() ?? null,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
    };
  }

  private clients(): ClientsService {
    try {
      return this.moduleRef.get(ClientsService, { strict: false });
    } catch {
      throw new BadRequestException('Clients service unavailable');
    }
  }
}
