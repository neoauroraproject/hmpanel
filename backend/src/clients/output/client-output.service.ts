import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { DomainStatus } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { OutputCacheService } from './output-cache.service';
import { resolveOutputType } from './output-type.resolver';
import { parseConnectionExtras } from './connection-extras';
import { buildWireGuardOutput } from './builders/wireguard-output.builder';
import { buildSubscriptionOutput } from './builders/subscription-output.builder';
import { buildGenericOutput } from './builders/generic-output.builder';
import type { ClientOutputModel } from './client-output.types';

@Injectable()
export class ClientOutputService {
  private readonly logger = new Logger(ClientOutputService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: OutputCacheService,
  ) {}

  /**
   * Build protocol-aware connection output for a client (by DB id).
   */
  async getOutputByClientId(
    clientId: string,
    opts?: { origin?: string; inboundId?: string },
  ): Promise<ClientOutputModel> {
    const client = await this.prisma.client.findUnique({
      where: { id: clientId },
      include: {
        inbounds: {
          include: {
            inbound: {
              include: {
                panel: { select: { url: true, subUrl: true, name: true } },
              },
            },
          },
        },
      },
    });
    if (!client) throw new NotFoundException('Client not found');
    return this.buildForClient(client, opts);
  }

  /**
   * Resolve by subId / subToken / email / uuid (portal / storefront).
   */
  async getOutputBySubscriptionKey(
    key: string,
    opts?: { origin?: string },
  ): Promise<ClientOutputModel> {
    const client = await this.prisma.client.findFirst({
      where: {
        OR: [
          { subId: key },
          { subToken: key },
          { id: key },
          { email: key },
          { uuid: key },
        ],
      },
      include: {
        inbounds: {
          include: {
            inbound: {
              include: {
                panel: { select: { url: true, subUrl: true, name: true } },
              },
            },
          },
        },
      },
    });
    if (!client) throw new NotFoundException('Subscription not found');
    return this.buildForClient(client, opts);
  }

  /**
   * Config file body for download endpoints. Returns null if not config-capable.
   */
  async getConfigFile(clientIdOrKey: string, by: 'clientId' | 'subscriptionKey') {
    const model =
      by === 'clientId'
        ? await this.getOutputByClientId(clientIdOrKey)
        : await this.getOutputBySubscriptionKey(clientIdOrKey);

    if (model.outputType !== 'wireguard') {
      return null;
    }
    const configText = model.payload?.configText;
    if (!configText || typeof configText !== 'string') {
      return null;
    }
    const filename =
      (typeof model.payload?.downloadFilename === 'string' &&
        model.payload.downloadFilename) ||
      'client.conf';
    return { configText, filename, contentType: 'text/plain; charset=utf-8' };
  }

  private async buildForClient(
    client: any,
    opts?: { origin?: string; inboundId?: string },
  ): Promise<ClientOutputModel> {
    const inboundRel =
      (opts?.inboundId
        ? client.inbounds?.find((r: any) => r.inboundId === opts.inboundId)
        : null) || client.inbounds?.[0];
    const inbound = inboundRel?.inbound || null;

    const envelope = parseConnectionExtras(client.connectionExtras);
    const protocol = String(
      envelope?.protocol || inbound?.protocol || 'unknown',
    ).toLowerCase();
    const outputType = resolveOutputType(protocol);

    const origin = await this.resolvePublicOrigin(client.adminId, opts?.origin);
    const cacheKey = this.cache.buildKey({
      uuid: client.uuid,
      updatedAt: client.updatedAt,
      inboundId: inbound?.id,
      origin: origin || '',
    });
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    let model: ClientOutputModel;
    const ctx = {
      clientId: client.id,
      protocol,
      client: {
        id: client.id,
        email: client.email,
        remark: client.remark,
        subId: client.subId,
        subToken: client.subToken,
        uuid: client.uuid,
        connectionExtras: client.connectionExtras,
      },
      inbound: inbound
        ? {
            id: inbound.id,
            protocol: inbound.protocol,
            port: inbound.port,
            tag: inbound.tag,
            panel: inbound.panel,
          }
        : null,
      origin,
    };

    if (outputType === 'wireguard') {
      model = buildWireGuardOutput(ctx);
    } else if (outputType === 'subscription') {
      model = buildSubscriptionOutput(ctx);
    } else {
      model = buildGenericOutput({ clientId: client.id, protocol });
    }

    this.cache.set(cacheKey, model);
    this.logger.debug(
      `Built output ${outputType} for client ${client.id} (${protocol})`,
    );
    return model;
  }

  /**
   * Panel `/s/{token}` links use the admin's verified Premium custom domain
   * (not the request host, which is often the default panel domain).
   */
  private async resolvePublicOrigin(
    adminId?: string | null,
    fallback?: string,
  ): Promise<string | undefined> {
    let host = '';
    if (adminId) {
      const owned = await this.prisma.domain.findFirst({
        where: {
          adminId,
          status: { in: [DomainStatus.VERIFIED, DomainStatus.SSL_ACTIVE] },
        },
        select: { domain: true },
        orderBy: { updatedAt: 'desc' },
      });
      host = String(owned?.domain || '').trim();
      if (!host) {
        const store = await this.prisma.storeProfile.findUnique({
          where: { adminId },
          include: { domain: { select: { domain: true, status: true } } },
        });
        const status = store?.domain?.status;
        if (
          store?.domain?.domain &&
          (status === DomainStatus.VERIFIED || status === DomainStatus.SSL_ACTIVE)
        ) {
          host = store.domain.domain.trim();
        }
      }
    }
    if (host) {
      const proto = process.env.FORCE_HTTP === 'true' ? 'http' : 'https';
      return `${proto}://${host.split(':')[0].toLowerCase()}`;
    }
    return fallback || undefined;
  }
}
