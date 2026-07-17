import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Headers,
  Req,
  UnauthorizedException,
  HttpCode,
} from '@nestjs/common';
import type { Request } from 'express';
import { StoreService } from './store.service';
import { StoreTelegramService } from './store-telegram.service';

@Controller('store')
export class StorePublicController {
  constructor(
    private readonly store: StoreService,
    private readonly telegram: StoreTelegramService,
  ) {}

  private getRequestKey(req: Request) {
    return req.ip || req.headers['x-forwarded-for']?.toString() || 'store-public';
  }

  private getSessionToken(headerValue?: string) {
    if (!headerValue) {
      throw new UnauthorizedException('Missing customer session');
    }
    return headerValue;
  }

  @Get('public/:slug')
  getPublicStore(@Param('slug') slug: string) {
    return this.store.getPublicStoreBySlug(slug);
  }

  @Get('public/by-domain')
  getPublicStoreByDomain(@Headers('host') host: string, @Query('domain') domain?: string) {
    return this.store.getPublicStoreByDomain(domain || host);
  }

  @Post('public/:slug/customer')
  lookupCustomer(
    @Param('slug') slug: string,
    @Body('token') token: string,
    @Req() req: Request,
  ) {
    return this.store.lookupCustomer(slug, token, this.getRequestKey(req));
  }

  @Post('public/:slug/order')
  createOrder(
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    return this.store.createCheckout(slug, body as any, this.getRequestKey(req));
  }

  @Get('track/:code')
  trackOrder(@Param('code') code: string, @Req() req: Request) {
    return this.store.trackOrder(code, this.getRequestKey(req));
  }

  @Post('customer/session')
  createCustomerSession(
    @Body('token') token: string,
    @Headers('user-agent') userAgent: string,
    @Req() req: Request,
  ) {
    return this.store.createCustomerSession(token, this.getRequestKey(req), {
      userAgent,
      ipAddress: req.ip,
    });
  }

  @Get('customer/session')
  getCustomerSession(@Headers('x-customer-session') sessionToken?: string) {
    return this.store.getCustomerSession(this.getSessionToken(sessionToken));
  }

  @Post('customer/logout')
  logoutCustomerSession(@Headers('x-customer-session') sessionToken?: string) {
    return this.store.logoutCustomerSession(this.getSessionToken(sessionToken));
  }

  @Post('customer/notifications/:id/read')
  markNotificationRead(
    @Param('id') notificationId: string,
    @Headers('x-customer-session') sessionToken?: string,
  ) {
    return this.store.markNotificationAsRead(this.getSessionToken(sessionToken), notificationId);
  }

  @Post('customer/notifications/read-all')
  markAllNotificationsRead(@Headers('x-customer-session') sessionToken?: string) {
    return this.store.markAllNotificationsAsRead(this.getSessionToken(sessionToken));
  }

  @Get('portal/:token')
  getPortal(@Param('token') token: string) {
    return this.store.getCustomerPortal(token);
  }

  @Post('portal/:token/renew')
  renewOrder(
    @Param('token') token: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    return this.store.createRenewCheckout(token, body as any, this.getRequestKey(req));
  }

  @Post('customer/renew')
  renewOrderWithSession(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @Headers('x-customer-session') sessionToken?: string,
  ) {
    return this.store.createRenewCheckoutFromSession(
      this.getSessionToken(sessionToken),
      body as any,
      this.getRequestKey(req),
    );
  }

  @Post('customer/order')
  createOrderWithSession(
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
    @Headers('x-customer-session') sessionToken?: string,
  ) {
    return this.store.createCheckoutFromSession(
      this.getSessionToken(sessionToken),
      body as any,
      this.getRequestKey(req),
    );
  }

  @Post('customer/orders/:id/cancel')
  cancelOrderWithSession(
    @Param('id') id: string,
    @Headers('x-customer-session') sessionToken?: string,
  ) {
    return this.store.cancelOrderByCustomer(this.getSessionToken(sessionToken), id);
  }

  @Post('customer/services/claim')
  claimServiceByLink(
    @Body('subscriptionLink') subscriptionLink: string,
    @Headers('x-customer-session') sessionToken?: string,
  ) {
    return this.store.claimServiceBySubscriptionLink(
      this.getSessionToken(sessionToken),
      subscriptionLink,
    );
  }

  @Post('telegram/session')
  async createTelegramSession(
    @Body() body: { slug?: string; initData?: string },
    @Headers('user-agent') userAgent: string,
    @Req() req: Request,
  ) {
    const slug = String(body?.slug || '').trim();
    const initData = String(body?.initData || '').trim();
    if (!slug || !initData) {
      throw new UnauthorizedException('slug and initData are required');
    }
    const session = await this.telegram.createSessionFromInitData(
      slug,
      initData,
      this.getRequestKey(req),
      { userAgent, ipAddress: req.ip },
    );
    const dashboard = await this.store.getCustomerSession(session.sessionToken);
    return { ...session, dashboard };
  }

  @Post('telegram/webhook/:slug/:secret')
  @HttpCode(200)
  handleTelegramWebhook(
    @Param('slug') slug: string,
    @Param('secret') secret: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.telegram.handleWebhook(slug, secret, body);
  }
}
