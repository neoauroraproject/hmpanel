import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { PremiumGuard } from '../../common/guards/premium.guard';
import { PremiumModuleGuard, RequirePremiumModule } from '../premium-module.guard';
import type { AuthRequest } from '../../common/auth-request';
import { PaygService } from './payg.service';

@UseGuards(AuthGuard('jwt'), PremiumGuard, PremiumModuleGuard)
@RequirePremiumModule('store-payg')
@Controller('premium-modules/store-payg')
export class PaygController {
  constructor(private readonly payg: PaygService) {}

  // ── Settings ──────────────────────────────────────────────────────────────

  @Get('settings')
  getSettings(@Req() req: AuthRequest) {
    return this.payg.getOrCreateSettings(req.user.id);
  }

  @Put('settings')
  updateSettings(@Req() req: AuthRequest, @Body() body: Record<string, unknown>) {
    return this.payg.updateSettings(req.user.id, body);
  }

  // ── Categories ────────────────────────────────────────────────────────────

  @Get('categories')
  listCategories(@Req() req: AuthRequest) {
    return this.payg.listCategories(req.user.id);
  }

  @Post('categories')
  createCategory(@Req() req: AuthRequest, @Body() body: Record<string, unknown>) {
    return this.payg.createCategory(req.user.id, body);
  }

  @Put('categories/:id')
  updateCategory(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.payg.updateCategory(req.user.id, id, body);
  }

  @Delete('categories/:id')
  deleteCategory(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.payg.deleteCategory(req.user.id, id);
  }

  // ── Plans ─────────────────────────────────────────────────────────────────

  @Get('plans')
  listPlans(@Req() req: AuthRequest, @Query('categoryId') categoryId?: string) {
    return this.payg.listPlans(req.user.id, categoryId);
  }

  @Post('plans')
  createPlan(@Req() req: AuthRequest, @Body() body: Record<string, unknown>) {
    return this.payg.createPlan(req.user.id, body);
  }

  @Put('plans/:id')
  updatePlan(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.payg.updatePlan(req.user.id, id, body);
  }

  @Delete('plans/:id')
  deletePlan(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.payg.deletePlan(req.user.id, id);
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────

  @Get('subscriptions')
  listSubscriptions(
    @Req() req: AuthRequest,
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
    @Query('planId') planId?: string,
  ) {
    return this.payg.listSubscriptions(req.user.id, { status, customerId, planId });
  }

  @Post('subscriptions/activate')
  activate(
    @Req() req: AuthRequest,
    @Body() body: { customerId?: string; planId?: string },
  ) {
    return this.payg.activate(req.user.id, body);
  }

  @Post('subscriptions/:id/suspend')
  suspend(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.payg.suspend(req.user.id, id);
  }

  @Post('subscriptions/:id/resume')
  resume(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.payg.resume(req.user.id, id);
  }

  @Post('subscriptions/:id/close')
  close(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.payg.close(req.user.id, id);
  }

  @Get('subscriptions/:id/usage')
  usage(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.payg.getUsage(req.user.id, id);
  }

  // ── Dashboard / meter ─────────────────────────────────────────────────────

  @Get('dashboard')
  dashboard(@Req() req: AuthRequest) {
    return this.payg.dashboard(req.user.id);
  }

  @Post('meter/run')
  runMeter(
    @Req() req: AuthRequest,
    @Body() body?: { subscriptionId?: string },
  ) {
    return this.payg.runMeter(req.user.id, body?.subscriptionId);
  }
}
