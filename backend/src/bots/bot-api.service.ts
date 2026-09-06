import {
  Injectable,
  NotFoundException,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { generateApiKey, hashApiKey, parseScopes } from './bot-api.types';

@Injectable()
export class BotApiService {
  constructor(private prisma: PrismaService) {}

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

  private model(): any {
    return (this.prisma as any).botApiClient;
  }
}
