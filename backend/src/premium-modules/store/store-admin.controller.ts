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
import type { AuthRequest } from '../../common/auth-request';

@UseGuards(AuthGuard('jwt'), PremiumGuard, PremiumModuleGuard)
@RequirePremiumModule('store')
@Controller('premium-modules/store')
export class StoreAdminController {
  constructor(
    private readonly store: StoreService,
    private readonly telegram: StoreTelegramService,
  ) {}

  @Get('dashboard')
  dashboard(@Req() req: AuthRequest) {
    return this.store.getDashboard(req.user.id);
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

  @Patch('products/:id')
  updateProduct(@Req() req: AuthRequest, @Param('id') id: string, @Body() body: Record<string, unknown>) {
    return this.store.updateProduct(req.user.id, id, body);
  }

  @Delete('products/:id')
  deleteProduct(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.store.deleteProduct(req.user.id, id);
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

  // Customers
  @Get('customers')
  listCustomers(@Req() req: AuthRequest) {
    return this.store.listCustomers(req.user.id);
  }

  @Get('customers/:id')
  getCustomer(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.store.getCustomerDetail(req.user.id, id);
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
}
