import { Controller, Get, Param, Res, Req } from '@nestjs/common';
import type { Response, Request } from 'express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';

@ApiTags('Subscriptions (Public)')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get(':id')
  @ApiOperation({ summary: 'Get public subscription portal info for a client UUID/ID' })
  getSubscriptionDetails(@Param('id') id: string) {
    return this.subscriptionsService.getSubscriptionDetails(id);
  }

  @Get(':id/nodes')
  @ApiOperation({ summary: 'Get base64 decoded nodes for a subscription' })
  getSubscriptionNodes(@Param('id') id: string) {
    return this.subscriptionsService.getSubscriptionNodes(id);
  }
}

@ApiTags('Subscriptions (Legacy/Raw)')
@Controller('s')
export class PublicSubController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get(':token')
  @ApiOperation({ summary: 'Get raw native subscription content proxy or redirect browsers to portal' })
  async proxySubscription(@Param('token') token: string, @Req() req: Request, @Res() res: Response) {
    const userAgent = (req.headers['user-agent'] || '').toLowerCase();
    const isBrowser = userAgent.includes('mozilla') || userAgent.includes('chrome') || userAgent.includes('safari') || userAgent.includes('edge');

    // If it's a browser (and they didn't explicitly request raw), redirect to the React portal themes
    if (isBrowser && !req.query.raw) {
       return res.redirect(`/p/${token}`);
    }
    
    // Otherwise, for VPN apps (v2rayng, shadowrocket, etc.), proxy the raw config stream
    return this.subscriptionsService.proxySubscription(token, req, res);
  }
}
