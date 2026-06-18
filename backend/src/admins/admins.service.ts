import { Injectable, ConflictException, NotFoundException, BadRequestException, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PanelsService } from '../panels/panels.service';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class AdminsService implements OnModuleInit {
  private readonly logger = new Logger(AdminsService.name);
  constructor(private prisma: PrismaService, private panelsService: PanelsService) {}

  async onModuleInit() {
    try {
      const count = await this.prisma.admin.count();
      if (count === 0) {
        const username = process.env.INITIAL_ADMIN_USERNAME || 'admin';
        const email = process.env.INITIAL_ADMIN_EMAIL || 'admin@example.com';
        const password = process.env.INITIAL_ADMIN_PASSWORD || 'admin123';

        this.logger.log(`No admins found. Creating initial SUPER_ADMIN (${username})...`);
        const hash = await bcrypt.hash(password, 10);
        await this.prisma.admin.create({
          data: {
            username,
            email,
            passwordHash: hash,
            role: 'SUPER_ADMIN',
            balance: 0,
            status: 'active',
          },
        });
        this.logger.log('Initial SUPER_ADMIN created successfully.');
      }
    } catch (error) {
      this.logger.error('Failed to seed initial admin', error);
    }
  }

  async create(data: { username: string; email: string; password: string; role?: string; trafficMode?: string; balance?: number; inboundIds?: string[]; expiryTime?: number; maxClients?: number; permissions?: string[]; refundOnDelete?: boolean; refundOnEdit?: boolean }) {
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
        refundOnDelete: data.refundOnDelete ?? true,
        refundOnEdit: data.refundOnEdit ?? true,
      },
      select: { id: true, username: true, email: true, role: true, balance: true, trafficMode: true, status: true, expiryTime: true, maxClients: true, permissions: true, refundOnDelete: true, refundOnEdit: true, createdAt: true },
    });

    if (data.inboundIds?.length) {
      await this.prisma.adminInbound.createMany({
        data: data.inboundIds.map((inboundId) => ({ adminId: admin.id, inboundId })),
        skipDuplicates: true,
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
          action: 'ADMIN_INITIAL_ALLOCATION',
          description: 'Initial Allocation',
          balanceBefore: 0,
          balanceAfter: data.balance,
        }
      });
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
          expiryTime: true, maxClients: true, permissions: true, portalSettings: true, refundOnDelete: true, refundOnEdit: true,
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
        expiryTime: true, maxClients: true, permissions: true, portalSettings: true, refundOnDelete: true, refundOnEdit: true,
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

  async update(id: string, data: { password?: string; email?: string; balance?: number; status?: string; trafficMode?: string; expiryTime?: number; maxClients?: number; permissions?: string[]; inboundIds?: string[]; portalSettings?: any; refundOnDelete?: boolean; refundOnEdit?: boolean }) {
    const existing = await this.findOne(id);
    const updateData: any = {};
    if (data.email !== undefined) updateData.email = data.email;
    if (data.balance !== undefined) updateData.balance = data.balance;
    if (data.status !== undefined) updateData.status = data.status;
    if (data.maxClients !== undefined) updateData.maxClients = data.maxClients;
    if (data.permissions !== undefined) updateData.permissions = data.permissions;
    if (data.refundOnDelete !== undefined) updateData.refundOnDelete = data.refundOnDelete;
    if (data.refundOnEdit !== undefined) updateData.refundOnEdit = data.refundOnEdit;
    
    if (data.password) {
      updateData.passwordHash = await bcrypt.hash(data.password, 10);
    }

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

    if (data.balance !== undefined && data.balance !== existing.balance) {
      const diff = data.balance - existing.balance;
      if (diff > 0) {
        updateData.totalAssigned = { increment: Math.round(diff) };
      }
    }

    const admin = await this.prisma.admin.update({
      where: { id },
      data: updateData,
      select: { id: true, username: true, email: true, role: true, balance: true, trafficMode: true, status: true, expiryTime: true, maxClients: true, permissions: true, refundOnDelete: true, refundOnEdit: true },
    });

    await this.prisma.auditLog.create({
      data: { action: 'ADMIN_UPDATED', entity: 'Admin', entityId: admin.id, adminId: admin.id }
    });

    if (data.balance !== undefined && data.balance !== existing.balance) {
      const diff = data.balance - existing.balance;
      await this.prisma.trafficTransaction.create({
        data: {
          adminId: admin.id,
          amount: BigInt(Math.round(Math.abs(diff))),
          type: diff > 0 ? 'CREDIT' : 'DEBIT',
          action: diff > 0 ? 'ADMIN_RECHARGE' : 'ADMIN_DEDUCTION',
          description: diff > 0 ? 'Admin Recharge' : 'Admin Deduction',
          balanceBefore: existing.balance,
          balanceAfter: data.balance,
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

    if (admin.role === 'RESELLER') {
      this.logger.warn(`Reseller ${admin.username} deleted. Group ${admin.username} in 3x-ui has been orphaned, not deleted per policy.`);
      await this.prisma.auditLog.create({
        data: { action: 'GROUP_ORPHANED', entity: 'Admin', entityId: id, details: { groupName: admin.username, message: 'Group was left in panel intentionally.' } }
      });
    }

    await this.prisma.admin.delete({ where: { id } });
    return { deleted: true };
  }

  /** Fix a migrated admin: set balance from trafficPool or provided value, set up adminInbounds */
  async fixMigratedAdmin(id: string, data: { balanceGb?: number; inboundIds?: string[] }) {
    const admin = await this.findOne(id);
    const updateData: any = {};

    // Set balance
    if (data.balanceGb !== undefined && data.balanceGb > 0) {
      const newBalance = Math.round(data.balanceGb * 1024 * 1024 * 1024);
      updateData.balance = newBalance;

      // Create a CREDIT transaction if admin has no transactions
      const existingTx = await this.prisma.trafficTransaction.count({ where: { adminId: id, type: 'CREDIT' } });
      if (existingTx === 0) {
        await this.prisma.trafficTransaction.create({
          data: {
            adminId: id,
            amount: BigInt(newBalance),
            type: 'CREDIT',
            action: 'MIGRATION_FIX_BALANCE',
            description: 'Migration Fix — Manual Balance Set',
            balanceBefore: admin.balance,
            balanceAfter: newBalance,
          }
        });
      }
    } else if (admin.balance === 0) {
      // Try to sync from trafficPool
      const pool = await this.prisma.trafficPool.findFirst({ where: { adminId: id } });
      if (pool && pool.totalLimit > 0n) {
        const balanceFromPool = Number(pool.totalLimit);
        updateData.balance = balanceFromPool;
        
        const existingTx = await this.prisma.trafficTransaction.count({ where: { adminId: id, type: 'CREDIT' } });
        if (existingTx === 0) {
          await this.prisma.trafficTransaction.create({
            data: {
              adminId: id,
              amount: pool.totalLimit,
              type: 'CREDIT',
              action: 'MIGRATION_SYNC_BALANCE',
              description: 'Migration Fix — Balance Synced from TrafficPool',
              balanceBefore: admin.balance,
              balanceAfter: balanceFromPool,
            }
          });
        }
      }
    }

    // Set inbounds
    if (data.inboundIds?.length) {
      await this.prisma.adminInbound.deleteMany({ where: { adminId: id } });
      await this.prisma.adminInbound.createMany({
        data: data.inboundIds.map((inboundId) => ({ adminId: id, inboundId })),
        skipDuplicates: true,
      });
    }

    if (Object.keys(updateData).length > 0) {
      await this.prisma.admin.update({ where: { id }, data: updateData });
    }

    await this.prisma.auditLog.create({
      data: { action: 'ADMIN_MIGRATION_FIX', entity: 'Admin', entityId: id, adminId: id }
    });

    return this.findOne(id);
  }
}
