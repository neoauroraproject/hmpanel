import { Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { generateSessionToken } from './store.types';

const CUSTOMER_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 14;

export type CustomerAuthChannel = 'telegram' | 'token' | 'web';

@Injectable()
export class StoreCustomerAuthService {
  constructor(private readonly prisma: PrismaService) {}

  private hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
  }

  async createSession(
    customerId: string,
    context?: {
      userAgent?: string;
      ipAddress?: string | null;
      authChannel?: CustomerAuthChannel;
    },
  ) {
    const sessionToken = generateSessionToken();
    const expiresAt = new Date(Date.now() + CUSTOMER_SESSION_TTL_MS);

    await this.prisma.storeCustomerSession.create({
      data: {
        customerId,
        tokenHash: this.hashToken(sessionToken),
        authChannel: context?.authChannel || 'token',
        userAgent: context?.userAgent,
        ipAddress: context?.ipAddress ?? undefined,
        expiresAt,
      },
    });

    await this.prisma.storeCustomer.update({
      where: { id: customerId },
      data: {
        lastLoginAt: new Date(),
        lastSeenAt: new Date(),
        loginCount: { increment: 1 },
      },
    });

    return {
      sessionToken,
      expiresAt,
      authChannel: context?.authChannel || 'token',
    };
  }

  async validateSession(sessionToken: string) {
    const { customer } = await this.validateSessionWithMeta(sessionToken);
    return customer;
  }

  async validateSessionWithMeta(sessionToken: string) {
    const tokenHash = this.hashToken(sessionToken);
    const session = await this.prisma.storeCustomerSession.findUnique({
      where: { tokenHash },
      include: { customer: true },
    });

    if (!session || session.revokedAt || session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException('Session expired');
    }

    await this.prisma.storeCustomerSession.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() },
    });
    await this.prisma.storeCustomer.update({
      where: { id: session.customerId },
      data: { lastSeenAt: new Date() },
    });

    return {
      customer: session.customer,
      authChannel: (session.authChannel || 'token') as CustomerAuthChannel,
      sessionId: session.id,
    };
  }

  async revokeSession(sessionToken: string) {
    const tokenHash = this.hashToken(sessionToken);
    const session = await this.prisma.storeCustomerSession.findUnique({
      where: { tokenHash },
    });
    if (!session) return { revoked: true };
    await this.prisma.storeCustomerSession.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });
    return { revoked: true };
  }

  async revokeCustomerSessions(customerId: string) {
    await this.prisma.storeCustomerSession.updateMany({
      where: { customerId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async loginWithPermanentToken(
    token: string,
    context?: {
      userAgent?: string;
      ipAddress?: string | null;
      authChannel?: CustomerAuthChannel;
    },
  ) {
    const customer = await this.prisma.storeCustomer.findUnique({
      where: { token },
      select: { id: true, token: true, name: true, adminId: true, status: true },
    });
    if (!customer || customer.status === 'blocked') {
      throw new NotFoundException('Customer not found');
    }

    const session = await this.createSession(customer.id, {
      ...context,
      authChannel: context?.authChannel || 'token',
    });
    return {
      ...session,
      customer: {
        id: customer.id,
        token: customer.token,
        name: customer.name,
        adminId: customer.adminId,
      },
    };
  }
}
