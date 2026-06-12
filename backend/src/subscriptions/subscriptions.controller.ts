import { Controller, Get, Param, Res } from '@nestjs/common';
import type { Response } from 'express';
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
  async proxySubscription(@Param('token') token: string, @Res() res: Response) {
    return this.subscriptionsService.proxySubscription(token, res);
  }
}

