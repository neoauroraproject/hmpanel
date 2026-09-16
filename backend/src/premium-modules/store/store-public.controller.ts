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
import { StoreWalletService } from './store-wallet.service';
import { StoreCustomerAuthService } from './store-customer-auth.service';

@Controller('store')
export class StorePublicController {
  constructor(
    private readonly store: StoreService,
    private readonly telegram: StoreTelegramService,
    private readonly wallet: StoreWalletService,
    private readonly customerAuth: StoreCustomerAuthService,
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

  @Post('public/:slug/coupon/validate')
  validateCouponPublic(
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    this.getRequestKey(req);
    return this.store.previewCoupon({
      slug,
      productId: String(body.productId || ''),
      customerToken: body.customerToken ? String(body.customerToken) : undefined,
      couponCode: body.couponCode ? String(body.couponCode) : undefined,
      limitIp: body.limitIp != null ? Number(body.limitIp) : undefined,
      selectedAddonIds: Array.isArray(body.selectedAddonIds)
        ? body.selectedAddonIds.map((v) => String(v))
        : undefined,
      isRenewal: body.isRenewal === true,
    });
  }

  @Post('public/:slug/coupons/applicable')
  listApplicableCouponsPublic(
    @Param('slug') slug: string,
    @Body() body: Record<string, unknown>,
    @Req() req: Request,
  ) {
    this.getRequestKey(req);
    return this.store.listApplicableCoupons({
      slug,
      productId: String(body.productId || ''),
      customerToken: body.customerToken ? String(body.customerToken) : undefined,
      limitIp: body.limitIp != null ? Number(body.limitIp) : undefined,
      selectedAddonIds: Array.isArray(body.selectedAddonIds)
        ? body.selectedAddonIds.map((v) => String(v))
        : undefined,
      isRenewal: body.isRenewal === true,
    });
  }

  @Post('customer/coupons/applicable')
  async listApplicableCouponsSession(
    @Body() body: Record<string, unknown>,
    @Headers('x-customer-session') sessionToken?: string,
  ) {
    const session = this.getSessionToken(sessionToken);
    const customer = await this.customerAuth.validateSession(session);
    return this.store.listApplicableCoupons({
      adminId: customer.adminId,
      productId: String(body.productId || ''),
      limitIp: body.limitIp != null ? Number(body.limitIp) : undefined,
      selectedAddonIds: Array.isArray(body.selectedAddonIds)
        ? body.selectedAddonIds.map((v) => String(v))
        : undefined,
      isRenewal: body.isRenewal === true,
      sessionToken: session,
    });
  }

  @Post('customer/coupon/validate')
  async validateCouponSession(
    @Body() body: Record<string, unknown>,
    @Headers('x-customer-session') sessionToken?: string,
  ) {
    const session = this.getSessionToken(sessionToken);
    const customer = await this.customerAuth.validateSession(session);
    return this.store.previewCoupon({
      adminId: customer.adminId,
      productId: String(body.productId || ''),
      couponCode: body.couponCode ? String(body.couponCode) : undefined,
      limitIp: body.limitIp != null ? Number(body.limitIp) : undefined,
      selectedAddonIds: Array.isArray(body.selectedAddonIds)
        ? body.selectedAddonIds.map((v) => String(v))
        : undefined,
      isRenewal: body.isRenewal === true,
      sessionToken: session,
    });
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
    @Body() body: { subscriptionLink?: string; categoryId?: string },
    @Headers('x-customer-session') sessionToken?: string,
  ) {
    return this.store.claimServiceBySubscriptionLink(
      this.getSessionToken(sessionToken),
      String(body?.subscriptionLink || ''),
      body?.categoryId,
    );
  }

  @Post('customer/services/:clientId/category')
  assignServiceCategory(
    @Param('clientId') clientId: string,
    @Body('categoryId') categoryId: string,
    @Headers('x-customer-session') sessionToken?: string,
  ) {
    return this.store.assignServiceCategory(
      this.getSessionToken(sessionToken),
      clientId,
      String(categoryId || ''),
    );
  }

  @Get('customer/services/:clientId/renew-products')
  async renewProductsForClient(
    @Param('clientId') clientId: string,
    @Headers('x-customer-session') sessionToken?: string,
  ) {
    const customer = await this.customerAuth.validateSession(
      this.getSessionToken(sessionToken),
    );
    return this.store.listRenewProductsForClient(
      customer.adminId,
      customer.id,
      clientId,
    );
  }

  @Post('customer/services/:clientId/hide')
  hideServiceFromList(
    @Param('clientId') clientId: string,
    @Headers('x-customer-session') sessionToken?: string,
  ) {
    return this.store.hideServiceFromCustomerList(
      this.getSessionToken(sessionToken),
      clientId,
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

  @Get('customer/wallet')
  async getWallet(@Headers('x-customer-session') sessionToken?: string) {
    const customer = await this.customerAuth.validateSession(this.getSessionToken(sessionToken));
    return this.wallet.getBalance(customer.id);
  }

  @Post('customer/wallet/deposit')
  async createWalletDeposit(
    @Headers('x-customer-session') sessionToken?: string,
    @Body()
    body?: {
      amount?: number;
      currency?: string;
      receiptText?: string;
      receiptImage?: string;
    },
  ) {
    const customer = await this.customerAuth.validateSession(this.getSessionToken(sessionToken));
    return this.wallet.createDeposit(
      customer.id,
      customer.adminId,
      Number(body?.amount || 0),
      body?.currency || 'USD',
      { receiptText: body?.receiptText, receiptImage: body?.receiptImage },
    );
  }
}
