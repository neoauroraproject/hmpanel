import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles, RolesGuard } from '../common/roles.guard';
import { PremiumGuard } from '../common/guards/premium.guard';
import type { AuthRequest } from '../common/auth-request';
import { PaymentManagementService } from './payment-management.service';
import type { PaymentSurface } from './payment-surface';

@ApiTags('Payment Management')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PremiumGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'RESELLER')
@Controller('premium-modules/payment-management')
export class PaymentManagementController {
  constructor(private readonly payments: PaymentManagementService) {}

  @Get()
  dashboard(@Req() req: AuthRequest) {
    return this.payments.dashboard(req.user.id, req.user.role);
  }

  @Patch('methods')
  updateMethods(
    @Req() req: AuthRequest,
    @Body() body: Record<string, { enabled?: boolean } | boolean>,
  ) {
    return this.payments.updateMethods(req.user.id, body);
  }

  @Put('cards')
  saveCards(@Req() req: AuthRequest, @Body() body: { cards?: unknown }) {
    return this.payments.saveCards(req.user.id, body?.cards ?? body);
  }

  @Post('cards')
  createCard(@Req() req: AuthRequest, @Body() body: Record<string, unknown>) {
    return this.payments.upsertCard(req.user.id, body);
  }

  @Patch('cards/:id')
  updateCard(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() body: Record<string, unknown>,
  ) {
    return this.payments.upsertCard(req.user.id, { ...body, id });
  }

  @Delete('cards/:id')
  deleteCard(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.payments.deleteCard(req.user.id, id);
  }

  @Put('assignments')
  saveAssignments(
    @Req() req: AuthRequest,
    @Body()
    body: {
      assignments?: Array<{
        surface: PaymentSurface;
        allowedGatewayIds: string[];
        defaultId: string;
        cardId?: string | null;
      }>;
    },
  ) {
    return this.payments.saveAssignments(req.user.id, body.assignments || []);
  }

  @Patch('stars')
  updateStars(@Req() req: AuthRequest, @Body() body: Record<string, unknown>) {
    return this.payments.updateStarsSettings(req.user.id, body as any);
  }

  @Post('stars/probe')
  probeStars(@Req() req: AuthRequest) {
    return this.payments.probeStars(req.user.id);
  }

  @Get('checkout/:surface')
  resolveCheckout(@Req() req: AuthRequest, @Param('surface') surface: PaymentSurface) {
    return this.payments.resolveCheckout(req.user.id, surface);
  }
}
