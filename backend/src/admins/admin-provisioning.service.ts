import {
  ConflictException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AdminQuotaService } from '../traffic/admin-quota.service';
import { QuotaMode } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

export type AdminProvisionInput = {
  username: string;
  email: string;
  password: string;
  role?: string;
  trafficMode?: string;
  balance?: number;
  inboundIds?: string[];
  expiryTime?: number;
  maxClients?: number;
  permissions?: string[];
  refundOnDelete?: boolean;
  refundOnEdit?: boolean;
  unlimitedTraffic?: boolean;
  storeEnabled?: boolean;
  quotaMode?: string;
  panelQuotas?: Array<{ panelId: string; balanceBytes: number }>;
  moduleIds?: string[];
};

@Injectable()
export class AdminProvisioningService {
  private readonly logger = new Logger(AdminProvisioningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly adminQuota: AdminQuotaService,
  ) {}

  async createReseller(data: AdminProvisionInput, actorId?: string) {
    const exists = await this.prisma.admin.findFirst({
      where: { OR: [{ username: data.username }, { email: data.email }] },
      select: { id: true },
    });
    if (exists) throw new ConflictException('Username or email already exists');

    const hash = await bcrypt.hash(data.password, 10);
    const unlimited = data.unlimitedTraffic === true;
    const quotaMode = (data.quotaMode as QuotaMode) || 'GLOBAL';
    const usePerPanel = quotaMode === 'PER_PANEL' && !unlimited;

    const admin = await this.prisma.$transaction(async (tx) => {
      const row = await tx.admin.create({
        data: {
          username: data.username,
          email: data.email,
          passwordHash: hash,
          role: (data.role as any) || 'RESELLER',
          trafficMode: (data.trafficMode as any) || 'ALLOCATION',
          balance: unlimited || usePerPanel ? 0 : data.balance || 0,
          totalAssigned: unlimited || usePerPanel ? 0 : data.balance || 0,
          quotaMode,
          expiryTime: data.expiryTime ? BigInt(data.expiryTime) : 0n,
          maxClients: data.maxClients || 0,
          permissions: data.permissions || [],
          storeEnabled: data.storeEnabled === true,
          refundOnDelete: unlimited ? false : (data.refundOnDelete ?? true),
          refundOnEdit: unlimited ? false : (data.refundOnEdit ?? true),
          unlimitedTraffic: unlimited,
          gracePeriodStart: unlimited ? null : undefined,
        },
        select: { id: true, username: true, email: true, role: true },
      });

      if (data.inboundIds?.length) {
        await tx.adminInbound.createMany({
          data: data.inboundIds.map((inboundId) => ({
            adminId: row.id,
            inboundId,
          })),
          skipDuplicates: true,
        });
      }

      const moduleIds = new Set(data.moduleIds || []);
      if (data.storeEnabled) moduleIds.add('store');
      for (const moduleId of moduleIds) {
        await tx.adminModuleAssignment.upsert({
          where: { adminId_moduleId: { adminId: row.id, moduleId } },
          create: { adminId: row.id, moduleId, enabled: true, settings: {} },
          update: { enabled: true },
        });
      }

      await tx.auditLog.create({
        data: {
          action: 'ADMIN_CREATED',
          entity: 'Admin',
          entityId: row.id,
          adminId: actorId || row.id,
        },
      });

      return row;
    });

    if (usePerPanel && data.inboundIds?.length) {
      await this.adminQuota.syncPanelQuotas(admin.id, {
        quotaMode: 'PER_PANEL',
        unlimited: false,
        inboundIds: data.inboundIds,
        panelQuotas: data.panelQuotas,
      });
    } else if (data.balance && data.balance > 0 && !unlimited && !usePerPanel) {
      await this.prisma.trafficTransaction.create({
        data: {
          adminId: admin.id,
          amount: BigInt(data.balance),
          type: 'CREDIT',
          action: 'ADMIN_INITIAL_ALLOCATION',
          description: 'Agency plan provisioning',
          balanceBefore: 0,
          balanceAfter: data.balance,
        },
      });
    }

    this.logger.log(`Provisioned reseller admin ${admin.username} (${admin.id})`);
    return admin;
  }
}
