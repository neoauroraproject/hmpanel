import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { randomUUID } from 'crypto';
import * as QRCode from 'qrcode';
import { PanelsService } from '../panels/panels.service';
import { BulkCreateClientDto, BulkClientDto } from './dto/client.dto';

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

  async create(callerId: string, data: { email: string; inboundIds: string[]; remark?: string; total?: number; expiryTime?: number; flow?: string; adminId?: string }) {
    if (data.email) data.email = data.email.trim();
    const totalBytes = BigInt(data.total || 0);
    const clientUuid = randomUUID();
    
    // Preliminary check
    const inbounds = await this.prisma.inbound.findMany({
      where: { id: { in: data.inboundIds } },
      include: { panel: true }
    });
    if (!inbounds || inbounds.length === 0) throw new BadRequestException('No inbounds found');
    
    if (data.flow) {
      for (const inbound of inbounds) {
        const streamSettings = inbound.streamSettings as any;
        if (inbound.protocol !== 'vless' || streamSettings?.security !== 'reality') {
          throw new BadRequestException('Flow is only supported on VLESS Reality inbounds');
        }
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
      limitIp: 0,
      tgId: "",
      comment: "",
      reset: 0,
    };

    for (const inbound of inbounds) {
      await this.panelsService.addClient(inbound.panelId, inbound.port, {
        clients: [clientPayload]
      });

      // Assign client to reseller's native 3x-ui group (auto-creates group if needed)
      await this.panelsService.assignClientToGroup(
        inbound.panelId, [data.email], targetAdmin.username
      );
    }

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
          email: data.email,
          remark: data.remark,
          uuid: clientUuid,
          subId: clientSubId,
          subToken: crypto.randomBytes(5).toString('hex'),
          flow: data.flow,
          total: totalBytes,
          expiryTime: BigInt(data.expiryTime || 0),
          inbounds: {
            create: data.inboundIds.map(inboundId => ({ inboundId }))
          }
        },
        include: {
          inbounds: {
            select: {
              inbound: {
                select: {
                  id: true,
                  tag: true,
                  port: true,
                  protocol: true,
                  panel: {
                    select: {
                      id: true,
                      name: true,
                      url: true,
                      subUrl: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      const mappedClient = {
        ...client,
        inbound: client.inbounds?.[0]?.inbound || null,
        inbounds: client.inbounds?.map(ci => ci.inbound) || []
      };

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

      return mappedClient;
    });
  }

  async findAll(adminId: string, role: string, page = 1, limit = 50, filters: ClientFilters = {}) {
    const where: Prisma.ClientWhereInput = {};

    // Resellers only see their own clients
    if (role !== 'SUPER_ADMIN') where.adminId = adminId;
    else if (filters.adminId === 'orphaned') where.adminId = null;
    else if (filters.adminId) where.adminId = filters.adminId;

    if (filters.search) where.email = { contains: filters.search, mode: 'insensitive' };
    if (filters.inboundId) {
      where.inbounds = {
        some: {
          inboundId: filters.inboundId
        }
      };
    }
    if (filters.panelId) {
      where.inbounds = {
        some: {
          inbound: {
            panelId: filters.panelId
          }
        }
      };
    }

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
          inbounds: {
            select: {
              inbound: {
                select: {
                  id: true,
                  tag: true,
                  port: true,
                  protocol: true,
                  streamSettings: true,
                  panel: { select: { id: true, name: true, url: true, subUrl: true } }
                }
              }
            }
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.client.count({ where }),
    ]);

    const mappedData = data.map(client => ({
      ...client,
      inbound: client.inbounds?.[0]?.inbound || null,
      inbounds: client.inbounds?.map(ci => ci.inbound) || []
    }));

    return { data: mappedData, total, page, limit };
  }

  async findOne(id: string, adminId: string, role: string) {
    const client = await this.prisma.client.findUnique({
      where: { id },
      include: {
        admin: { select: { id: true, username: true } },
        inbounds: {
          select: {
            inbound: {
              select: {
                id: true,
                panelId: true,
                tag: true,
                port: true,
                protocol: true,
                streamSettings: true,
                panel: { select: { id: true, name: true, url: true, subUrl: true } }
              }
            }
          }
        }
      },
    });
    if (!client) throw new NotFoundException('Client not found');
    if (role !== 'SUPER_ADMIN' && client.adminId !== adminId) throw new ForbiddenException();

    return {
      ...client,
      inbound: client.inbounds?.[0]?.inbound || null,
      inbounds: client.inbounds?.map(ci => ci.inbound) || []
    };
  }

  async getQrCode(id: string, adminId: string, role: string) {
    const client = await this.findOne(id, adminId, role);
    const subUrlBase = client.inbound?.panel?.subUrl || client.inbound?.panel?.url || 'http://localhost';
    
    let subUrl = '';
    try {
      const pUrl = new URL(subUrlBase);
      const pathname = pUrl.pathname.endsWith('/sub/') ? pUrl.pathname : `${pUrl.pathname.replace(/\/$/, '')}/sub/`;
      subUrl = `${pUrl.origin}${pathname}${encodeURIComponent(client.subId || client.email)}`;
    } catch {
      const base = subUrlBase.endsWith('/') ? subUrlBase : `${subUrlBase}/`;
      if (base.includes('/sub/')) {
        subUrl = `${base}${encodeURIComponent(client.subId || client.email)}`;
      } else {
        subUrl = `${base}sub/${encodeURIComponent(client.subId || client.email)}`;
      }
    }
    
    try {
      const qrDataUrl = await QRCode.toDataURL(subUrl, { width: 300, margin: 2 });
      return { qrCode: qrDataUrl };
    } catch (e) {
      throw new BadRequestException('Failed to generate QR code');
    }
  }

  async update(id: string, adminId: string, role: string, data: { enable?: boolean; total?: number; expiryTime?: number; remark?: string; flow?: string }) {
    const existing = await this.findOne(id, adminId, role);
    
    if (data.flow) {
      for (const inbound of existing.inbounds) {
        const streamSettings = inbound?.streamSettings as any;
        if (inbound?.protocol !== 'vless' || streamSettings?.security !== 'reality') {
          throw new BadRequestException('Flow is only supported on VLESS Reality inbounds');
        }
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
      subId: existing.subId || "",
      email: existing.email.trim(),
      enable: newEnable,
      flow: newFlow || "",
      totalGB: Number(newTotal),
      expiryTime: Number(newExpiry),
      tgId: "",
    };

    // Call Panel API First for all attached inbounds
    for (const inbound of existing.inbounds) {
      try {
        await this.panelsService.updateClient(inbound.panelId, inbound.port, existing.uuid, clientPayload);
      } catch (err: any) {
        console.error(`Failed to update client ${existing.email} on panel inbound ${inbound.id}:`, err.message);
      }
    }
    
    return this.prisma.$transaction(async (tx) => {
      const updateData: Prisma.ClientUpdateInput = {};
      if (existing.email !== existing.email.trim()) {
        updateData.email = existing.email.trim();
      }
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
    
    for (const inbound of existing.inbounds) {
      try {
        await this.panelsService.delClient(inbound.panelId, inbound.port, existing.uuid);
      } catch (err: any) {
        console.error(`Failed to delete client ${existing.email} from panel inbound ${inbound.id}:`, err.message);
      }
    }
    
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
    
    for (const inbound of existing.inbounds) {
      try {
        await this.panelsService.resetClientTraffic(inbound.panelId, inbound.port, existing.email);
      } catch (err: any) {
        console.error(`Failed to reset traffic for client ${existing.email} on panel inbound ${inbound.id}:`, err.message);
      }
    }
    
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

  async getGroups(adminId: string, role: string) {
    const panels = await this.prisma.panel.findMany({ select: { id: true } });
    const uniqueGroups = new Set<string>();

    for (const panel of panels) {
      try {
        const groups = await this.panelsService.listGroups(panel.id);
        for (const g of groups) {
          if (g && g.name) {
            uniqueGroups.add(g.name);
          }
        }
      } catch (err) {
        // Ignore panel list errors
      }
    }
    return Array.from(uniqueGroups).sort();
  }

  async validateBulkCreate(callerId: string, role: string, dto: BulkCreateClientDto) {
    const count = dto.endNumber - dto.startNumber + 1;
    if (count <= 0) throw new BadRequestException('Invalid start or end number');
    if (count > 1000) throw new BadRequestException('Bulk creation limit is 1000 clients per request');

    const emails = [];
    const sep = dto.separator === 'None' ? '' : (dto.separator || '');
    for (let i = dto.startNumber; i <= dto.endNumber; i++) {
      emails.push(`${dto.prefix}${sep}${i}`);
    }

    const duplicates = await this.prisma.client.findMany({
      where: { email: { in: emails } },
      select: { email: true }
    });

    const duplicateEmails = duplicates.map(d => d.email);
    const estimatedTimeMs = count * 20 + 300; // 20ms per client + base overhead

    return {
      valid: duplicateEmails.length === 0,
      count,
      duplicateEmails,
      estimatedTimeMs,
      preview: emails.slice(0, 5),
    };
  }

  async bulkCreate(callerId: string, role: string, dto: BulkCreateClientDto) {
    const inbounds = await this.prisma.inbound.findMany({
      where: { id: { in: dto.inboundIds } },
      include: { panel: true }
    });
    if (!inbounds || inbounds.length === 0) throw new BadRequestException('No inbounds found');

    const caller = await this.prisma.admin.findUnique({ 
      where: { id: callerId },
      include: { _count: { select: { clients: true } } }
    });
    if (!caller) throw new BadRequestException('Admin not found');
    
    let targetAdminId = callerId;
    let targetAdmin = caller;
    
    if (caller.role === 'SUPER_ADMIN' && dto.adminId) {
      targetAdminId = dto.adminId;
      const explicitTarget = await this.prisma.admin.findUnique({ 
        where: { id: targetAdminId },
        include: { _count: { select: { clients: true } } }
      });
      if (!explicitTarget) throw new BadRequestException('Target Admin not found');
      targetAdmin = explicitTarget;
    }

    const count = dto.endNumber - dto.startNumber + 1;
    if (count <= 0) throw new BadRequestException('Invalid start or end number');
    if (count > 1000) throw new BadRequestException('Bulk creation limit is 1000 clients per request');

    if (targetAdmin.maxClients > 0 && targetAdmin._count.clients + count > targetAdmin.maxClients) {
      throw new BadRequestException(`Client limit reached. Maximum allowed: ${targetAdmin.maxClients}. Current: ${targetAdmin._count.clients}`);
    }

    const totalBytesPerClient = BigInt(dto.total || 0);
    const totalBytesRequired = totalBytesPerClient * BigInt(count);

    if (caller.role !== 'SUPER_ADMIN') {
      if (caller.trafficMode === 'ALLOCATION') {
        if (caller.balance < Number(totalBytesRequired)) {
          throw new BadRequestException('Insufficient traffic balance');
        }
      } else if (caller.trafficMode === 'USAGE') {
        if (caller.balance <= 0) {
          throw new BadRequestException('Insufficient traffic balance. Cannot create clients when balance is zero or below.');
        }
      }
    }

    if (dto.flow) {
      for (const inbound of inbounds) {
        const streamSettings = inbound.streamSettings as any;
        if (inbound.protocol !== 'vless' || streamSettings?.security !== 'reality') {
          throw new BadRequestException('Flow is only supported on VLESS Reality inbounds');
        }
      }
    }

    const emails = [];
    const sep = dto.separator === 'None' ? '' : (dto.separator || '');
    for (let i = dto.startNumber; i <= dto.endNumber; i++) {
      emails.push(`${dto.prefix}${sep}${i}`);
    }

    const existingClient = await this.prisma.client.findFirst({
      where: { email: { in: emails } }
    });
    if (existingClient) {
      throw new BadRequestException(`Email "${existingClient.email}" is already in use.`);
    }

    const clientPayloads: any[] = [];
    const clientsDbData: any[] = [];

    for (const email of emails) {
      const clientUuid = crypto.randomUUID();
      const clientSubId = crypto.randomBytes(8).toString('hex');
      const clientSubToken = crypto.randomBytes(5).toString('hex');

      clientPayloads.push({
        id: clientUuid,
        subId: clientSubId,
        email: email,
        enable: dto.enable !== false,
        flow: dto.flow || "",
        totalGB: Number(dto.total) || 0,
        expiryTime: dto.expiryTime || 0,
        limitIp: 0,
        tgId: 0,
        comment: dto.remark || "",
        reset: 0,
        security: "auto",
      });

      clientsDbData.push({
        adminId: targetAdminId,
        email: email,
        remark: dto.remark,
        uuid: clientUuid,
        subId: clientSubId,
        subToken: clientSubToken,
        flow: dto.flow,
        total: totalBytesPerClient,
        expiryTime: BigInt(dto.expiryTime || 0),
        enable: dto.enable !== false,
      });
    }

    // 1. Add to Panel
    for (const inbound of inbounds) {
      await this.panelsService.addClient(inbound.panelId, inbound.port, {
        clients: clientPayloads
      });

      // 2. Assign to reseller Group
      const groupName = dto.group || targetAdmin.username;
      await this.panelsService.assignClientToGroup(
        inbound.panelId, emails, groupName
      );
    }

    // 3. Save to local DB in transaction
    const createdClients = await this.prisma.$transaction(async (tx) => {
      if (caller.role !== 'SUPER_ADMIN' && caller.trafficMode === 'ALLOCATION') {
        const lockedCaller = await tx.admin.findUnique({ where: { id: callerId } });
        if (!lockedCaller) throw new BadRequestException('Admin not found');
        if (lockedCaller.balance < Number(totalBytesRequired)) {
          throw new BadRequestException('Insufficient traffic balance');
        }
        await tx.admin.update({
          where: { id: callerId },
          data: { balance: lockedCaller.balance - Number(totalBytesRequired) }
        });
      }

      const result = [];
      for (const clientData of clientsDbData) {
        const c = await tx.client.create({
          data: {
            ...clientData,
            inbounds: {
              create: dto.inboundIds.map(inboundId => ({ inboundId }))
            }
          }
        });
        result.push(c);
      }

      if (totalBytesRequired > 0n && caller.role !== 'SUPER_ADMIN' && caller.trafficMode === 'ALLOCATION') {
        await tx.trafficTransaction.create({
          data: {
            adminId: callerId,
            amount: totalBytesRequired,
            type: 'DEBIT',
            description: `Bulk Client Creation (${count} clients)`,
          }
        });
      }

      await tx.auditLog.create({
        data: {
          action: 'BULK_CLIENT_CREATED',
          entity: 'Client',
          adminId: callerId,
          details: { count, targetAdminId, prefix: dto.prefix }
        }
      });

      return result;
    });

    return { success: true, count: createdClients.length };
  }

  /** Bulk operations, scoped to the caller's ownership when a reseller. */
  async bulk(
    adminId: string,
    role: string,
    dto: BulkClientDto,
  ) {
    if (!dto.ids?.length) throw new BadRequestException('No clients selected');

    const scope: Prisma.ClientWhereInput = { id: { in: dto.ids } };
    if (role !== 'SUPER_ADMIN') scope.adminId = adminId;

    const targets = await this.prisma.client.findMany({ where: scope });
    if (!targets.length) return { affected: 0 };

    const results = { success: 0, failed: 0, errors: [] as string[] };

    // Up-front balance checks for traffic addition
    if (dto.action === 'addTraffic') {
      const bytesToAddPerClient = BigInt(Math.round((dto.value ?? 0) * GB));
      const totalRequired = bytesToAddPerClient * BigInt(targets.length);

      const caller = await this.prisma.admin.findUnique({ where: { id: adminId } });
      if (caller && caller.role !== 'SUPER_ADMIN' && caller.trafficMode === 'ALLOCATION') {
        if (caller.balance < Number(totalRequired)) {
          throw new BadRequestException(`Insufficient balance to add traffic. Required: ${Number(totalRequired) / GB} GB, Available: ${caller.balance / GB} GB`);
        }
      }
    }

    if (dto.action === 'assignGroup') {
      if (!dto.groupName) throw new BadRequestException('Group name is required');
      
      const panelClients = new Map<string, string[]>();
      for (const t of targets) {
        const clientWithInbounds = await this.prisma.client.findUnique({
          where: { id: t.id },
          include: {
            inbounds: {
              include: {
                inbound: true
              }
            }
          }
        });
        if (clientWithInbounds?.inbounds) {
          for (const ci of clientWithInbounds.inbounds) {
            if (ci.inbound) {
              const panelId = ci.inbound.panelId;
              if (!panelClients.has(panelId)) panelClients.set(panelId, []);
              const list = panelClients.get(panelId)!;
              if (!list.includes(t.email)) {
                list.push(t.email);
              }
            }
          }
        }
      }

      for (const [panelId, emails] of panelClients.entries()) {
        try {
          await this.panelsService.assignClientToGroup(panelId, emails, dto.groupName);
          results.success += emails.length;
        } catch (err: any) {
          results.failed += emails.length;
          results.errors.push(`Panel ${panelId}: ${err.message}`);
        }
      }
    } else {
      // Process sequential operations in parallel batches of 10
      const batchSize = 10;
      for (let i = 0; i < targets.length; i += batchSize) {
        const batch = targets.slice(i, i + batchSize);
        await Promise.all(
          batch.map(async (t) => {
            try {
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
                case 'resetUsage':
                case 'resetTraffic': {
                  await this.resetUsage(t.id, adminId, role);
                  break;
                }
              }
              results.success++;
            } catch (err: any) {
              results.failed++;
              results.errors.push(`${t.email}: ${err.message}`);
            }
          })
        );
      }
    }

    // Write audit log
    await this.prisma.auditLog.create({
      data: {
        action: `BULK_${dto.action.toUpperCase()}`,
        entity: 'Client',
        adminId,
        details: {
          count: targets.length,
          success: results.success,
          failed: results.failed,
          errors: results.errors,
          value: dto.value,
          groupName: dto.groupName,
        }
      }
    });

    if (results.failed > 0) {
      return {
        affected: results.success,
        failed: results.failed,
        errors: results.errors,
      };
    }

    return { affected: results.success };
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

    const candidates = await this.prisma.client.findMany({
      where,
      select: {
        id: true, email: true, remark: true, ownerTag: true, uuid: true, subId: true, enable: true, flow: true,
        up: true, down: true, total: true, expiryTime: true, createdAt: true,
        admin: { select: { id: true, username: true } },
        inbounds: {
          select: {
            inbound: {
              select: {
                id: true,
                tag: true,
                panel: { select: { id: true, name: true, url: true, subUrl: true } }
              }
            }
          }
        },
      },
      orderBy: { expiryTime: 'asc' },
    });

    return candidates.map(client => ({
      ...client,
      inbound: client.inbounds?.[0]?.inbound || null,
      inbounds: client.inbounds?.map(ci => ci.inbound) || []
    }));
  }
}
