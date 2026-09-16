import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { StoreTelegramService } from './store-telegram.service';

@Injectable()
export class StoreCustomerNotificationsService {
  private readonly logger = new Logger(StoreCustomerNotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly telegram: StoreTelegramService,
  ) {}

  private payloadOrderId(payload?: Record<string, unknown>, orderId?: string) {
    if (orderId) return orderId;
    const fromPayload = payload?.orderId;
    return typeof fromPayload === 'string' ? fromPayload : undefined;
  }

  /**
   * One live notification per order: updates unread card instead of stacking spam.
   * Activity timeline still records every event.
   */
  async notifyCustomer(
    customerId: string,
    input: {
      type: string;
      title: string;
      message?: string;
      payload?: Record<string, unknown>;
      orderId?: string;
    },
  ) {
    const orderId = this.payloadOrderId(input.payload, input.orderId);
    const payload = {
      ...(input.payload ?? {}),
      ...(orderId ? { orderId } : {}),
    } as Prisma.InputJsonValue;

    const notification = await this.prisma.$transaction(async (tx) => {
      let next = null as Awaited<
        ReturnType<typeof tx.storeCustomerNotification.create>
      > | null;

      if (orderId) {
        const recent = await tx.storeCustomerNotification.findMany({
          where: { customerId, readAt: null },
          orderBy: { createdAt: 'desc' },
          take: 30,
        });
        const existing = recent.find((item) => {
          const data = (item.payload ?? {}) as Record<string, unknown>;
          return data.orderId === orderId;
        });

        if (existing) {
          next = await tx.storeCustomerNotification.update({
            where: { id: existing.id },
            data: {
              type: input.type,
              title: input.title,
              message: input.message,
              payload,
              createdAt: new Date(),
            },
          });
        }
      }

      if (!next) {
        next = await tx.storeCustomerNotification.create({
          data: {
            customerId,
            type: input.type,
            title: input.title,
            message: input.message,
            payload,
          },
        });
      }

      await tx.storeCustomerActivity.create({
        data: {
          customerId,
          orderId,
          type: input.type,
          title: input.title,
          message: input.message,
          metadata: payload,
        },
      });

      return next;
    });

    void this.telegram
      .notifyTelegramCustomer(customerId, {
        title: input.title,
        message: input.message,
        type: input.type,
        payload: (payload || {}) as Record<string, unknown>,
      })
      .catch((err) => {
        this.logger.warn(`Telegram mirror failed: ${err?.message || err}`);
      });

    return notification;
  }

  async addActivity(
    customerId: string,
    input: {
      type: string;
      title: string;
      message?: string;
      orderId?: string;
      metadata?: Record<string, unknown>;
    },
  ) {
    return this.prisma.storeCustomerActivity.create({
      data: {
        customerId,
        orderId: input.orderId,
        type: input.type,
        title: input.title,
        message: input.message,
        metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
      },
    });
  }

  listForCustomer(customerId: string, limit = 12) {
    return this.prisma.storeCustomerNotification
      .findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        take: Math.max(limit * 4, 40),
      })
      .then((items) => {
        const seenOrders = new Set<string>();
        const collapsed: typeof items = [];
        for (const item of items) {
          const payload = (item.payload ?? {}) as Record<string, unknown>;
          const orderId = typeof payload.orderId === 'string' ? payload.orderId : null;
          if (orderId) {
            if (seenOrders.has(orderId)) continue;
            seenOrders.add(orderId);
          }
          collapsed.push(item);
          if (collapsed.length >= limit) break;
        }
        return collapsed;
      });
  }

  async markAsRead(customerId: string, notificationId: string) {
    return this.prisma.storeCustomerNotification.updateMany({
      where: { id: notificationId, customerId, readAt: null },
      data: { readAt: new Date() },
    });
  }

  async markAllAsRead(customerId: string) {
    return this.prisma.storeCustomerNotification.updateMany({
      where: { customerId, readAt: null },
      data: { readAt: new Date() },
    });
  }
}
