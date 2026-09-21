import {
  Controller,
  Get,
  Param,
  Res,
  Req,
  NotFoundException,
} from '@nestjs/common';
import type { Response, Request } from 'express';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { ClientOutputService } from '../clients/output/client-output.service';
import { getRequestOrigin } from '../common/utils/request-origin';
import { isBrowserNavigation } from '../common/utils/browser-navigation.util';

@ApiTags('Subscriptions (Public)')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly clientOutput: ClientOutputService,
  ) {}

  @Get(':id')
  @ApiOperation({
    summary: 'Get public subscription portal info for a client UUID/ID',
  })
  getSubscriptionDetails(@Param('id') id: string) {
    return this.subscriptionsService.getSubscriptionDetails(id);
  }

  @Get(':id/output')
  @ApiOperation({ summary: 'Protocol-aware connection output for portal / storefront' })
  getOutput(@Param('id') id: string, @Req() req: Request) {
    const origin = getRequestOrigin(req);
    return this.clientOutput.getOutputBySubscriptionKey(id, { origin });
  }

  @Get(':id/config')
  @ApiOperation({
    summary: 'Download protocol config file (WireGuard .conf) — attachment',
  })
  async downloadConfig(@Param('id') id: string, @Res() res: Response) {
    const file = await this.clientOutput.getConfigFile(id, 'subscriptionKey');
    if (!file) {
      throw new NotFoundException('No downloadable config for this subscription');
    }
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename.replace(/"/g, '')}"`,
    );
    return res.send(file.configText);
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
  @ApiOperation({
    summary:
      'Get raw native subscription content proxy or redirect browsers to portal',
  })
  async proxySubscription(
    @Param('token') token: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    // Real browser navigation → HTML portal. VPN clients (even Mozilla-like UAs) → raw sub.
    if (isBrowserNavigation({ headers: req.headers, query: req.query as Record<string, unknown> })) {
      return res.redirect(`/p/${encodeURIComponent(token)}`);
    }

    return this.subscriptionsService.proxySubscription(token, req, res);
  }
}
