import { Controller, Get, Post, Body, Patch, Param, Delete, UseGuards, Req } from '@nestjs/common';
import { StoreService } from './store.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard, Roles } from '../common/roles.guard';
import { PremiumGuard } from '../common/guards/premium.guard';

@UseGuards(PremiumGuard)
@Controller('store')
export class StoreController {
  constructor(private readonly storeService: StoreService) {}

  // ---------------------------------------------------------
  // Super Admin: Store Management
  // ---------------------------------------------------------

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN')
  @Post('admin/:id/activate')
  activateStoreForAdmin(@Param('id') id: string, @Body() body: any) {
    return this.storeService.activateStoreForAdmin(id, body);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN')
  @Delete('admin/:id/deactivate')
  deactivateStoreForAdmin(@Param('id') id: string) {
    return this.storeService.deactivateStoreForAdmin(id);
  }

  // ---------------------------------------------------------
  // Reseller Management APIs (Protected)
  // ---------------------------------------------------------

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN')
  @Post('activate-self')
  activateSelf(@Req() req: any, @Body() body: any) {
    return this.storeService.activateStoreForAdmin(req.user.adminId, body);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'RESELLER')
  @Get('stats')
  getStoreStats(@Req() req: any) {
    return this.storeService.getStats(req.user.adminId);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'RESELLER')
  @Get('profile')
  getProfile(@Req() req: any) {
    return this.storeService.getStoreProfile(req.user.adminId);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'RESELLER')
  @Patch('profile')
  updateProfile(@Req() req: any, @Body() body: any) {
    return this.storeService.updateStoreProfile(req.user.adminId, body);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'RESELLER')
  @Get('products')
  getProducts(@Req() req: any) {
    return this.storeService.getProductTemplates(req.user.adminId);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'RESELLER')
  @Post('products')
  createProduct(@Req() req: any, @Body() body: any) {
    return this.storeService.createProductTemplate(req.user.adminId, body);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'RESELLER')
  @Delete('products/:id')
  deleteProduct(@Req() req: any, @Param('id') id: string) {
    return this.storeService.deleteProductTemplate(req.user.adminId, id);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'RESELLER')
  @Get('orders')
  getOrders(@Req() req: any) {
    return this.storeService.getOrders(req.user.adminId);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'RESELLER')
  @Post('orders/:id/approve')
  approveOrder(@Req() req: any, @Param('id') id: string) {
    return this.storeService.approveOrder(req.user.adminId, id);
  }

  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN', 'RESELLER')
  @Post('orders/:id/reject')
  rejectOrder(@Req() req: any, @Param('id') id: string) {
    return this.storeService.rejectOrder(req.user.adminId, id);
  }

  // ---------------------------------------------------------
  // Public Storefront APIs (Unprotected)
  // ---------------------------------------------------------

  @Get('public/:slug')
  getPublicStore(@Param('slug') slug: string) {
    return this.storeService.getStoreBySlug(slug);
  }

  @Get('domain/:domainId')
  getPublicStoreByDomain(@Param('domainId') domainId: string) {
    return this.storeService.getStoreByDomain(domainId);
  }

  @Post('public/:slug/order')
  createOrder(@Param('slug') slug: string, @Body() body: any) {
    return this.storeService.createOrder(slug, body);
  }

  @Get('track/:code')
  trackOrder(@Param('code') code: string) {
    return this.storeService.getOrderTracking(code);
  }
}
