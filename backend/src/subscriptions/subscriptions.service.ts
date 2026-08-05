import {
  Injectable,
  NotFoundException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';
import * as https from 'https';
import { Response, Request } from 'express';
import { normalizeTelegramLink } from '../common/utils/telegram-link';
import { collectNativeSubscriptionUrls } from '../common/utils/native-sub-url';
import { PanelsService } from '../panels/panels.service';

type PortalNode = { link: string; protocol: string; tag: string };

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => PanelsService))
    private panelsService: PanelsService,
  ) {}

  async getSubscriptionDetails(id: string) {
    const clients = await this.prisma.client.findMany({
      where: {
        OR: [
          { subId: id },
          { id: id },
          { email: id },
          { uuid: id },
          { subToken: id },
        ],
      },
      include: {
        admin: {
          select: {
            portalSettings: true,
          },
        },
        inbounds: {
          select: {
            inbound: {
              select: {
                id: true,
                tag: true,
                port: true,
                protocol: true,
                panel: {
                  select: {
                    id: true,
                    name: true,
                    url: true,
                    subUrl: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!clients || clients.length === 0) {
      throw new NotFoundException('Subscription not found');
    }

    const primaryClient = clients[0];
    const adminPortal =
      ((primaryClient.admin as any)?.portalSettings as Record<string, unknown> | null) || {};

    // Prefer Brand.theme (Premium Branding) as source of truth for portal themes.
    let portalSettings: Record<string, unknown> = { ...adminPortal };
    try {
      const adminId = (primaryClient as any).adminId as string | null | undefined;
      if (adminId) {
        const brand = await this.prisma.brand.findUnique({
          where: { adminId },
          select: { theme: true, logo: true, logoDark: true, name: true, primaryColor: true },
        });
        if (brand) {
          portalSettings = {
            ...portalSettings,
            theme: brand.theme || portalSettings.theme,
            logoUrl: portalSettings.logoUrl || brand.logo || undefined,
            logoDarkUrl: portalSettings.logoDarkUrl || brand.logoDark || undefined,
            portalName: portalSettings.portalName || brand.name || undefined,
            primaryColor: portalSettings.primaryColor || brand.primaryColor || undefined,
          };
        }
      }
    } catch {
      /* Brand table may be absent on some installs */
    }

    if (portalSettings.telegramLink) {
      portalSettings = {
        ...portalSettings,
        telegramLink: normalizeTelegramLink(String(portalSettings.telegramLink)),
      };
    }

    let totalUp = 0n;
    let totalDown = 0n;
    let maxTotal = 0n;
    const allInbounds = [];

    for (const c of clients) {
      totalUp += c.up;
      totalDown += c.down;
      if (c.total > maxTotal) maxTotal = c.total;

      if (c.inbounds) {
        for (const ci of c.inbounds) {
          if (ci.inbound) allInbounds.push(ci.inbound);
        }
      }
    }

    return {
      id: primaryClient.id,
      uuid: primaryClient.uuid,
      subId: primaryClient.subId,
      subToken: primaryClient.subToken,
      email: primaryClient.email,
      remark: primaryClient.remark,
      enable: primaryClient.enable,
      up: Number(totalUp),
      down: Number(totalDown),
      total: Number(maxTotal),
      expiryTime: Number(primaryClient.expiryTime),
      createdAt: primaryClient.createdAt,
      portalSettings,
      inbound: allInbounds[0] || null,
      inbounds: allInbounds,
    };
  }

  private looksLikeClash(s: string) {
    return (
      /^\s*(proxies|proxy-groups|rules|mixed-port|port)\s*:/m.test(s) ||
      s.includes('proxy-groups:') ||
      s.includes('\nproxies:')
    );
  }

  private tryDecodeSubBody(content: string): string {
    const trimmed = content.trim();
    if (!trimmed) return '';
    if (this.looksLikeClash(trimmed) || /:\/\//.test(trimmed)) return trimmed;
    try {
      const decoded = Buffer.from(trimmed, 'base64').toString('utf-8');
      if (this.looksLikeClash(decoded) || /:\/\//.test(decoded)) return decoded;
    } catch {
      /* keep original */
    }
    return trimmed;
  }

  private uriLineToNode(line: string): PortalNode {
    const [protocol, rest] = line.split('://');
    let tag = 'Unknown';
    if (rest && rest.includes('#')) {
      try {
        tag = decodeURIComponent(rest.split('#').slice(1).join('#'));
      } catch {
        tag = rest.split('#').slice(1).join('#');
      }
    }
    return {
      link: line,
      protocol: (protocol || 'unknown').toUpperCase(),
      tag,
    };
  }

  private parseUriNodesFromText(content: string): PortalNode[] {
    const decoded = this.tryDecodeSubBody(content);
    const lines = String(decoded)
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    const nodes: PortalNode[] = [];
    const seen = new Set<string>();
    for (const line of lines) {
      if (!/^[a-z0-9+.-]+:\/\//i.test(line)) continue;
      if (seen.has(line)) continue;
      seen.add(line);
      nodes.push(this.uriLineToNode(line));
    }
    return nodes;
  }

  /** Unique panel ids linked through ClientInbound. */
  private collectPanelIds(
    inbounds: Array<{ panel?: { id?: string } | null }>,
  ): string[] {
    const ids = new Set<string>();
    for (const ib of inbounds || []) {
      const id = ib?.panel?.id;
      if (id) ids.add(id);
    }
    return [...ids];
  }

  /**
   * Fallback when public /sub/ is unreachable from this host:
   * pull the same URI list via authenticated 3x-ui API.
   */
  private async fetchNodesFromPanelApi(
    inbounds: Array<{ panel?: { id?: string } | null }>,
    email: string,
    subId?: string | null,
  ): Promise<PortalNode[]> {
    const panelIds = this.collectPanelIds(inbounds);
    if (panelIds.length === 0) return [];

    const seen = new Set<string>();
    const nodes: PortalNode[] = [];
    for (const panelId of panelIds) {
      try {
        const links = await this.panelsService.getClientProtocolLinks(panelId, {
          email,
          subId,
        });
        for (const link of links) {
          if (seen.has(link)) continue;
          seen.add(link);
          nodes.push(this.uriLineToNode(link));
        }
      } catch (err: any) {
        this.logger.warn(
          `[SUB_NODES] Panel API links failed panel=${panelId}: ${err.message}`,
        );
      }
    }
    return nodes;
  }

  async getSubscriptionNodes(id: string) {
    const details = await this.getSubscriptionDetails(id);
    const { email, subId, inbounds } = details;

    if (!inbounds || inbounds.length === 0) {
      this.logger.warn(
        `[SUB_NODES] No ClientInbound links for sub key=${id} email=${email}`,
      );
      // Still try panel API if we know the panel via client.panelId
      const client = await this.prisma.client.findFirst({
        where: { email },
        select: { panelId: true, subId: true },
      });
      if (client?.panelId) {
        const links = await this.panelsService.getClientProtocolLinks(
          client.panelId,
          { email, subId: client.subId || subId },
        );
        return links.map((l) => this.uriLineToNode(l));
      }
      return [];
    }

    const nativeUrls = collectNativeSubscriptionUrls(
      inbounds,
      subId || email,
    );

    const nodes: PortalNode[] = [];
    const seen = new Set<string>();

    if (nativeUrls.length > 0) {
      this.logger.debug(
        `[SUB_NODES] Fetching ${nativeUrls.length} native feed(s) for email=${email}`,
      );
      try {
        const fetchPromises = nativeUrls.map((url) =>
          axios
            .get(url, {
              httpsAgent: new https.Agent({ rejectUnauthorized: false }),
              timeout: 10000,
              responseType: 'text',
              transformResponse: [(d) => d],
            })
            .catch((err) => {
              this.logger.error(
                `Failed to fetch native nodes from ${url}`,
                err.message,
              );
              return null;
            }),
        );

        const responses = await Promise.all(fetchPromises);
        for (const response of responses) {
          if (!response || response.data == null) continue;
          let content = response.data;
          if (typeof content !== 'string') {
            content = JSON.stringify(content);
          }
          for (const node of this.parseUriNodesFromText(content)) {
            if (seen.has(node.link)) continue;
            seen.add(node.link);
            nodes.push(node);
          }
        }
      } catch (error: any) {
        this.logger.error(`Failed to aggregate nodes`, error.message);
      }
    }

    if (nodes.length === 0) {
      this.logger.warn(
        `[SUB_NODES] Native feed empty for email=${email}; trying panel API links`,
      );
      const apiNodes = await this.fetchNodesFromPanelApi(
        inbounds,
        email,
        subId,
      );
      for (const node of apiNodes) {
        if (seen.has(node.link)) continue;
        seen.add(node.link);
        nodes.push(node);
      }
    }

    if (nodes.length === 0) {
      this.logger.warn(
        `[SUB_NODES] No URI nodes for email=${email} (native + panel API)`,
      );
    } else {
      this.logger.log(
        `[SUB_NODES] email=${email} → ${nodes.length} node(s)`,
      );
    }

    return nodes;
  }

  async proxySubscription(token: string, req: Request, res: Response) {
    try {
      const details = await this.getSubscriptionDetails(token);
      const { email, subId, inbounds } = details;

      if (!inbounds || inbounds.length === 0) {
        // Last chance: panel API from client.panelId
        const client = await this.prisma.client.findFirst({
          where: {
            OR: [{ subId: token }, { email: token }, { subToken: token }],
          },
          select: { panelId: true, email: true, subId: true, remark: true, up: true, down: true, total: true, expiryTime: true },
        });
        if (!client?.panelId) {
          return res.status(404).send('Subscription not found');
        }
        const links = await this.panelsService.getClientProtocolLinks(
          client.panelId,
          { email: client.email, subId: client.subId },
        );
        if (!links.length) {
          return res.status(404).send('Subscription not found');
        }
        this.writeSubscriptionHeaders(res, {
          up: Number(client.up),
          down: Number(client.down),
          total: Number(client.total),
          expiryTime: Number(client.expiryTime),
          remark: client.remark,
          email: client.email,
          portalSettings: details.portalSettings,
        });
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        return res.send(Buffer.from(links.join('\n')).toString('base64'));
      }

      const nativeUrls = collectNativeSubscriptionUrls(
        inbounds,
        subId || email,
      );

      const headers: any = {};
      if (req.headers['user-agent'])
        headers['User-Agent'] = req.headers['user-agent'];
      if (req.headers['accept']) headers['Accept'] = req.headers['accept'];
      if (req.headers['accept-language'])
        headers['Accept-Language'] = req.headers['accept-language'];

      let combinedData = '';
      let firstValidResponse: any = null;
      let sawClashYaml = false;

      if (nativeUrls.length > 0) {
        const fetchPromises = nativeUrls.map((url) =>
          axios
            .get(url, {
              headers,
              httpsAgent: new https.Agent({ rejectUnauthorized: false }),
              timeout: 10000,
              responseType: 'text',
              transformResponse: [(d) => d],
            })
            .catch((err) => {
              this.logger.error(
                `Failed to proxy native subscription from ${url}`,
                err.message,
              );
              return null;
            }),
        );

        const responses = await Promise.all(fetchPromises);
        for (const response of responses) {
          if (!response || response.data == null) continue;
          if (!firstValidResponse) firstValidResponse = response;

          let content = response.data;
          if (typeof content !== 'string') {
            content = JSON.stringify(content);
          }

          const decoded = this.tryDecodeSubBody(content);
          if (this.looksLikeClash(decoded)) sawClashYaml = true;
          combinedData += decoded + '\n';
        }
      }

      this.writeSubscriptionHeaders(res, details);

      if (firstValidResponse) {
        const headersToForward = [
          'profile-update-interval',
          'profile-web-page-url',
          'content-disposition',
          'announce',
          'update-interval',
        ];
        for (const h of headersToForward) {
          if (firstValidResponse.headers[h]) {
            res.setHeader(h, firstValidResponse.headers[h]);
          }
        }
      }

      // Single Clash YAML response: passthrough
      if (
        firstValidResponse &&
        sawClashYaml &&
        combinedData.trim() &&
        !combinedData.includes('vless://') &&
        !combinedData.includes('vmess://')
      ) {
        const raw = firstValidResponse.data;
        const body = typeof raw === 'string' ? raw : JSON.stringify(raw);
        res.setHeader(
          'Content-Type',
          firstValidResponse.headers['content-type'] ||
            'text/yaml; charset=utf-8',
        );
        return res.send(body);
      }

      const lines = combinedData
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      let uriLines = lines.filter((l) => /^[a-z0-9+.-]+:\/\//i.test(l));

      // Public /sub/ often unreachable from HMPanel host; fill via panel API.
      if (uriLines.length === 0) {
        this.logger.warn(
          `[SUB_PROXY] Native feed empty for email=${email}; trying panel API links`,
        );
        const apiNodes = await this.fetchNodesFromPanelApi(
          inbounds,
          email,
          subId,
        );
        uriLines = apiNodes.map((n) => n.link);
      }

      if (uriLines.length === 0 && !lines.length) {
        return res.status(502).send('Bad Gateway - No panels responded');
      }

      const payload = (uriLines.length ? uriLines : lines).join('\n');
      const finalBase64 = Buffer.from(payload).toString('base64');

      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.send(finalBase64);
    } catch (error: any) {
      if (error instanceof NotFoundException) {
        return res.status(404).send('Subscription not found');
      }
      this.logger.error(
        `Failed to aggregate and proxy subscription`,
        error.message,
      );
      res.status(502).send('Bad Gateway');
    }
  }

  private writeSubscriptionHeaders(
    res: Response,
    details: {
      up: number;
      down: number;
      total: number;
      expiryTime: number;
      remark?: string | null;
      email?: string | null;
      portalSettings?: Record<string, unknown> | null;
    },
  ) {
    const expireDate = Math.floor(Number(details.expiryTime || 0) / 1000);
    res.setHeader(
      'Subscription-Userinfo',
      `upload=${details.up}; download=${details.down}; total=${details.total}; expire=${expireDate}`,
    );

    const titleSource =
      String(details.remark || details.email || 'subscription').trim() ||
      'subscription';
    res.setHeader(
      'profile-title',
      `base64:${Buffer.from(titleSource, 'utf8').toString('base64')}`,
    );

    const ps = details.portalSettings || {};
    if (ps.websiteUrl) {
      res.setHeader('support-url', String(ps.websiteUrl));
    } else if (ps.telegramLink) {
      res.setHeader(
        'support-url',
        normalizeTelegramLink(String(ps.telegramLink)),
      );
    }
  }
}
