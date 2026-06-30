import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';
import * as https from 'https';
import { Response, Request } from 'express';

@Injectable()
export class SubscriptionsService {
  private readonly logger = new Logger(SubscriptionsService.name);

  constructor(private prisma: PrismaService) {}

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
      portalSettings: (primaryClient.admin as any)?.portalSettings || {},
      inbound: allInbounds[0] || null,
      inbounds: allInbounds,
    };
  }

  async getSubscriptionNodes(id: string) {
    const details = await this.getSubscriptionDetails(id);
    const { email, subId, inbounds } = details;

    if (!inbounds || inbounds.length === 0) {
      return [];
    }

    const panelSubUrls = new Set<string>();
    for (const ib of inbounds) {
      if (ib.panel) {
        const url = ib.panel.subUrl || ib.panel.url;
        if (url) panelSubUrls.add(url);
      }
    }

    const nativeUrls: string[] = [];
    for (const pUrl of panelSubUrls) {
      let nativeUrl = '';
      try {
        const u = new URL(pUrl);
        const pathname = u.pathname.endsWith('/sub/')
          ? u.pathname
          : `${u.pathname.replace(/\/$/, '')}/sub/`;
        nativeUrl = `${u.origin}${pathname}${encodeURIComponent(subId || email)}`;
      } catch {
        const base = pUrl.endsWith('/') ? pUrl : `${pUrl}/`;
        if (base.includes('/sub/')) {
          nativeUrl = `${base}${encodeURIComponent(subId || email)}`;
        } else {
          nativeUrl = `${base}sub/${encodeURIComponent(subId || email)}`;
        }
      }
      nativeUrls.push(nativeUrl);
    }

    if (nativeUrls.length === 0) return [];

    try {
      const fetchPromises = nativeUrls.map((url) =>
        axios
          .get(url, {
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
            timeout: 10000,
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
      const nodes = [];

      for (const response of responses) {
        if (!response || !response.data) continue;

        let content = response.data;
        if (typeof content !== 'string') {
          content = JSON.stringify(content);
        }

        let decoded = content;
        try {
          decoded = Buffer.from(content, 'base64').toString('utf-8');
          if (!decoded.includes('://')) {
            decoded = content;
          }
        } catch (e) {
          decoded = content;
        }

        const lines = String(decoded)
          .split('\n')
          .map((l: string) => l.trim())
          .filter((l: string) => l.length > 0);
        for (const line of lines) {
          if (!line.includes('://')) continue;
          const [protocol, rest] = line.split('://');

          let tag = 'Unknown';
          if (rest && rest.includes('#')) {
            tag = decodeURIComponent(rest.split('#')[1]);
          }

          nodes.push({
            link: line,
            protocol: protocol.toUpperCase(),
            tag,
          });
        }
      }

      return nodes;
    } catch (error: any) {
      this.logger.error(`Failed to aggregate nodes`, error.message);
      return [];
    }
  }

  async proxySubscription(token: string, req: Request, res: Response) {
    try {
      const details = await this.getSubscriptionDetails(token);
      const { email, subId, inbounds } = details;

      if (!inbounds || inbounds.length === 0) {
        return res.status(404).send('Subscription not found');
      }

      const panelSubUrls = new Set<string>();
      for (const ib of inbounds) {
        if (ib.panel) {
          const url = ib.panel.subUrl || ib.panel.url;
          if (url) panelSubUrls.add(url);
        }
      }

      const nativeUrls: string[] = [];
      for (const pUrl of panelSubUrls) {
        let nativeUrl = '';
        try {
          const u = new URL(pUrl);
          const pathname = u.pathname.endsWith('/sub/')
            ? u.pathname
            : `${u.pathname.replace(/\/$/, '')}/sub/`;
          nativeUrl = `${u.origin}${pathname}${encodeURIComponent(subId || email)}`;
        } catch {
          const base = pUrl.endsWith('/') ? pUrl : `${pUrl}/`;
          if (base.includes('/sub/')) {
            nativeUrl = `${base}${encodeURIComponent(subId || email)}`;
          } else {
            nativeUrl = `${base}sub/${encodeURIComponent(subId || email)}`;
          }
        }
        nativeUrls.push(nativeUrl);
      }

      const headers: any = {};
      if (req.headers['user-agent'])
        headers['User-Agent'] = req.headers['user-agent'];
      if (req.headers['accept']) headers['Accept'] = req.headers['accept'];
      if (req.headers['accept-language'])
        headers['Accept-Language'] = req.headers['accept-language'];

      const fetchPromises = nativeUrls.map((url) =>
        axios
          .get(url, {
            headers,
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
            timeout: 10000,
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
      let combinedData = '';
      let firstValidResponse = null;

      for (const response of responses) {
        if (!response || !response.data) continue;
        if (!firstValidResponse) firstValidResponse = response;

        let content = response.data;
        if (typeof content !== 'string') {
          content = JSON.stringify(content);
        }

        let decoded = content;
        try {
          decoded = Buffer.from(content, 'base64').toString('utf-8');
          if (!decoded.includes('://')) {
            decoded = content;
          }
        } catch (e) {
          decoded = content;
        }

        combinedData += decoded + '\n';
      }

      if (!firstValidResponse) {
        return res.status(502).send('Bad Gateway - No panels responded');
      }

      const totalTraffic = details.total;
      const usedTraffic = details.up + details.down;
      const expireDate = Math.floor(details.expiryTime / 1000);

      res.setHeader(
        'Subscription-Userinfo',
        `upload=${details.up}; download=${details.down}; total=${totalTraffic}; expire=${expireDate}`,
      );

      const headersToForward = [
        'profile-update-interval',
        'profile-web-page-url',
        'content-type',
        'content-disposition',
      ];

      for (const h of headersToForward) {
        if (firstValidResponse.headers[h]) {
          res.setHeader(h, firstValidResponse.headers[h]);
        }
      }

      const finalBase64 = Buffer.from(combinedData.trim()).toString('base64');
      res.send(finalBase64);
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
}
