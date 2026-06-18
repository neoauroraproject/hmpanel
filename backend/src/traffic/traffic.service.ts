import { Injectable, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class TrafficService {
  constructor(private prisma: PrismaService) {}

  /** Top-up an admin's balance (SUPER_ADMIN action) */
  async topUp(adminId: string, amountBytes: bigint, description?: string) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const admin = await tx.admin.update({
        where: { id: adminId },
        data: { balance: { increment: Number(amountBytes) } },
        select: { id: true, balance: true },
      });

      await tx.trafficTransaction.create({
        data: {
          adminId,
          amount: amountBytes,
          type: 'CREDIT',
          action: 'BALANCE_TOPUP',
          description: description || 'Balance top-up',
          balanceBefore: admin.balance - Number(amountBytes),
          balanceAfter: admin.balance,
        },
      });

      return admin;
    });
  }

  /** Deduct quota when creating a client (Allocation mode) */
  async provision(adminId: string, clientId: string, amountBytes: bigint) {
    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const admin = await tx.admin.findUniqueOrThrow({ where: { id: adminId }, select: { balance: true, trafficMode: true } });

      if (admin.trafficMode === 'ALLOCATION') {
        if (admin.balance < Number(amountBytes)) {
          throw new BadRequestException('Insufficient balance');
        }
        await tx.admin.update({
          where: { id: adminId },
          data: { balance: { decrement: Number(amountBytes) } },
        });
      }

      await tx.trafficTransaction.create({
        data: {
          adminId,
          clientId,
          targetClientUuid: clientId,
          amount: amountBytes,
          type: 'DEBIT',
          action: 'CLIENT_PROVISIONING',
          description: 'Client provisioned',
          balanceBefore: admin.balance,
          balanceAfter: admin.trafficMode === 'ALLOCATION' ? admin.balance - Number(amountBytes) : admin.balance,
        },
      });
    });
  }

  /** Refund remaining traffic when deleting a client */
  async refund(adminId: string, clientId: string, totalBytes: bigint, usedBytes: bigint) {
    const remaining = totalBytes - usedBytes;
    if (remaining <= 0n) return; // Nothing to refund — all consumed

    return this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const admin = await tx.admin.update({
        where: { id: adminId },
        data: { balance: { increment: Number(remaining) } },
      });

      await tx.trafficTransaction.create({
        data: {
          adminId,
          clientId,
          targetClientUuid: clientId,
          amount: remaining,
          type: 'CREDIT',
          action: 'CLIENT_DELETION_REFUND',
          description: 'Client deleted — remaining traffic refunded',
          balanceBefore: admin.balance - Number(remaining),
          balanceAfter: admin.balance,
        },
      });
    });
  }

  /** Get ledger for an admin */
  async getLedger(adminId: string, page = 1, limit = 100, type?: string, search?: string) {
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
          id: true, amount: true, type: true, description: true, createdAt: true,
          balanceBefore: true, balanceAfter: true, action: true, targetClientUuid: true,
          client: { select: { id: true, email: true, uuid: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.trafficTransaction.count({ where }),
      this.prisma.trafficTransaction.aggregate({
        where: { ...where, type: 'CREDIT' },
        _sum: { amount: true }
      }),
      this.prisma.trafficTransaction.aggregate({
        where: { ...where, type: 'DEBIT' },
        _sum: { amount: true }
      })
    ]);

    return { 
      data, 
      total, 
      page, 
      limit,
      totals: {
        credit: creditAgg._sum.amount?.toString() || '0',
        debit: debitAgg._sum.amount?.toString() || '0'
      }
    };
  }
}
