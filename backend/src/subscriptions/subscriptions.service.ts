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
    const client = await this.prisma.client.findFirst({
      where: {
        OR: [
          { subId: id },
          { id: id },
          { email: id },
          { uuid: id }
        ]
      },
      include: {
        admin: {
          select: {
            portalSettings: true,
          }
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
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!client) {
      throw new NotFoundException('Subscription not found');
    }

    const inbound = client.inbounds?.[0]?.inbound || null;
    const inbounds = client.inbounds?.map(ci => ci.inbound) || [];

    return {
      id: client.id,
      uuid: client.uuid,
      subId: client.subId,
      subToken: client.subToken,
      email: client.email,
      remark: client.remark,
      enable: client.enable,
      up: Number(client.up),
      down: Number(client.down),
      total: Number(client.total),
      expiryTime: Number(client.expiryTime),
      createdAt: client.createdAt,
      portalSettings: (client.admin as any)?.portalSettings || {},
      inbound,
      inbounds,
    };
  }

  async getSubscriptionNodes(id: string) {
    const details = await this.getSubscriptionDetails(id);
    const { email, subId, inbound } = details;
    
    if (!inbound || !inbound.panel) {
      return [];
    }

    let nativeUrl = '';
    const panelSubUrl = inbound.panel.subUrl || inbound.panel.url || '';
    try {
      const pUrl = new URL(panelSubUrl);
      const pathname = pUrl.pathname.endsWith('/sub/') ? pUrl.pathname : `${pUrl.pathname.replace(/\/$/, '')}/sub/`;
      nativeUrl = `${pUrl.origin}${pathname}${encodeURIComponent(subId || email)}`;
    } catch {
      const base = panelSubUrl.endsWith('/') ? panelSubUrl : `${panelSubUrl}/`;
      if (base.includes('/sub/')) {
        nativeUrl = `${base}${encodeURIComponent(subId || email)}`;
      } else {
        nativeUrl = `${base}sub/${encodeURIComponent(subId || email)}`;
      }
    }

    if (!nativeUrl || nativeUrl.includes('undefined')) {
      return [];
    }

    try {
      const response = await axios.get(nativeUrl, {
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        timeout: 10000,
      });

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

      const lines = String(decoded).split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0);
      const nodes = [];

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

      return nodes;
    } catch (error: any) {
      this.logger.error(`Failed to fetch native nodes from ${nativeUrl}`, error.message);
      return [];
    }
  }

  async proxySubscription(token: string, req: Request, res: Response) {
    const client = await this.prisma.client.findFirst({
      where: { 
        OR: [
          { subToken: token },
          { subId: token },
          { uuid: token }
        ]
      },
      include: {
        inbounds: {
          select: {
            inbound: {
              select: {
                panel: {
                  select: { subUrl: true, url: true }
                }
              }
            }
          }
        }
      }
    });

    const inbound = client?.inbounds?.[0]?.inbound || null;

    if (!client || !inbound || !inbound.panel) {
      return res.status(404).send('Subscription not found');
    }

    let nativeUrl = '';
    const panelSubUrl = inbound.panel.subUrl || inbound.panel.url || '';
    try {
      const pUrl = new URL(panelSubUrl);
      const pathname = pUrl.pathname.endsWith('/sub/') ? pUrl.pathname : `${pUrl.pathname.replace(/\/$/, '')}/sub/`;
      nativeUrl = `${pUrl.origin}${pathname}${encodeURIComponent(client.subId || client.email)}`;
    } catch {
      const base = panelSubUrl.endsWith('/') ? panelSubUrl : `${panelSubUrl}/`;
      if (base.includes('/sub/')) {
        nativeUrl = `${base}${encodeURIComponent(client.subId || client.email)}`;
      } else {
        nativeUrl = `${base}sub/${encodeURIComponent(client.subId || client.email)}`;
      }
    }

    try {
      const headers: any = {};
      if (req.headers['user-agent']) {
        headers['User-Agent'] = req.headers['user-agent'];
      }

      const response = await axios.get(nativeUrl, {
        headers,
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
        responseType: 'stream',
        timeout: 10000,
      });

      // Forward headers from 3x-ui
      const headersToForward = [
        'subscription-userinfo',
        'profile-update-interval',
        'profile-web-page-url',
        'content-type',
        'content-disposition'
      ];

      for (const h of headersToForward) {
        if (response.headers[h]) {
          res.setHeader(h, response.headers[h]);
        }
      }

      response.data.pipe(res);
    } catch (error: any) {
      this.logger.error(`Failed to proxy native subscription from ${nativeUrl}`, error.message);
      res.status(502).send('Bad Gateway');
    }
  }
}
