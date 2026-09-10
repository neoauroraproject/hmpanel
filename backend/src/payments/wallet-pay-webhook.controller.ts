import {
  Body,
  Controller,
  HttpCode,
  Param,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PaymentManagementService } from './payment-management.service';

type RawBodyRequest = Request & { rawBody?: Buffer };

@Controller('premium-modules/payment-management/wallet-pay')
export class WalletPayWebhookController {
  constructor(private readonly payments: PaymentManagementService) {}

  @Post('webhook/:adminId')
  @HttpCode(200)
  async handleWebhook(
    @Param('adminId') adminId: string,
    @Req() req: RawBodyRequest,
    @Body() body: unknown,
  ) {
    const timestamp = String(req.headers['walletpay-timestamp'] || '').trim();
    const signature = String(req.headers['walletpay-signature'] || '').trim();
    if (!adminId || !timestamp || !signature) {
      throw new UnauthorizedException('Missing Wallet Pay webhook headers');
    }
    const rawBody =
      req.rawBody ||
      Buffer.from(typeof body === 'string' ? body : JSON.stringify(body ?? []), 'utf8');
    const uriPath = String(req.originalUrl || req.url || '').split('?')[0];
    return this.payments.handleWalletPayWebhook({
      adminId,
      httpMethod: String(req.method || 'POST'),
      uriPath,
      timestamp,
      signature,
      rawBody,
      parsedBody: body,
    });
  }
}
