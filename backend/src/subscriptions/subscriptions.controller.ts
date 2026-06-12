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
  @ApiOperation({ summary: 'Get raw native subscription content proxy' })
  async proxySubscription(@Param('token') token: string, @Req() req: Request, @Res() res: Response) {
    return this.subscriptionsService.proxySubscription(token, req, res);
  }
}

@ApiTags('Subscriptions Assets (3x-ui Proxy)')
@Controller('sub')
export class SubAssetsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  @Get('*')
  @ApiOperation({ summary: 'Proxy 3x-ui assets' })
  async proxyAssets(@Req() req: Request, @Res() res: Response) {
    return this.subscriptionsService.proxyAssets(req, res);
  }
}

