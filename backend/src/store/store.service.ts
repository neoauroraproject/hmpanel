import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomUUID as uuidv4 } from 'crypto';

@Injectable()
export class StoreService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------
  // Super Admin: Store Management
  // ---------------------------------------------------------

  async activateStoreForAdmin(adminId: string, data: any) {
    if (!data.panelId) throw new BadRequestException('panelId is required to activate store');

    // Verify panel exists
    const panel = await this.prisma.panel.findUnique({ where: { id: data.panelId } });
    if (!panel) throw new NotFoundException('Panel not found');

    let profile = await (this.prisma as any).storeProfile.findUnique({ where: { adminId } });

    if (profile) {
      profile = await (this.prisma as any).storeProfile.update({
        where: { adminId },
        data: { panelId: data.panelId }
      });
    } else {
      profile = await (this.prisma as any).storeProfile.create({
        data: {
          adminId,
          slug: data.slug || `store-${uuidv4().substring(0, 8)}`,
          panelId: data.panelId,
        },
      });
    }

    await this.prisma.admin.update({
      where: { id: adminId },
      data: { storeEnabled: true }
    });

    return profile;
  }

  async deactivateStoreForAdmin(adminId: string) {
    await this.prisma.admin.update({
      where: { id: adminId },
      data: { storeEnabled: false }
    });
    // We could delete the StoreProfile, or just disable it.
    // For now, we just flip the flag.
    return { success: true };
  }

  // ---------------------------------------------------------
  // Reseller: Store Profile Management
  // ---------------------------------------------------------
  
  async getStoreProfile(adminId: string) {
    let profile = await (this.prisma as any).storeProfile.findUnique({
      where: { adminId },
      include: { domain: true },
    });

    if (!profile) {
      throw new BadRequestException('Store is not activated. Please contact Super Admin.');
    }

    return profile;
  }

  async updateStoreProfile(adminId: string, data: any) {
    // Check if slug is taken
    if (data.slug) {
      const existing = await (this.prisma as any).storeProfile.findUnique({ where: { slug: data.slug } });
      if (existing && existing.adminId !== adminId) {
        throw new ConflictException('Store URL (slug) is already taken.');
      }
    }

    return (this.prisma as any).storeProfile.update({
      where: { adminId },
      data,
    });
  }

  // ---------------------------------------------------------
  // Reseller: Product Templates Management
  // ---------------------------------------------------------
  
  async getProductTemplates(adminId: string) {
    return (this.prisma as any).productTemplate.findMany({
      where: { adminId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createProductTemplate(adminId: string, data: any) {
    const profile = await (this.prisma as any).storeProfile.findUnique({ where: { adminId } });
    if (!profile) throw new BadRequestException('Store not activated.');
    if (!profile.panelId) throw new BadRequestException('Store has no panel assigned. Please contact Super Admin.');

    // Check if inbounds belong to the assigned panel
    const inboundIds = Array.isArray(data.inboundIds) ? data.inboundIds : [data.inboundIds];
    const validInbounds = await this.prisma.inbound.findMany({
      where: {
        id: { in: inboundIds },
        panelId: profile.panelId
      }
    });

    if (validInbounds.length !== inboundIds.length) {
      throw new BadRequestException('Selected inbounds must belong to the store\'s assigned panel.');
    }

    return (this.prisma as any).productTemplate.create({
      data: {
        adminId,
        ...data,
      },
    });
  }

  async deleteProductTemplate(adminId: string, id: string) {
    const product = await (this.prisma as any).productTemplate.findUnique({ where: { id } });
    if (!product || product.adminId !== adminId) throw new NotFoundException('Product not found');
    
    return (this.prisma as any).productTemplate.delete({ where: { id } });
  }

  // ---------------------------------------------------------
  // Reseller: Orders Management
  // ---------------------------------------------------------
  
  async getOrders(adminId: string) {
    const profile = await (this.prisma as any).storeProfile.findUnique({ where: { adminId } });
    if (!profile) return [];

    return (this.prisma as any).storeOrder.findMany({
      where: { storeId: profile.id },
      include: { product: true, client: true, renewClient: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approveOrder(adminId: string, orderId: string) {
    const order = await (this.prisma as any).storeOrder.findUnique({
      where: { id: orderId },
      include: { store: true, product: true, renewClient: true }
    });

    if (!order) throw new NotFoundException('Order not found');
    if (order.store.adminId !== adminId) throw new NotFoundException('Order not found');
    if (order.status !== 'PENDING') throw new BadRequestException(`Order is already ${order.status}`);

    const product = order.product;

    if (order.isRenewal && order.renewClientId) {
      // Modifying existing client
      const expiry = product.durationDays > 0 
        ? BigInt(Date.now() + product.durationDays * 24 * 60 * 60 * 1000)
        : BigInt(0);

      const updatedClient = await this.prisma.client.update({
        where: { id: order.renewClientId },
        data: {
          total: product.traffic,
          expiryTime: expiry,
          inboundId: Array.isArray(product.inboundIds) ? product.inboundIds[0] : product.inboundIds, // Taking the first inbound for now
          remark: order.clientName, // Optional update of name
          enable: true
        }
      });

      await (this.prisma as any).storeOrder.update({
        where: { id: orderId },
        data: { status: 'DELIVERED', clientId: updatedClient.id }
      });

      return { success: true, message: 'Client renewed successfully' };
    } else {
      // Create a brand new client
      const expiry = product.durationDays > 0 
        ? BigInt(Date.now() + product.durationDays * 24 * 60 * 60 * 1000)
        : BigInt(0);

      const client = await this.prisma.client.create({
        data: {
          adminId: adminId,
          inboundId: Array.isArray(product.inboundIds) ? product.inboundIds[0] : product.inboundIds,
          email: `${order.clientName.replace(/\s+/g, '').toLowerCase()}-${uuidv4().substring(0,6)}`,
          remark: order.clientName,
          uuid: uuidv4(),
          subId: uuidv4().substring(0, 10),
          subToken: uuidv4(),
          enable: true,
          total: product.traffic,
          expiryTime: expiry,
        }
      });

      await (this.prisma as any).storeOrder.update({
        where: { id: orderId },
        data: { status: 'DELIVERED', clientId: client.id }
      });

      return { success: true, message: 'Client created successfully' };
    }
  }

  async rejectOrder(adminId: string, orderId: string) {
    const order = await (this.prisma as any).storeOrder.findUnique({
      where: { id: orderId },
      include: { store: true }
    });

    if (!order || order.store.adminId !== adminId) throw new NotFoundException('Order not found');
    if (order.status !== 'PENDING') throw new BadRequestException(`Order is already ${order.status}`);

    return (this.prisma as any).storeOrder.update({
      where: { id: orderId },
      data: { status: 'REJECTED' }
    });
  }

  async getStats(adminId: string) {
    const profile = await (this.prisma as any).storeProfile.findUnique({ where: { adminId } });
    if (!profile) return { totalOrders: 0, totalSales: 0 };

    const orders = await (this.prisma as any).storeOrder.findMany({
      where: { storeId: profile.id, status: 'DELIVERED' },
      include: { product: true }
    });

    let totalOrders = orders.length;
    let totalSales = orders.reduce((sum: number, order: any) => sum + (order.product?.price || 0), 0);

    return { totalOrders, totalSales };
  }

  // ---------------------------------------------------------
  // Public: Storefront
  // ---------------------------------------------------------
  
  async getStoreBySlug(slug: string) {
    const store = await (this.prisma as any).storeProfile.findUnique({
      where: { slug },
      include: { admin: { select: { username: true, storeEnabled: true } } }
    });

    if (!store || !store.admin.storeEnabled) throw new NotFoundException('Store not found or deactivated');

    const products = await (this.prisma as any).productTemplate.findMany({
      where: { adminId: store.adminId },
      orderBy: { price: 'asc' }
    });

    return { store, products };
  }

  async getStoreByDomain(domainId: string) {
    const store = await (this.prisma as any).storeProfile.findFirst({
      where: { domainId },
      include: { admin: { select: { username: true, storeEnabled: true } } }
    });
    
    if (!store || !store.admin.storeEnabled) throw new NotFoundException('Store not found or deactivated');
    
    const products = await (this.prisma as any).productTemplate.findMany({
      where: { adminId: store.adminId },
      orderBy: { price: 'asc' }
    });

    return { store, products };
  }

  async createOrder(slug: string, orderData: any) {
    const store = await (this.prisma as any).storeProfile.findUnique({ where: { slug } });
    if (!store) throw new NotFoundException('Store not found');

    const product = await (this.prisma as any).productTemplate.findUnique({ where: { id: orderData.productId } });
    if (!product || product.adminId !== store.adminId) throw new BadRequestException('Invalid product');

    // Renewal checking
    let renewClientId = null;
    let isRenewal = false;

    if (orderData.subUrl) {
      // Find client by subId or subToken
      const subKeyMatch = orderData.subUrl.match(/\/s\/([a-zA-Z0-9]+)$/) || orderData.subUrl.match(/\/subscriptions\/([a-zA-Z0-9]+)$/);
      if (subKeyMatch) {
        const subId = subKeyMatch[1];
        const client = await this.prisma.client.findFirst({
          where: { OR: [{ subId }, { subToken: subId }] }
        });
        if (client) {
          renewClientId = client.id;
          isRenewal = true;
        }
      }
    }

    const trackingCode = uuidv4().substring(0, 10).toUpperCase();

    const order = await (this.prisma as any).storeOrder.create({
      data: {
        trackingCode,
        storeId: store.id,
        productId: product.id,
        clientName: orderData.clientName || 'Anonymous',
        telegramId: orderData.telegramId,
        whatsapp: orderData.whatsapp,
        notes: orderData.notes,
        receiptText: orderData.receiptText,
        receiptImage: orderData.receiptImage,
        status: 'PENDING',
        isRenewal,
        renewClientId,
      }
    });

    return { trackingCode };
  }

  async getOrderTracking(trackingCode: string) {
    const order = await (this.prisma as any).storeOrder.findUnique({
      where: { trackingCode },
      include: { product: true, store: true, client: true, renewClient: true }
    });

    if (!order) throw new NotFoundException('Order not found');

    const result: any = {
      trackingCode: order.trackingCode,
      status: order.status,
      productName: order.product.name,
      createdAt: order.createdAt,
      isRenewal: order.isRenewal,
    };

    if (order.status === 'DELIVERED') {
      const c = order.client || order.renewClient;
      if (c) {
        result.delivery = {
          subUrl: c.subId, // For the frontend to construct full link
          subToken: c.subToken,
          remark: c.remark
        };
      }
    }

    return result;
  }
}
