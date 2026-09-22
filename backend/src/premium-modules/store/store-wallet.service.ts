import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
  forwardRef,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PaygWalletHookAdapter } from '../store-payg/payg-limit-sync.service';
import { FeatureEntitlementService } from '../../platform/feature-entitlement.service';

type Db = PrismaService | Prisma.TransactionClient;

@Injectable()
export class StoreWalletService {
  constructor(
    private prisma: PrismaService,
    @Optional()
    @Inject(forwardRef(() => PaygWalletHookAdapter))
    private readonly paygHook?: PaygWalletHookAdapter,
    @Optional() private readonly entitlement?: FeatureEntitlementService,
  ) {}

  private async assertCommerceActive() {
    if (!this.entitlement) return;
    if (await this.entitlement.isStoreCommerceActive()) return;
    throw new ForbiddenException(
      'Premium license expired — wallet top-up is disabled until the license is renewed.',
    );
  }

  async getOrCreateAccount(customerId: string, currency = 'USD') {
    let account = await this.prisma.storeWalletAccount.findUnique({
      where: { customerId },
    });
    if (!account) {
      account = await this.prisma.storeWalletAccount.create({
        data: { customerId, currency: currency === 'IRR' ? 'TOMAN' : currency },
      });
    }
    return account;
  }

  async getBalance(customerId: string, currency?: string) {
    let cur = currency;
    if (!cur) {
      const customer = await this.prisma.storeCustomer.findUnique({
        where: { id: customerId },
        select: { adminId: true },
      });
      if (customer) {
        const store = await this.prisma.storeProfile.findUnique({
          where: { adminId: customer.adminId },
          select: { defaultCurrency: true },
        });
        cur = store?.defaultCurrency || 'USD';
      }
    }
    const normalized =
      String(cur || 'USD').toUpperCase() === 'IRR' ||
      String(cur || '').toUpperCase() === 'IRT' ||
      String(cur || '').toUpperCase() === 'TOMAN' ||
      String(cur || '').toUpperCase() === 'TMN'
        ? 'TOMAN'
        : 'USD';
    const account = await this.getOrCreateAccount(customerId, normalized);
    if (account.currency !== normalized && Number(account.balance) === 0) {
      await this.prisma.storeWalletAccount.update({
        where: { id: account.id },
        data: { currency: normalized },
      });
      account.currency = normalized;
    }
    const entries = await this.prisma.storeWalletLedger.findMany({
      where: { accountId: account.id },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
    return {
      balance: account.balance,
      currency: normalized,
      entries,
    };
  }

  async credit(
    db: Db,
    customerId: string,
    amount: number,
    type: string,
    opts?: { orderId?: string; depositId?: string; note?: string; currency?: string },
  ) {
    if (!(amount > 0)) throw new BadRequestException('Amount must be positive');
    const account = await db.storeWalletAccount.upsert({
      where: { customerId },
      create: {
        customerId,
        currency: opts?.currency || 'USD',
        balance: 0,
      },
      update: {},
    });
    const next = Number(account.balance) + amount;
    await db.storeWalletAccount.update({
      where: { id: account.id },
      data: { balance: next },
    });
    await db.storeWalletLedger.create({
      data: {
        accountId: account.id,
        type,
        amount,
        balanceAfter: next,
        orderId: opts?.orderId,
        depositId: opts?.depositId,
        note: opts?.note,
      },
    });
    if (db === this.prisma) {
      await this.notifyPaygCredit(customerId);
    }
    return next;
  }

  /**
   * Generic wallet debit (PAYG usage, adjustments, etc.).
   * Returns the ledger row id for cross-linking.
   */
  async debit(
    db: Db,
    customerId: string,
    amount: number,
    type: string,
    opts?: {
      orderId?: string;
      note?: string;
      currency?: string;
      meta?: Prisma.InputJsonValue;
    },
  ): Promise<{ balanceAfter: number; ledgerId: string }> {
    if (!(amount > 0)) throw new BadRequestException('Amount must be positive');
    const account = await db.storeWalletAccount.upsert({
      where: { customerId },
      create: {
        customerId,
        currency: opts?.currency || 'USD',
        balance: 0,
      },
      update: {},
    });
    if (Number(account.balance) + 1e-9 < amount) {
      throw new BadRequestException('Insufficient wallet balance');
    }
    const next = Number(account.balance) - amount;
    await db.storeWalletAccount.update({
      where: { id: account.id },
      data: { balance: next },
    });
    const ledger = await db.storeWalletLedger.create({
      data: {
        accountId: account.id,
        type: type || 'debit',
        amount: -amount,
        balanceAfter: next,
        orderId: opts?.orderId,
        note: opts?.note,
        ...(opts?.meta !== undefined ? { meta: opts.meta } : {}),
      },
    });
    if (db === this.prisma) {
      await this.notifyPaygBalanceChange(customerId);
    }
    return { balanceAfter: next, ledgerId: ledger.id };
  }

  private async notifyPaygBalanceChange(customerId: string) {
    if (!this.paygHook) return;
    try {
      if (typeof this.paygHook.onWalletChanged === 'function') {
        await this.paygHook.onWalletChanged(customerId);
      } else {
        await this.paygHook.onWalletCredited(customerId);
      }
    } catch {
      /* best-effort; never fail the wallet path */
    }
  }

  private async notifyPaygCredit(customerId: string) {
    return this.notifyPaygBalanceChange(customerId);
  }

  async debitForOrder(
    db: Db,
    customerId: string,
    amount: number,
    currency: string,
    orderId: string,
  ) {
    if (!(amount >= 0)) throw new BadRequestException('Invalid amount');
    if (amount === 0) return;
    const account = await db.storeWalletAccount.upsert({
      where: { customerId },
      create: { customerId, currency, balance: 0 },
      update: {},
    });
    if (Number(account.balance) + 1e-9 < amount) {
      throw new BadRequestException('Insufficient wallet balance');
    }
    const next = Number(account.balance) - amount;
    await db.storeWalletAccount.update({
      where: { id: account.id },
      data: { balance: next },
    });
    await db.storeWalletLedger.create({
      data: {
        accountId: account.id,
        type: 'purchase',
        amount: -amount,
        balanceAfter: next,
        orderId,
        note: 'Order payment',
      },
    });
  }

  async createDeposit(
    customerId: string,
    adminId: string,
    amount: number,
    currency: string,
    receipt?: { receiptText?: string; receiptImage?: string },
  ) {
    await this.assertCommerceActive();
    if (!(amount > 0)) throw new BadRequestException('Amount must be positive');
    const hasReceipt = !!(receipt?.receiptText || receipt?.receiptImage);
    if (!hasReceipt) {
      throw new BadRequestException(
        'Receipt photo or text is required / ارسال رسید (عکس یا متن) الزامی است',
      );
    }
    return this.prisma.storeWalletDeposit.create({
      data: {
        customerId,
        adminId,
        amount,
        currency,
        status: 'SUBMITTED',
        receiptText: receipt?.receiptText,
        receiptImage: receipt?.receiptImage,
      },
    });
  }

  async approveDeposit(adminId: string, depositId: string) {
    await this.assertCommerceActive();
    const deposit = await this.prisma.storeWalletDeposit.findFirst({
      where: { id: depositId, adminId },
    });
    if (!deposit) throw new NotFoundException('Deposit not found');
    if (deposit.status === 'APPROVED') return deposit;
    if (!['PENDING', 'SUBMITTED'].includes(deposit.status)) {
      throw new BadRequestException('Deposit cannot be approved');
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.storeWalletDeposit.update({
        where: { id: depositId },
        data: {
          status: 'APPROVED',
          reviewedAt: new Date(),
          reviewedBy: adminId,
        },
      });
      await this.credit(tx, deposit.customerId, deposit.amount, 'deposit', {
        depositId,
        currency: deposit.currency,
        note: 'Wallet top-up approved',
      });
    });

    await this.notifyPaygCredit(deposit.customerId);

    return this.prisma.storeWalletDeposit.findUniqueOrThrow({ where: { id: depositId } });
  }

  async rejectDeposit(adminId: string, depositId: string, reason?: string) {
    const deposit = await this.prisma.storeWalletDeposit.findFirst({
      where: { id: depositId, adminId },
    });
    if (!deposit) throw new NotFoundException('Deposit not found');
    return this.prisma.storeWalletDeposit.update({
      where: { id: depositId },
      data: {
        status: 'REJECTED',
        rejectReason: reason || 'Rejected',
        reviewedAt: new Date(),
        reviewedBy: adminId,
      },
    });
  }

  async listDeposits(adminId: string, status?: string) {
    return this.prisma.storeWalletDeposit.findMany({
      where: {
        adminId,
        ...(status ? { status } : {}),
      },
      include: {
        customer: { select: { id: true, token: true, name: true, telegram: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async adminAdjust(
    adminId: string,
    customerId: string,
    amount: number,
    note?: string,
    currency?: string,
  ) {
    const customer = await this.prisma.storeCustomer.findFirst({
      where: { id: customerId, adminId },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    const n = Number(amount);
    if (!Number.isFinite(n) || n === 0) {
      throw new BadRequestException('Amount must be a non-zero number');
    }
    if (n > 0) {
      await this.credit(this.prisma, customerId, n, 'adjust', {
        note: note || 'Admin credit',
        currency,
      });
    } else {
      const abs = Math.abs(n);
      await this.debit(this.prisma, customerId, abs, 'adjust', {
        note: note || 'Admin debit',
        currency,
      });
    }
    return this.getBalance(customerId);
  }
}
