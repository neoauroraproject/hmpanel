import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { DomainStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PanelDriverRegistry } from '../../panels/native/panel-driver.registry';
import { isExternalPanelType } from '../../panels/native/native-panel-capabilities';
import {
  rewriteSubscriptionDeliveryHost,
  subscriptionUrlFromProviderMeta,
} from '../../common/utils/native-sub-url';
import { OutputCacheService } from './output-cache.service';
import { resolveOutputType } from './output-type.resolver';
import { parseConnectionExtras } from './connection-extras';
import { buildWireGuardOutput } from './builders/wireguard-output.builder';
import { buildSubscriptionOutput } from './builders/subscription-output.builder';
import { buildGenericOutput } from './builders/generic-output.builder';
import { buildExternalPanelSubscriptionOutput } from './builders/external-panel-subscription.builder';
import type { ClientOutputModel } from './client-output.types';

const PANEL_SELECT = {
  id: true,
  url: true,
  subUrl: true,
  name: true,
  panelType: true,
} as const;

@Injectable()
export class ClientOutputService {
  private readonly logger = new Logger(ClientOutputService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: OutputCacheService,
    private readonly panelDrivers: PanelDriverRegistry,
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
        panel: { select: PANEL_SELECT },
        inbounds: {
          include: {
            inbound: {
              include: {
                panel: { select: PANEL_SELECT },
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
        panel: { select: PANEL_SELECT },
        inbounds: {
          include: {
            inbound: {
              include: {
                panel: { select: PANEL_SELECT },
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
    const panel = inbound?.panel || client.panel || null;
    const panelType = String(panel?.panelType || '').toLowerCase();

    const envelope = parseConnectionExtras(client.connectionExtras);
    const protocol = this.resolveDisplayProtocol(
      envelope?.protocol,
      inbound?.protocol,
      panelType,
    );
    const outputType = isExternalPanelType(panelType)
      ? 'subscription'
      : resolveOutputType(protocol);

    const origin = await this.resolvePublicOrigin(client.adminId, opts?.origin);
    const skipCache = isExternalPanelType(panelType);
    const cacheKey = this.cache.buildKey({
      uuid: client.uuid,
      updatedAt: client.updatedAt,
      inboundId: inbound?.id,
      origin: origin || '',
    });
    if (!skipCache) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return cached;
      }
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
            panel: inbound.panel || panel,
          }
        : panel
          ? {
              id: '',
              protocol: panelType,
              port: 0,
              tag: '',
              panel,
            }
          : null,
      origin,
    };

    if (isExternalPanelType(panelType)) {
      model = await this.buildExternalPanelOutput(client, panel, panelType);
    } else if (outputType === 'wireguard') {
      model = buildWireGuardOutput(ctx);
    } else if (outputType === 'subscription') {
      model = buildSubscriptionOutput(ctx);
    } else {
      model = buildGenericOutput({ clientId: client.id, protocol });
    }

    if (!skipCache) {
      this.cache.set(cacheKey, model);
    }
    this.logger.debug(
      `Built output ${model.outputType} for client ${client.id} (${protocol})`,
    );
    return model;
  }

  /** Ignore placeholder `unknown` extras so native panel types can drive the renderer. */
  private resolveDisplayProtocol(
    extrasProtocol: string | undefined,
    inboundProtocol: string | undefined,
    panelType: string,
  ): string {
    const extra = String(extrasProtocol || '').toLowerCase().trim();
    if (extra && extra !== 'unknown') return extra;
    const inbound = String(inboundProtocol || '').toLowerCase().trim();
    if (inbound && inbound !== 'unknown') return inbound;
    if (isExternalPanelType(panelType)) return panelType;
    return extra || inbound || 'unknown';
  }

  private async buildExternalPanelOutput(
    client: any,
    panel: { id?: string; subUrl?: string | null } | null,
    panelType: string,
  ): Promise<ClientOutputModel> {
    const username = String(client.remoteUsername || client.email || '').trim();
    const panelId = String(panel?.id || client.panelId || '');
    const stored = subscriptionUrlFromProviderMeta(client.providerMeta);
    let nativeSubUrl = stored;

    if (panelId && username) {
      const live = await this.fetchLiveSubscriptionUrl(panelType, panelId, username);
      if (live) nativeSubUrl = live;
    }

    if (nativeSubUrl && nativeSubUrl !== stored) {
      void this.rememberSubscriptionUrl(client.id, client.providerMeta, nativeSubUrl);
    }

    const systemSubUrl = nativeSubUrl
      ? rewriteSubscriptionDeliveryHost(nativeSubUrl, panel?.subUrl)
      : '';

    return buildExternalPanelSubscriptionOutput({
      clientId: client.id,
      protocol: panelType,
      nativeSubUrl,
      systemSubUrl,
    });
  }

  private async fetchLiveSubscriptionUrl(
    panelType: string,
    panelId: string,
    username: string,
  ): Promise<string | null> {
    const driver = this.panelDrivers.get(panelType);
    if (!driver || driver.panelType !== panelType) return null;
    try {
      if (driver.getSubscriptionUrl) {
        const fromDriver = await driver.getSubscriptionUrl(panelId, username);
        if (fromDriver) return fromDriver;
      }
      const snap = await driver.getClient(panelId, username);
      return snap?.subscriptionUrl || null;
    } catch (err: any) {
      this.logger.warn(
        `Native sub URL fetch failed for ${username} on ${panelType}: ${err?.message || err}`,
      );
      return null;
    }
  }

  private rememberSubscriptionUrl(
    clientId: string,
    providerMeta: unknown,
    url: string,
  ): void {
    const meta =
      providerMeta && typeof providerMeta === 'object' && !Array.isArray(providerMeta)
        ? { ...(providerMeta as Record<string, unknown>) }
        : {};
    if (String(meta.subscriptionUrl || '') === url) return;
    void this.prisma.client
      .update({
        where: { id: clientId },
        data: {
          providerMeta: { ...meta, subscriptionUrl: url } as Prisma.InputJsonValue,
        },
      })
      .catch(() => undefined);
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
