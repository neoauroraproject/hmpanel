import { Injectable, NotFoundException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import axios from 'axios';
import * as https from 'https';
import { Response } from 'express';

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
    });

    if (!client) {
      throw new NotFoundException('Subscription not found');
    }

    // Prepare a sanitized response to avoid leaking sensitive fields 
    // although client model doesn't have highly sensitive fields natively, we explicitly pick them.
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
      portalSettings: client.admin?.portalSettings || {},
      inbound: client.inbound,
    };
  }

  async getSubscriptionNodes(id: string) {
    const details = await this.getSubscriptionDetails(id);
    const { email, subId, inbound } = details;
    
    if (!inbound || !inbound.panel) {
      return [];
    }

    let nativeUrl = '';
    try {
      const pUrl = new URL(inbound.panel.subUrl || inbound.panel.url || '');
      nativeUrl = `${pUrl.origin}/sub/${subId || email}`;
    } catch {
      nativeUrl = `${inbound.panel.subUrl || inbound.panel.url}/sub/${subId || email}`;
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

  async proxySubscription(token: string, res: Response) {
    const client = await this.prisma.client.findFirst({
      where: { subToken: token },
      include: {
        inbound: {
          select: {
            panel: {
              select: { subUrl: true, url: true }
            }
          }
        }
      }
    });

    if (!client || !client.inbound || !client.inbound.panel) {
      return res.status(404).send('Subscription not found');
    }

    let nativeUrl = '';
    try {
      const pUrl = new URL(client.inbound.panel.subUrl || client.inbound.panel.url || '');
      nativeUrl = `${pUrl.origin}/sub/${client.subId || client.email}`;
    } catch {
      nativeUrl = `${client.inbound.panel.subUrl || client.inbound.panel.url}/sub/${client.subId || client.email}`;
    }

    try {
      const response = await axios.get(nativeUrl, {
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
