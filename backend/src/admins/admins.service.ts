import { Injectable, ConflictException, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PanelsService } from '../panels/panels.service';
import { StoreService } from '../store/store.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AdminsService {
  private readonly logger = new Logger(AdminsService.name);
  constructor(private prisma: PrismaService, private panelsService: PanelsService, private storeService: StoreService) {}

  async create(data: { username: string; email: string; password: string; role?: string; trafficMode?: string; balance?: number; inboundIds?: string[]; expiryTime?: number; maxClients?: number; permissions?: string[]; storeEnabled?: boolean; storePanelId?: string }) {
    // Allow admin creation regardless of sync state since we enforce selection in the UI.

    const exists = await this.prisma.admin.findFirst({
      where: { OR: [{ username: data.username }, { email: data.email }] },
      select: { id: true },
    });
    if (exists) throw new ConflictException('Username or email already exists');

    const hash = await bcrypt.hash(data.password, 10);
    const admin = await this.prisma.admin.create({
      data: {
        username: data.username,
        email: data.email,
        passwordHash: hash,
        role: (data.role as any) || 'RESELLER',
        trafficMode: (data.trafficMode as any) || 'ALLOCATION',
        balance: data.balance || 0,
        expiryTime: data.expiryTime ? BigInt(data.expiryTime) : 0n,
        maxClients: data.maxClients || 0,
        permissions: data.permissions || [],
      },
      select: { id: true, username: true, email: true, role: true, balance: true, trafficMode: true, status: true, expiryTime: true, maxClients: true, permissions: true, createdAt: true },
    });

    if (data.inboundIds?.length) {
      await this.prisma.adminInbound.createMany({
        data: data.inboundIds.map((inboundId) => ({ adminId: admin.id, inboundId })),
        skipDuplicates: true,
      });
    }

    let xuiGroupId = null;
    let xuiGroupName = null;

    if (admin.role === 'RESELLER') {
      xuiGroupName = admin.username;
      // Handle naming conflicts
      const existingGroups = await this.prisma.admin.count({
        where: { xuiGroupName: { startsWith: xuiGroupName } }
      });
      if (existingGroups > 0) {
        xuiGroupName = `${xuiGroupName} (${existingGroups + 1})`;
      }

      // Try to create group in all panels, or at least log
      const panels = await this.prisma.panel.findMany({ select: { id: true } });
      xuiGroupId = xuiGroupName; // Fallback to group name as xuiGroupId if panel doesn't return one (useful for Sanaei tgId grouping)
      for (const panel of panels) {
        try {
          const res = await this.panelsService.createGroup(panel.id, xuiGroupName);
          if (res && res.obj && res.obj.id) {
            xuiGroupId = String(res.obj.id); // Or use whichever format the panel uses
          }
        } catch (err: any) {
          this.logger.warn(`Failed to create 3x-ui group for reseller ${admin.username} on panel ${panel.id}: ${err.message}`);
        }
      }

      await this.prisma.admin.update({
        where: { id: admin.id },
        data: { xuiGroupId, xuiGroupName }
      });
    }

    await this.prisma.auditLog.create({
      data: { action: 'ADMIN_CREATED', entity: 'Admin', entityId: admin.id, adminId: admin.id }
    });

    if (data.balance && data.balance > 0) {
      await this.prisma.trafficTransaction.create({
        data: {
          adminId: admin.id,
          amount: BigInt(data.balance),
          type: 'CREDIT',
          description: 'Initial Allocation',
        }
      });
    }

    if (data.storeEnabled && data.storePanelId) {
      await this.storeService.activateStoreForAdmin(admin.id, { panelId: data.storePanelId });
    }

    return { ...admin, expiryTime: Number(admin.expiryTime) };
  }

  async findAll(page = 1, limit = 50, filters: { search?: string; status?: string; inboundId?: string; panelId?: string } = {}) {
    const where: any = {};
    if (filters.search) {
      where.OR = [
        { username: { contains: filters.search, mode: 'insensitive' } },
        { email: { contains: filters.search, mode: 'insensitive' } },
      ];
    }
    if (filters.status) where.status = filters.status;
    if (filters.inboundId) {
      where.adminInbounds = { some: { inboundId: filters.inboundId } };
    }
    if (filters.panelId) {
      where.adminInbounds = { some: { inbound: { panelId: filters.panelId } } };
    }

    const [data, total] = await Promise.all([
      this.prisma.admin.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, username: true, email: true, role: true,
          balance: true, trafficMode: true, status: true, createdAt: true,
          expiryTime: true, maxClients: true, permissions: true, portalSettings: true,
          _count: { select: { clients: true } },
          clients: { select: { up: true, down: true } },
          transactions: { where: { type: 'CREDIT' }, select: { amount: true } }
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.admin.count({ where }),
    ]);

    const mappedData = data.map(admin => {
      const usedBytes = admin.clients.reduce((acc, c) => acc + c.up + c.down, 0n);
      const totalAssigned = admin.transactions.reduce((acc, t) => acc + t.amount, 0n);
      const { clients, transactions, ...rest } = admin;
      return {
        ...rest,
        expiryTime: Number(admin.expiryTime),
        usedTraffic: Number(usedBytes),
        totalAssigned: Number(totalAssigned),
      };
    });

    return { data: mappedData, total, page, limit };
  }

  async findOne(id: string) {
    const admin = await this.prisma.admin.findUnique({
      where: { id },
      select: {
        id: true, username: true, email: true, role: true,
        balance: true, trafficMode: true, status: true, createdAt: true,
        expiryTime: true, maxClients: true, permissions: true, portalSettings: true,
        xuiGroupId: true, xuiGroupName: true,
        _count: { select: { clients: true } },
        clients: { select: { up: true, down: true } },
        adminInbounds: { select: { inbound: { select: { id: true, tag: true, port: true, protocol: true, panel: { select: { id: true, name: true } } } } } },
        transactions: { where: { type: 'CREDIT' }, select: { amount: true } }
      },
    });
    if (!admin) throw new NotFoundException('Admin not found');

    const usedBytes = admin.clients.reduce((acc, c) => acc + c.up + c.down, 0n);
    const totalAssigned = admin.transactions.reduce((acc, t) => acc + t.amount, 0n);
    const { clients, transactions, ...rest } = admin;
    return {
      ...rest,
      expiryTime: Number(admin.expiryTime),
      usedTraffic: Number(usedBytes),
      totalAssigned: Number(totalAssigned),
    };
  }

  async update(id: string, data: { password?: string; email?: string; balance?: number; status?: string; trafficMode?: string; expiryTime?: number; maxClients?: number; permissions?: string[]; inboundIds?: string[]; portalSettings?: any }) {
    const existing = await this.findOne(id);
    const updateData: any = { ...data };
    
    // Explicitly delete protected/special fields
    delete updateData.username;
    delete updateData.inboundIds;
    
    if (data.password) {
      updateData.passwordHash = await bcrypt.hash(data.password, 10);
    }
    delete updateData.password;

    if (data.expiryTime !== undefined) updateData.expiryTime = BigInt(data.expiryTime);
    if (data.trafficMode !== undefined) updateData.trafficMode = data.trafficMode as never;
    if (data.portalSettings !== undefined) updateData.portalSettings = data.portalSettings;

    if (data.inboundIds !== undefined) {
      await this.prisma.adminInbound.deleteMany({ where: { adminId: id } });
      if (data.inboundIds.length > 0) {
        await this.prisma.adminInbound.createMany({
          data: data.inboundIds.map((inboundId) => ({ adminId: id, inboundId })),
          skipDuplicates: true,
        });
      }
    }

    const admin = await this.prisma.admin.update({
      where: { id },
      data: updateData,
      select: { id: true, username: true, email: true, role: true, balance: true, trafficMode: true, status: true, expiryTime: true, maxClients: true, permissions: true },
    });

    await this.prisma.auditLog.create({
      data: { action: 'ADMIN_UPDATED', entity: 'Admin', entityId: admin.id, adminId: admin.id }
    });

    if (data.balance !== undefined && data.balance !== existing.balance) {
      const diff = data.balance - existing.balance;
      await this.prisma.trafficTransaction.create({
        data: {
          adminId: admin.id,
          amount: BigInt(Math.abs(diff)),
          type: diff > 0 ? 'CREDIT' : 'DEBIT',
          description: diff > 0 ? 'Admin Recharge' : 'Admin Deduction',
        }
      });
    }

    return { ...admin, expiryTime: Number(admin.expiryTime) };
  }

  async remove(id: string) {
    const admin = await this.findOne(id);
    const clientCount = await this.prisma.client.count({ where: { adminId: id } });
    if (clientCount > 0) {
      throw new BadRequestException('Cannot delete admin with active clients');
    }
    
    await this.prisma.auditLog.create({
      data: { action: 'ADMIN_DELETED', entity: 'Admin', entityId: id }
    });

    if (admin.role === 'RESELLER' && (admin as any).xuiGroupId) {
      this.logger.warn(`Reseller ${admin.username} deleted. Group ${(admin as any).xuiGroupName} in 3x-ui has been orphaned, not deleted per policy.`);
      await this.prisma.auditLog.create({
        data: { action: 'GROUP_ORPHANED', entity: 'Admin', entityId: id, details: { groupName: (admin as any).xuiGroupName, message: 'Group was left in panel intentionally.' } }
      });
    }

    await this.prisma.admin.delete({ where: { id } });
    return { deleted: true };
  }
}
