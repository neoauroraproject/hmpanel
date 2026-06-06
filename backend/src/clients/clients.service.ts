import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { randomUUID } from 'crypto';
import * as QRCode from 'qrcode';
import { PanelsService } from '../panels/panels.service';

const GB = 1024 ** 3;

export interface ClientFilters {
  search?: string;
  status?: string; // active | disabled | expired
  inboundId?: string;
  panelId?: string;
  adminId?: string; // filter by owner (super-admin only)
  expiry?: string;
  trafficRange?: string;
}

@Injectable()
export class ClientsService {
  constructor(
    private prisma: PrismaService,
    private panelsService: PanelsService
  ) {}

  async create(callerId: string, data: { email: string; inboundId: string; remark?: string; total?: number; expiryTime?: number; flow?: string; adminId?: string }) {
    const totalBytes = BigInt(data.total || 0);
    const clientUuid = randomUUID();
    
    // Preliminary check
    const inbound = await this.prisma.inbound.findUnique({ where: { id: data.inboundId } });
    if (!inbound) throw new BadRequestException('Inbound not found');
    
    if (data.flow) {
      const streamSettings = inbound.streamSettings as any;
      if (inbound.protocol !== 'vless' || streamSettings?.security !== 'reality') {
        throw new BadRequestException('Flow is only supported on VLESS Reality inbounds');
      }
    }
    const caller = await this.prisma.admin.findUnique({ 
      where: { id: callerId },
      include: { _count: { select: { clients: true } } }
    });
    if (!caller) throw new BadRequestException('Admin not found');
    
    // Determine target owner
    let targetAdminId = callerId;
    let targetAdmin = caller;
    
    if (caller.role === 'SUPER_ADMIN' && data.adminId) {
      targetAdminId = data.adminId;
      const explicitTarget = await this.prisma.admin.findUnique({ 
        where: { id: targetAdminId },
        include: { _count: { select: { clients: true } } }
      });
      if (!explicitTarget) throw new BadRequestException('Target Admin not found');
      targetAdmin = explicitTarget;
    }
    
    if (caller.role !== 'SUPER_ADMIN') {
      if (caller.trafficMode === 'ALLOCATION') {
        if (caller.balance < Number(totalBytes)) {
          throw new BadRequestException('Insufficient traffic balance');
        }
      } else if (caller.trafficMode === 'USAGE') {
        if (caller.balance <= 0) {
          throw new BadRequestException('Insufficient traffic balance. Cannot create clients when balance is zero or below.');
        }
      }
    }

    if (targetAdmin.maxClients > 0 && targetAdmin._count.clients >= targetAdmin.maxClients) {
      throw new BadRequestException(`Client limit reached. Maximum allowed: ${targetAdmin.maxClients}`);
    }

    const existingClient = await this.prisma.client.findFirst({ where: { email: data.email } });
    if (existingClient) {
      throw new BadRequestException(`Email "${data.email}" is already in use.`);
    }

    const clientSubId = require('crypto').randomBytes(8).toString('hex');

    // Attempt to add client to panel API first
    const clientPayload: any = {
      id: clientUuid,
      subId: clientSubId,
      email: data.email,
      enable: true,
      flow: data.flow || "",
      totalGB: Number(data.total) || 0,
      expiryTime: data.expiryTime || 0,
    };

    if (targetAdmin.xuiGroupId) {
      clientPayload.tgId = targetAdmin.xuiGroupId; // Commonly used in 3x-ui for grouping
      // Some newer forks might use 'groupId' or something else, but tgId is common in Sanaei.
      // Or we can just pass tgId to be safe. We also might pass groupId if that becomes standard.
      clientPayload.groupId = targetAdmin.xuiGroupId;
    }

    await this.panelsService.addClient(inbound.panelId, inbound.port, {
      clients: [clientPayload]
    });

    return this.prisma.$transaction(async (tx) => {
      // Re-fetch caller to lock balance during transaction
      const lockedCaller = await tx.admin.findUnique({ where: { id: callerId } });
      if (!lockedCaller) throw new BadRequestException('Admin not found');
      if (lockedCaller.role !== 'SUPER_ADMIN') {
        if (lockedCaller.trafficMode === 'ALLOCATION') {
          if (lockedCaller.balance < Number(totalBytes)) {
             throw new BadRequestException('Insufficient traffic balance');
          }
          await tx.admin.update({
            where: { id: callerId },
            data: { balance: lockedCaller.balance - Number(totalBytes) }
          });
        } else if (lockedCaller.trafficMode === 'USAGE') {
          if (lockedCaller.balance <= 0) {
            throw new BadRequestException('Insufficient traffic balance. Cannot create clients when balance is zero or below.');
          }
        }
      }

      const client = await tx.client.create({
        data: {
          adminId: targetAdminId,
          inboundId: data.inboundId,
          email: data.email,
          remark: data.remark,
          uuid: clientUuid,
          subId: clientSubId,
          subToken: crypto.randomBytes(5).toString('hex'),
          flow: data.flow,
          total: totalBytes,
          expiryTime: BigInt(data.expiryTime || 0),
        },
        include: {
          inbound: { select: { id: true, tag: true, port: true, protocol: true, panel: { select: { id: true, name: true, url: true } } } }
        }
      });

      if (totalBytes > 0n && lockedCaller.role !== 'SUPER_ADMIN' && lockedCaller.trafficMode === 'ALLOCATION') {
        await tx.trafficTransaction.create({
          data: {
            adminId: callerId,
            clientId: client.id,
            amount: totalBytes,
            type: 'DEBIT',
            description: 'Client Creation Allocation',
          }
        });
      }

      await tx.auditLog.create({
        data: { action: 'CLIENT_CREATED', entity: 'Client', entityId: client.id, adminId: callerId, details: { targetAdminId } }
      });

      return client;
    });
  }

  async findAll(adminId: string, role: string, page = 1, limit = 50, filters: ClientFilters = {}) {
    const where: Prisma.ClientWhereInput = {};

    // Resellers only see their own clients
    if (role !== 'SUPER_ADMIN') where.adminId = adminId;
    else if (filters.adminId === 'orphaned') where.adminId = null;
    else if (filters.adminId) where.adminId = filters.adminId;

    if (filters.search) where.email = { contains: filters.search, mode: 'insensitive' };
    if (filters.inboundId) where.inboundId = filters.inboundId;
    if (filters.panelId) where.inbound = { panelId: filters.panelId };

    const now = BigInt(Date.now());
    if (filters.status === 'active') {
      where.enable = true;
      where.OR = [{ expiryTime: 0n }, { expiryTime: { gt: now } }];
    } else if (filters.status === 'disabled') {
      where.enable = false;
    } else if (filters.status === 'expired') {
      where.expiryTime = { gt: 0n, lt: now };
    } else if (filters.status === 'expiring-soon') {
      where.expiryTime = { gt: now, lte: now + BigInt(7 * 24 * 3600 * 1000) };
    } else if (filters.status === 'traffic-low') {
      const rawIds = await this.prisma.$queryRaw<{id: string}[]>`
        SELECT id FROM "Client"
        WHERE total > 0 AND (up + down) < total AND ((up + down)::float / total::float) >= 0.8
        ${role !== 'SUPER_ADMIN' ? Prisma.sql`AND "adminId" = ${adminId}` : Prisma.empty}
      `;
      where.id = { in: rawIds.map(r => r.id) };
    } else if (filters.status === 'depleted') {
      const rawIds = await this.prisma.$queryRaw<{id: string}[]>`
        SELECT id FROM "Client"
        WHERE total > 0 AND (up + down) >= total
        ${role !== 'SUPER_ADMIN' ? Prisma.sql`AND "adminId" = ${adminId}` : Prisma.empty}
      `;
      where.id = { in: rawIds.map(r => r.id) };
    }

    if (filters.expiry === 'never') {
      where.expiryTime = 0n;
    } else if (filters.expiry === 'expired') {
      where.expiryTime = { gt: 0n, lt: now };
    } else if (filters.expiry === '7d') {
      where.expiryTime = { gt: now, lte: now + BigInt(7 * 24 * 3600 * 1000) };
    } else if (filters.expiry === '30d') {
      where.expiryTime = { gt: now, lte: now + BigInt(30 * 24 * 3600 * 1000) };
    }

    if (filters.trafficRange === '0-10gb') {
      where.total = { gt: 0n, lte: BigInt(10 * GB) };
    } else if (filters.trafficRange === '10-50gb') {
      where.total = { gt: BigInt(10 * GB), lte: BigInt(50 * GB) };
    } else if (filters.trafficRange === '50-100gb') {
      where.total = { gt: BigInt(50 * GB), lte: BigInt(100 * GB) };
    } else if (filters.trafficRange === '100gb+') {
      where.total = { gt: BigInt(100 * GB) };
    } else if (filters.trafficRange === 'unlimited') {
      where.total = 0n;
    }

    const [data, total] = await Promise.all([
      this.prisma.client.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, email: true, remark: true, ownerTag: true, uuid: true, subId: true, enable: true, flow: true,
          up: true, down: true, total: true, expiryTime: true, createdAt: true,
          admin: { select: { id: true, username: true } },
          inbound: { select: { id: true, tag: true, port: true, protocol: true, streamSettings: true, panel: { select: { id: true, name: true, url: true, subUrl: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.client.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async findOne(id: string, adminId: string, role: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        admin: { select: { id: true, username: true } },
        inbound: { select: { id: true, panelId: true, tag: true, port: true, protocol: true, streamSettings: true, panel: { select: { id: true, name: true, url: true, subUrl: true } } } },
      },
    });
    if (!client) throw new NotFoundException('Client not found');
    if (role !== 'SUPER_ADMIN' && client.adminId !== adminId) throw new ForbiddenException();
    return client;
  }

  async getQrCode(id: string, adminId: string, role: string) {
    const client = await this.findOne(id, adminId, role);
    const subUrlBase = client.inbound?.panel?.subUrl || client.inbound?.panel?.url || 'http://localhost';
    const subUrl = `${subUrlBase}/sub/${client.subId || client.email}`;
    
    try {
      const qrDataUrl = await QRCode.toDataURL(subUrl, { width: 300, margin: 2 });
      return { qrCode: qrDataUrl };
    } catch (e) {
      throw new BadRequestException('Failed to generate QR code');
    }
  }

  async update(id: string, adminId: string, role: string, data: { enable?: boolean; total?: number; expiryTime?: number; remark?: string; flow?: string }) {
    const existing = await this.findOne(id, adminId, role);
    const inbound = existing.inbound as any;
    
    if (data.flow) {
      const streamSettings = inbound?.streamSettings as any;
      if (inbound?.protocol !== 'vless' || streamSettings?.security !== 'reality') {
        throw new BadRequestException('Flow is only supported on VLESS Reality inbounds');
      }
    }

    // Prepare new values for panel API
    const newEnable = data.enable !== undefined ? data.enable : existing.enable;
    const newTotal = data.total !== undefined ? BigInt(data.total) : existing.total;
    const newExpiry = data.expiryTime !== undefined ? BigInt(data.expiryTime) : existing.expiryTime;
    const newFlow = data.flow !== undefined ? data.flow : existing.flow;

    const usedTraffic = existing.up + existing.down;
    
    if (newTotal > 0n && newTotal < usedTraffic) {
      throw new BadRequestException('Traffic allocation cannot be lower than consumed traffic.');
    }

    if (newTotal < existing.total && usedTraffic > 0n) {
      throw new BadRequestException('Traffic decrease is not allowed because the client has already consumed traffic.');
    }

    const clientPayload: any = {
      id: existing.uuid,
      subId: existing.subId || undefined,
      email: existing.email,
      enable: newEnable,
      flow: newFlow || "",
      totalGB: Number(newTotal),
      expiryTime: Number(newExpiry),
    };

    if (existing.adminId) {
      const dbAdmin = await this.prisma.admin.findUnique({ where: { id: existing.adminId }});
      if (dbAdmin && dbAdmin.xuiGroupId) {
        clientPayload.tgId = dbAdmin.xuiGroupId;
        clientPayload.groupId = dbAdmin.xuiGroupId;
      }
    }

    // Call Panel API First
    await this.panelsService.updateClient(inbound.panelId, inbound.port, existing.uuid, clientPayload);
    
    return this.prisma.$transaction(async (tx) => {
      const updateData: Prisma.ClientUpdateInput = {};
      if (data.enable !== undefined) {
        updateData.enable = data.enable;
        updateData.disableReason = data.enable ? null : 'MANUAL';
      }
      if (data.expiryTime !== undefined) updateData.expiryTime = newExpiry;
      if (data.remark !== undefined) updateData.remark = data.remark;
      if (data.flow !== undefined) updateData.flow = data.flow;

      let diff = 0n;
      let previousAllocation = existing.total;
      let newAllocation = newTotal;

      if (data.total !== undefined && newAllocation !== existing.total) {
        diff = newAllocation - existing.total;
        updateData.total = newAllocation;

        if (existing.adminId) {
          const admin = await tx.admin.findUnique({ where: { id: existing.adminId } });
          if (admin && admin.trafficMode === 'ALLOCATION') {
            if (diff > 0n) {
              if (admin.balance < Number(diff)) throw new BadRequestException('Insufficient traffic balance');
              await tx.admin.update({ where: { id: admin.id }, data: { balance: admin.balance - Number(diff) } });
            } else if (diff < 0n) {
              await tx.admin.update({ where: { id: admin.id }, data: { balance: admin.balance + Math.abs(Number(diff)) } });
            }
          }

          if (admin && admin.trafficMode === 'ALLOCATION' && diff !== 0n) {
            await tx.trafficTransaction.create({
              data: {
                adminId: admin.id,
                clientId: id,
                amount: diff > 0n ? diff : -diff,
                type: diff > 0n ? 'DEBIT' : 'CREDIT',
                description: diff > 0n ? 'Client Traffic Increase' : 'Client Traffic Decrease',
              }
            });
          }
        }
      }

      const client = await tx.client.update({ where: { id }, data: updateData });
      await tx.auditLog.create({
        data: {
          action: 'CLIENT_UPDATED',
          entity: 'Client',
          entityId: id,
          adminId,
          details: {
            previousAllocation: previousAllocation.toString(),
            newAllocation: newAllocation.toString(),
            trafficDifference: diff.toString()
          }
        }
      });
      return client;
    });
  }

  async remove(id: string, adminId: string, role: string, skipRefund: boolean = false) {
    const existing = await this.findOne(id, adminId, role);
    const inbound = existing.inbound as any;
    
    await this.panelsService.delClient(inbound.panelId, inbound.port, existing.uuid);
    
    return this.prisma.$transaction(async (tx) => {
      if (existing.adminId && !skipRefund) {
        const admin = await tx.admin.findUnique({ where: { id: existing.adminId } });
        if (admin && admin.trafficMode === 'ALLOCATION') {
          const used = existing.up + existing.down;
          const remaining = existing.total - used;
          if (remaining > 0n) {
            await tx.admin.update({ where: { id: admin.id }, data: { balance: admin.balance + Number(remaining) } });
            await tx.trafficTransaction.create({
              data: {
                adminId: admin.id,
                clientId: id,
                amount: remaining,
                type: 'CREDIT',
                description: 'Client Deletion Refund',
              }
            });
          }
        }
      }

      await tx.client.delete({ where: { id } });
      await tx.auditLog.create({ 
        data: { 
          action: skipRefund ? 'CLIENT_CLEANUP' : 'CLIENT_DELETED', 
          entity: 'Client', 
          entityId: id, 
          adminId 
        } 
      });
      return { deleted: true };
    });
  }

  async resetUsage(id: string, adminId: string, role: string) {
    if (role !== 'SUPER_ADMIN') throw new BadRequestException('Only Super Admin can reset traffic usage');
    const existing = await this.findOne(id, adminId, role);
    const inbound = existing.inbound as any;
    
    await this.panelsService.resetClientTraffic(inbound.panelId, inbound.port, existing.email);
    
    return this.prisma.$transaction(async (tx) => {
      const used = existing.up + existing.down;
      if (used > 0n) {
        await tx.trafficTransaction.create({
          data: {
            adminId: existing.adminId || adminId,
            clientId: id,
            amount: used,
            type: 'USAGE_CHARGE',
            description: 'Historical Usage Archived via Reset',
          }
        });
      }

      await tx.client.update({ where: { id }, data: { up: 0n, down: 0n } });
      await tx.auditLog.create({ 
        data: { 
          action: 'RESET_USAGE', 
          entity: 'Client', 
          adminId,
          details: { equivalentTrafficRestored: used.toString() } 
        } 
      });
    });
  }

  /** Bulk operations, scoped to the caller's ownership when a reseller. */
  async bulk(
    adminId: string,
    role: string,
    dto: { ids: string[]; action: 'enable' | 'disable' | 'delete' | 'cleanup' | 'addTraffic' | 'addDays' | 'resetUsage'; value?: number },
  ) {
    if (!dto.ids?.length) throw new BadRequestException('No clients selected');

    const scope: Prisma.ClientWhereInput = { id: { in: dto.ids } };
    if (role !== 'SUPER_ADMIN') scope.adminId = adminId;

    const targets = await this.prisma.client.findMany({ where: scope });
    const ids = targets.map((t) => t.id);
    if (!ids.length) return { affected: 0 };

    for (const t of targets) {
      switch (dto.action) {
        case 'enable':
          await this.update(t.id, adminId, role, { enable: true });
          break;
        case 'disable':
          await this.update(t.id, adminId, role, { enable: false });
          break;
        case 'delete':
          await this.remove(t.id, adminId, role);
          break;
        case 'cleanup':
          await this.remove(t.id, adminId, role, true);
          break;
        case 'addTraffic': {
          const bytes = BigInt(Math.round((dto.value ?? 0) * GB));
          if (bytes > 0n) {
            await this.update(t.id, adminId, role, { total: Number(t.total + bytes) });
          }
          break;
        }
        case 'addDays': {
          const ms = BigInt((dto.value ?? 0) * 24 * 60 * 60 * 1000);
          const now = BigInt(Date.now());
          const base = t.expiryTime > 0n ? t.expiryTime : now;
          await this.update(t.id, adminId, role, { expiryTime: Number(base + ms) });
          break;
        }
        case 'resetUsage': {
          await this.resetUsage(t.id, adminId, role);
          break;
        }
        default:
          throw new BadRequestException('Unknown action');
      }
    }
    
    return { affected: ids.length };
  }

  async getCleanupCandidates(adminId: string, role: string) {
    const thresholdSetting = await this.prisma.systemSetting.findUnique({ where: { key: 'cleanup_threshold_days' } });
    const thresholdDays = thresholdSetting ? Number(thresholdSetting.value.replace(/"/g, '')) || 30 : 30;
    const thresholdMs = thresholdDays * 24 * 60 * 60 * 1000;
    const now = BigInt(Date.now());

    const where: Prisma.ClientWhereInput = {
      expiryTime: { gt: 0n, lt: now - BigInt(thresholdMs) }
    };
    if (role !== 'SUPER_ADMIN') {
      where.adminId = adminId;
    }

    return this.prisma.client.findMany({
      where,
      select: {
        id: true, email: true, remark: true, ownerTag: true, uuid: true, subId: true, enable: true, flow: true,
        up: true, down: true, total: true, expiryTime: true, createdAt: true,
        admin: { select: { id: true, username: true } },
        inbound: { select: { id: true, tag: true, panel: { select: { id: true, name: true, url: true, subUrl: true } } } },
      },
      orderBy: { expiryTime: 'asc' },
    });
  }
}
