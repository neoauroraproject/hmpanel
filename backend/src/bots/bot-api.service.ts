import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../prisma/prisma.service';
import { generateApiKey, hashApiKey, parseScopes } from './bot-api.types';
import { ClientsService } from '../clients/clients.service';
import { TrafficService } from '../traffic/traffic.service';

@Injectable()
export class BotApiService {
  constructor(
    private prisma: PrismaService,
    private moduleRef: ModuleRef,
  ) {}

  async createClient(adminId: string, name: string, scopes: unknown) {
    const key = generateApiKey();
    const row = await this.model().create({
      data: {
        name,
        adminId,
        keyPrefix: key.prefix,
        keyHash: key.hash,
        scopes: parseScopes(scopes),
        enabled: true,
      },
    });
    return { ...row, apiKey: key.plain };
  }

  async list(adminId?: string) {
    return this.model().findMany({
      where: adminId ? { adminId } : undefined,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        adminId: true,
        keyPrefix: true,
        scopes: true,
        rateLimitPerMin: true,
        webhookUrl: true,
        enabled: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });
  }

  async revoke(id: string) {
    await this.model().update({ where: { id }, data: { enabled: false } });
    return { ok: true };
  }

  async listClientsForAdmin(adminId: string) {
    const rows = await this.prisma.client.findMany({
      where: { adminId, provisioningStatus: { not: 'FAILED' } },
      take: 200,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        email: true,
        uuid: true,
        enable: true,
        expiryTime: true,
        total: true,
        up: true,
        down: true,
        panelId: true,
      },
    });
    return rows.map((row) => ({
      ...row,
      expiryTime: row.expiryTime.toString(),
      total: row.total.toString(),
      up: row.up.toString(),
      down: row.down.toString(),
    }));
  }

  async authenticate(plainKey: string) {
    if (!plainKey?.startsWith('hmp_')) {
      throw new UnauthorizedException('Invalid API key');
    }
    const hash = hashApiKey(plainKey);
    const row = await this.model().findFirst({ where: { keyHash: hash } });
    if (!row || !row.enabled) {
      throw new UnauthorizedException('Invalid API key');
    }
    await this.model()
      .update({ where: { id: row.id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
    return row;
  }

  assertScope(row: { scopes: unknown }, scope: string) {
    const scopes = Array.isArray(row.scopes) ? row.scopes.map(String) : [];
    if (!scopes.includes(scope)) {
      throw new ForbiddenException(`Missing scope: ${scope}`);
    }
  }

  async getOrThrow(id: string) {
    const row = await this.model().findUnique({ where: { id } });
    if (!row) throw new NotFoundException('API client not found');
    return row;
  }

  async setWebhookUrl(id: string, webhookUrl: string | null) {
    const url = webhookUrl == null ? null : String(webhookUrl).trim();
    if (url) {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
          throw new Error('protocol');
        }
      } catch {
        throw new BadRequestException('webhookUrl must be http(s)');
      }
    }
    await this.model().update({
      where: { id },
      data: { webhookUrl: url },
    });
    return { ok: true, webhookUrl: url };
  }

  async provisionClient(
    adminId: string,
    body: {
      email?: string;
      inboundIds?: string[];
      total?: number;
      expiryTime?: number;
      remark?: string;
      limitIp?: number;
    },
  ) {
    const clients = this.clients();
    if (!clients) throw new BadRequestException('Clients service unavailable');
    return clients.create(adminId, {
      email: String(body.email || '').trim(),
      inboundIds: Array.isArray(body.inboundIds) ? body.inboundIds.map(String) : [],
      total: body.total,
      expiryTime: body.expiryTime,
      remark: body.remark,
      limitIp: body.limitIp,
    });
  }

  async patchClient(
    adminId: string,
    clientId: string,
    body: {
      enable?: boolean;
      total?: number;
      expiryTime?: number;
      remark?: string;
      limitIp?: number;
    },
  ) {
    const clients = this.clients();
    if (!clients) throw new BadRequestException('Clients service unavailable');
    const role = await this.adminRole(adminId);
    return clients.update(clientId, adminId, role, body);
  }

  async deleteClient(adminId: string, clientId: string) {
    const clients = this.clients();
    if (!clients) throw new BadRequestException('Clients service unavailable');
    const role = await this.adminRole(adminId);
    return clients.remove(clientId, adminId, role);
  }

  async listTraffic(adminId: string, page?: number, limit?: number) {
    const traffic = this.traffic();
    if (!traffic) throw new BadRequestException('Traffic service unavailable');
    return traffic.getLedger(adminId, page || 1, Math.min(limit || 50, 200));
  }

  private async adminRole(adminId: string): Promise<string> {
    const admin = await this.prisma.admin.findUnique({
      where: { id: adminId },
      select: { role: true },
    });
    return admin?.role || 'ADMIN';
  }

  private clients(): ClientsService | undefined {
    try {
      return this.moduleRef.get(ClientsService, { strict: false });
    } catch {
      return undefined;
    }
  }

  private traffic(): TrafficService | undefined {
    try {
      return this.moduleRef.get(TrafficService, { strict: false });
    } catch {
      return undefined;
    }
  }

  private model(): any {
    return (this.prisma as any).botApiClient;
  }
}
