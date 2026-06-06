import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DomainsService {
  constructor(private prisma: PrismaService) {}

  async getDomains() {
    // Workaround for TypeScript complaining about missing prisma.domain
    // if client is not generated yet. We use (this.prisma as any).domain
    const domainClient = (this.prisma as any).domain;
    if (!domainClient) {
        return [];
    }
    
    return domainClient.findMany({
      include: {
        admin: {
          select: { username: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });
  }

  async createDomain(dto: any) {
    const domainClient = (this.prisma as any).domain;
    if (!domainClient) throw new BadRequestException('Prisma Client not updated. Restart backend.');
    
    const existing = await domainClient.findUnique({ where: { domain: dto.domain } });
    if (existing) throw new BadRequestException('Domain already exists');

    return domainClient.create({
      data: {
        domain: dto.domain,
        type: dto.type || 'PORTAL',
        adminId: dto.adminId || null,
        status: 'PENDING',
      }
    });
  }

  async deleteDomain(id: string) {
    const domainClient = (this.prisma as any).domain;
    return domainClient.delete({ where: { id } });
  }

  async verifyDomain(id: string) {
    const domainClient = (this.prisma as any).domain;
    
    // Simulate SSL verification
    await new Promise(r => setTimeout(r, 3000));
    
    return domainClient.update({
      where: { id },
      data: {
        status: 'SSL_ACTIVE',
        sslMethod: 'HTTP_CHALLENGE',
        certPath: `/etc/letsencrypt/live/${id}/fullchain.pem`,
        keyPath: `/etc/letsencrypt/live/${id}/privkey.pem`,
      }
    });
  }
}
