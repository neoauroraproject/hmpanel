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
    if (this.isBrowserNavigation(req)) {
      return res.redirect(`/p/${token}`);
    }

    return this.subscriptionsService.proxySubscription(token, req, res);
  }

  /**
   * Do NOT treat every UA containing "mozilla" as a browser — many VPN clients
   * (Clash Meta, some v2rayN builds, Electron wrappers) include Mozilla/5.0 and
   * were incorrectly redirected to the HTML portal (import failed; v2box worked).
   */
  private isBrowserNavigation(req: Request): boolean {
    // Debug escape only — never emit ?raw=1 on shareable QR/copy URLs
    const raw = req.query.raw;
    if (raw != null && String(raw) !== '0' && String(raw).toLowerCase() !== 'false') {
      return false;
    }

    const ua = String(req.headers['user-agent'] || '');
    const uaLower = ua.toLowerCase();
    if (!uaLower) return false;

    const vpnHints = [
      'v2ray',
      'v2box',
      'clash',
      'clashmeta',
      'flclash',
      'sing-box',
      'singbox',
      'hiddify',
      'hiddifynext',
      'shadowrocket',
      'streisand',
      'quantumult',
      'surge',
      'loon',
      'stash',
      'nekoray',
      'nekobox',
      'sfa/',
      'sfm/',
      'surfboard',
      'okhttp',
      'go-http-client',
      'dart/',
      'cfnetwork',
      'pharos',
      'napsternet',
      'foxray',
      'happ/',
      'karing',
      'streisand',
      'v2rayng',
      'v2rayn',
      'panelsub',
      'electron',
    ];
    if (vpnHints.some((h) => uaLower.includes(h))) return false;

    const mode = String(req.headers['sec-fetch-mode'] || '').toLowerCase();
    const dest = String(req.headers['sec-fetch-dest'] || '').toLowerCase();
    const user = String(req.headers['sec-fetch-user'] || '');
    if (mode === 'navigate' || dest === 'document' || user === '?1') return true;

    const accept = String(req.headers['accept'] || '').toLowerCase();
    const htmlPreferred =
      accept.startsWith('text/html') ||
      (accept.includes('text/html') &&
        (accept.indexOf('*/*') === -1 ||
          accept.indexOf('text/html') < accept.indexOf('*/*')));

    // Prefer real browser engines; avoid bare "mozilla" alone (VPN clients spoof it)
    const browserUa =
      /chrome\/\d|crios\/\d|firefox\/\d|fxios\/\d|edg\/\d|edgios\/\d|safari\/\d|opr\/\d|samsungbrowser/i.test(
        ua,
      );

    if (htmlPreferred && browserUa) return true;

    return false;
  }
}
