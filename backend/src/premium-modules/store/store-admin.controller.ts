import {
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Req,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PremiumGuard } from '../../common/guards/premium.guard';
import { RequirePremiumModule, PremiumModuleGuard } from '../premium-module.guard';
import { StoreService } from './store.service';
import { StoreTelegramService } from './store-telegram.service';
import type { BotMenuConfig } from './store-bot-menu.util';
import { StoreWalletService } from './store-wallet.service';
import { StoreCouponService } from './store-coupon.service';
import { StoreReferralRewardService } from './store-referral-reward.service';
import { EylanAddonService } from './providers/eylan/eylan-addon.service';
import { PasarguardAddonService } from './providers/pasarguard/pasarguard-addon.service';
import type { AuthRequest } from '../../common/auth-request';

@UseGuards(AuthGuard('jwt'), PremiumGuard, PremiumModuleGuard)
@RequirePremiumModule('store')
@Controller('premium-modules/store')
export class StoreAdminController {
  constructor(
    private readonly store: StoreService,
    private readonly telegram: StoreTelegramService,
    private readonly wallet: StoreWalletService,
    private readonly coupons: StoreCouponService,
    private readonly referralRewards: StoreReferralRewardService,
    private readonly eylan: EylanAddonService,
    private readonly pasarguard: PasarguardAddonService,
  ) {}

  @Get('dashboard')
  dashboard(@Req() req: AuthRequest) {
    return this.store.getDashboard(req.user.id);
  }

  @Get('payment-gateways')
  paymentGateways() {
    return this.store.listPaymentGateways();
  }

  @Get('profile')
  getProfile(@Req() req: AuthRequest) {
    return this.store.getOrCreateProfile(req.user.id);
  }

  @Put('profile')
  updateStoreProfile(@Req() req: AuthRequest, @Body() body: Record<string, unknown>) {
    return this.store.updateStoreProfile(req.user.id, body);
  }

  // Categories
  @Get('categories')
  listCategories(@Req() req: AuthRequest) {
    return this.store.listCategories(req.user.id);
  }

  @Post('categories')
  createCategory(@Req() req: AuthRequest, @Body() body: Record<string, unknown>) {
    return this.store.createCategory(req.user.id, body);
  }

  @Post('categories/reorder')
  reorderCategories(@Req() req: AuthRequest, @Body() body: { ids?: string[] }) {
    return this.store.reorderCategories(req.user.id, body?.ids || []);
  }

  @Patch('categories/:id')
  updateCategory(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.store.updateCategory(req.user.id, id, body);
  }

  @Delete('categories/:id')
  deleteCategory(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.store.deleteCategory(req.user.id, id);
  }

  // Provisioning Profiles
  @Get('profiles')
  listProfiles(@Req() req: AuthRequest) {
    return this.store.listProfiles(req.user.id);
  }

  @Get('provisioning-options')
  getProvisioningOptions(@Req() req: AuthRequest) {
    return this.store.getProvisioningOptions(req.user.id, req.user.role);
  }

  @Post('profiles')
  createProvisioningProfile(@Req() req: AuthRequest, @Body() body: Record<string, unknown>) {
    return this.store.createProfile(req.user.id, req.user.role, body);
  }

  @Patch('profiles/:id')
  updateProvisioningProfile(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.store.updateProvisioningProfile(req.user.id, req.user.role, id, body);
  }

  @Delete('profiles/:id')
  deleteProvisioningProfile(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.store.deleteProfile(req.user.id, id);
  }

  // Templates
  @Get('templates')
  listTemplates(@Req() req: AuthRequest) {
    return this.store.listTemplates(req.user.id);
  }

  @Post('templates')
  createTemplate(@Req() req: AuthRequest, @Body() body: Record<string, unknown>) {
    return this.store.createTemplate(req.user.id, body);
  }

  @Patch('templates/:id')
  updateTemplate(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.store.updateTemplate(req.user.id, id, body);
  }

  @Delete('templates/:id')
  deleteTemplate(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.store.deleteTemplate(req.user.id, id);
  }

  @Post('templates/:id/clone')
  cloneTemplate(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: { categoryId: string },
  ) {
    return this.store.cloneTemplateToProduct(req.user.id, id, body.categoryId);
  }

  // Products
  @Get('products')
  listProducts(@Req() req: AuthRequest) {
    return this.store.listProducts(req.user.id);
  }

  @Post('products')
  createProduct(@Req() req: AuthRequest, @Body() body: Record<string, unknown>) {
    return this.store.createProduct(req.user.id, body);
  }

  @Post('products/reorder')
  reorderProducts(@Req() req: AuthRequest, @Body() body: { ids?: string[] }) {
    return this.store.reorderProducts(req.user.id, body?.ids || []);
  }

  @Patch('products/:id')
  updateProduct(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.store.updateProduct(req.user.id, id, body);
  }

  @Delete('products/:id')
  deleteProduct(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.store.deleteProduct(req.user.id, id);
  }

  // IP Limits catalog
  @Get('ip-limits')
  listIpLimits(@Req() req: AuthRequest) {
    return this.store.listIpLimits(req.user.id);
  }

  @Post('ip-limits')
  upsertIpLimit(@Req() req: AuthRequest, @Body() body: Record<string, unknown>) {
    return this.store.upsertIpLimit(req.user.id, body as any);
  }

  @Delete('ip-limits/:id')
  deleteIpLimit(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.store.deleteIpLimit(req.user.id, id);
  }

  @Get('product-addons')
  listProductAddons(@Req() req: AuthRequest) {
    return this.store.listIpLimits(req.user.id);
  }

  @Post('product-addons')
  upsertProductAddon(@Req() req: AuthRequest, @Body() body: Record<string, unknown>) {
    return this.store.upsertIpLimit(req.user.id, body as any);
  }

  @Delete('product-addons/:id')
  deleteProductAddon(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.store.deleteIpLimit(req.user.id, id);
  }

  @Post('ip-limits/migrate-legacy')
  migrateIpLimits(@Req() req: AuthRequest) {
    return this.store.migrateLegacyIpOptions(req.user.id);
  }

  // Orders
  @Get('orders')
  listOrders(@Req() req: AuthRequest, @Query('status') status?: string) {
    return this.store.listOrders(req.user.id, status);
  }

  @Get('orders/:id')
  getOrder(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.store.getOrder(req.user.id, id);
  }

  @Post('orders/:id/approve')
  approveOrder(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.store.approveOrder(req.user.id, req.user.role, id);
  }

  @Post('orders/:id/reject')
  rejectOrder(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.store.rejectOrder(req.user.id, id, body.reason);
  }

  @Post('orders/:id/provision')
  provisionOrder(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.store.provisionOrder(req.user.id, req.user.role, id);
  }

  @Post('orders/:id/cancel')
  cancelOrder(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: { reason?: string }) {
    return this.store.cancelOrder(req.user.id, id, body?.reason);
  }

  @Post('orders/:id/manual-deliver')
  manualDeliverOrder(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: { configName?: string; subUrl?: string; note?: string },
  ) {
    return this.store.manualDeliverOrder(req.user.id, req.user.role, id, body || {});
  }

  // Customers
  @Get('customers')
  listCustomers(
    @Req() req: AuthRequest,
    @Query('segment') segment?: string,
    @Query('search') search?: string,
  ) {
    return this.store.listCustomers(req.user.id, { segment, search });
  }

  @Get('customers/:id')
  getCustomer(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.store.getCustomerDetail(req.user.id, id);
  }

  @Patch('customers/:id/status')
  setCustomerStatus(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: { status?: string },
  ) {
    return this.store.setCustomerStatus(req.user.id, id, body?.status || '');
  }

  @Get('customers/:id/services/search')
  searchCustomerServices(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Query('q') q?: string,
  ) {
    return this.store.searchAttachableServices(req.user.id, req.user.role, id, q || '');
  }

  @Post('customers/:id/services/attach')
  attachCustomerService(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: { clientId?: string; categoryId?: string; subscriptionLink?: string },
  ) {
    return this.store.attachCustomerService(
      req.user.id,
      req.user.role,
      id,
      body || {},
    );
  }

  @Patch('customers/:id/services/:clientId')
  updateCustomerService(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Param('clientId') clientId: string,
    @Body()
    body: {
      subId?: string;
      remark?: string;
      enable?: boolean;
      total?: number;
      expiryTime?: number;
      notifyTelegram?: boolean;
    },
  ) {
    return this.store.updateCustomerServiceSubscription(
      req.user.id,
      req.user.role,
      id,
      clientId,
      body || {},
    );
  }

  // Telegram bot (per-store Mini App)
  @Get('telegram')
  getTelegram(@Req() req: AuthRequest) {
    return this.telegram.getTelegramSettings(req.user.id);
  }

  @Put('telegram')
  updateTelegram(
    @Req() req: AuthRequest,
    @Body()
    body: {
      enabled?: boolean;
      botToken?: string;
      welcomeText?: string | null;
      adminChatId?: string | null;
      botLocale?: string | null;
      telegramBotLocale?: string | null;
      botMenu?: BotMenuConfig | null;
      forceChannel?: string | null;
    },
  ) {
    return this.telegram.updateTelegramSettings(req.user.id, body);
  }

  @Post('telegram/test')
  testTelegram(@Req() req: AuthRequest, @Body() body: { chatId: string }) {
    return this.telegram.sendTestMessage(req.user.id, body.chatId);
  }

  @Post('telegram/activate')
  activateTelegram(@Req() req: AuthRequest) {
    return this.telegram.activateWebhook(req.user.id);
  }

  @Get('analytics')
  analytics(
    @Req() req: AuthRequest,
    @Query('range') range?: '7d' | '30d' | '90d' | '365d',
    @Query('groupBy') groupBy?: 'day' | 'week' | 'month',
    @Query('categoryId') categoryId?: string,
  ) {
    return this.store.getAnalytics(req.user.id, { range, groupBy, categoryId });
  }

  @Get('telegram/broadcast/preview')
  broadcastPreview(
    @Req() req: AuthRequest,
    @Query('audience') audience?: 'all' | 'with_service' | 'without_service',
  ) {
    return this.telegram.getBroadcastPreview(req.user.id, audience || 'all');
  }

  @Post('telegram/broadcast')
  broadcast(
    @Req() req: AuthRequest,
    @Body()
    body: {
      text: string;
      audience?: 'all' | 'with_service' | 'without_service';
      photoDataUrl?: string | null;
    },
  ) {
    return this.telegram.broadcastFromPanel(req.user.id, body);
  }

  // Coupons
  @Get('coupons')
  listCoupons(@Req() req: AuthRequest) {
    return this.coupons.list(req.user.id);
  }

  @Post('coupons')
  upsertCoupon(@Req() req: AuthRequest, @Body() body: Record<string, unknown>) {
    return this.coupons.upsert(req.user.id, body as any);
  }

  @Delete('coupons/:id')
  deleteCoupon(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.coupons.remove(req.user.id, id);
  }

  @Get('referral-rewards')
  listReferralRewards(@Req() req: AuthRequest) {
    return this.referralRewards.list(req.user.id);
  }

  @Post('referral-rewards')
  saveReferralReward(@Req() req: AuthRequest, @Body() body: Record<string, unknown>) {
    return this.referralRewards.upsert(req.user.id, body as any);
  }

  @Delete('referral-rewards/:id')
  removeReferralReward(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.referralRewards.remove(req.user.id, id);
  }

  // Wallet deposits
  @Get('wallet/deposits')
  listWalletDeposits(@Req() req: AuthRequest, @Query('status') status?: string) {
    return this.wallet.listDeposits(req.user.id, status);
  }

  @Post('wallet/deposits/:id/approve')
  async approveWalletDeposit(@Req() req: AuthRequest, @Param('id') id: string) {
    const deposit = await this.wallet.approveDeposit(req.user.id, id);
    const bal = await this.wallet.getBalance(deposit.customerId, deposit.currency);
    void this.telegram.notifyCustomerWalletDepositResult({
      customerId: deposit.customerId,
      approved: true,
      amount: deposit.amount,
      currency: deposit.currency,
      balance: bal.balance,
    });
    return deposit;
  }

  @Post('wallet/deposits/:id/reject')
  async rejectWalletDeposit(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    const deposit = await this.wallet.rejectDeposit(req.user.id, id, body?.reason);
    void this.telegram.notifyCustomerWalletDepositResult({
      customerId: deposit.customerId,
      approved: false,
      amount: deposit.amount,
      currency: deposit.currency,
      reason: body?.reason || deposit.rejectReason || undefined,
    });
    return deposit;
  }

  @Post('wallet/customers/:customerId/adjust')
  adjustWallet(
    @Req() req: AuthRequest,
    @Param('customerId') customerId: string,
    @Body() body: { amount: number; note?: string; currency?: string },
  ) {
    return this.wallet.adminAdjust(
      req.user.id,
      customerId,
      Number(body.amount),
      body?.note,
      body?.currency,
    );
  }

  @Get('addons/eylan')
  getEylanAddon(@Req() req: AuthRequest) {
    return this.eylan.getPublic(req.user.id);
  }

  @Put('addons/eylan')
  saveEylanAddon(@Req() req: AuthRequest, @Body() body: Record<string, unknown>) {
    return this.eylan.upsert(req.user.id, {
      enabled: body.enabled as boolean | undefined,
      apiBaseUrl: body.apiBaseUrl as string | undefined,
      apiKey: body.apiKey as string | undefined,
      deliveryDomain: (body.deliveryDomain as string | null | undefined) ?? undefined,
      manualWgInstances:
        (body.manualWgInstances as string | string[] | null | undefined) ?? undefined,
    });
  }

  @Post('addons/eylan/test')
  testEylanAddon(@Req() req: AuthRequest, @Body() body: Record<string, unknown>) {
    return this.eylan.test(req.user.id, body);
  }

  @Get('addons/eylan/options')
  getEylanOptions(@Req() req: AuthRequest, @Query('force') force?: string) {
    return this.eylan.getOptions(req.user.id, force === '1' || force === 'true');
  }

  @Get('addons/eylan/grants')
  listEylanGrants(@Req() req: AuthRequest) {
    return this.eylan.listGrants(req.user.id);
  }

  @Put('addons/eylan/grants')
  saveEylanGrant(@Req() req: AuthRequest, @Body() body: Record<string, unknown>) {
    return this.eylan.upsertGrant(req.user.id, {
      granteeAdminId: String(body.granteeAdminId || ''),
      enabled: body.enabled as boolean | undefined,
      trafficQuotaGb: body.trafficQuotaGb as number | undefined,
    });
  }

  @Get('addons/pasarguard')
  getPasarguardAddon(@Req() req: AuthRequest) {
    return this.pasarguard.getPublic(req.user.id);
  }

  @Put('addons/pasarguard')
  savePasarguardAddon(@Req() req: AuthRequest, @Body() body: Record<string, unknown>) {
    return this.pasarguard.upsert(req.user.id, {
      enabled: body.enabled as boolean | undefined,
      apiBaseUrl: body.apiBaseUrl as string | undefined,
      apiKey: body.apiKey as string | undefined,
      deliveryDomain: (body.deliveryDomain as string | null | undefined) ?? undefined,
    });
  }

  @Post('addons/pasarguard/test')
  testPasarguardAddon(@Req() req: AuthRequest, @Body() body: Record<string, unknown>) {
    return this.pasarguard.test(req.user.id, body);
  }

  @Patch('orders/:id')
  updateOrder(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body()
    body: {
      status?: string;
      configName?: string;
      subUrl?: string;
      note?: string;
      deliver?: boolean;
    },
  ) {
    return this.store.updateOrder(req.user.id, req.user.role, id, body || {});
  }
}
