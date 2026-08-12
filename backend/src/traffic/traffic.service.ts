import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AdminQuotaService } from './admin-quota.service';

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
  ) {
    const where: Prisma.TrafficTransactionWhereInput = {
      adminId,
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

    const [data, total, creditAgg, debitAgg] = await Promise.all([
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
    ]);

    return {
      data,
      total,
      page,
      limit,
      totals: {
        credit: creditAgg._sum.amount?.toString() || '0',
        debit: debitAgg._sum.amount?.toString() || '0',
      },
    };
  }
}
