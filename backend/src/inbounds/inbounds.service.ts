import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class InboundsService {
  constructor(private prisma: PrismaService) {}

  /** List inbounds. Super-admins see all; resellers only their assigned inbounds. */
  async findAll(adminId: string, role: string) {
    const where =
      role === 'SUPER_ADMIN' ? {} : { adminAccess: { some: { adminId } } };

    return this.prisma.inbound.findMany({
      where,
      select: {
        id: true,
        tag: true,
        remark: true,
        port: true,
        protocol: true,
        streamSettings: true,
        panelInboundId: true,
        nodeId: true,
        nodeName: true,
        originNodeGuid: true,
        panel: { select: { id: true, name: true, url: true, panelType: true } },
        _count: { select: { clientInbounds: true } },
      },
      orderBy: [{ nodeId: 'asc' }, { tag: 'asc' }],
    });
  }

  async update(id: string, dto: { remark?: string }) {
    return this.prisma.inbound.update({
      where: { id },
      data: { remark: dto.remark },
    });
  }
}
