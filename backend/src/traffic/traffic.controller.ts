import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard, Roles } from '../common/roles.guard';
import { TrafficService } from './traffic.service';
import type { AuthRequest } from '../common/auth-request';

@ApiTags('Traffic')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('traffic')
export class TrafficController {
  constructor(private trafficService: TrafficService) {}

  @Post('top-up/:adminId')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Top-up admin balance' })
  topUp(
    @Param('adminId') adminId: string,
    @Body() dto: { amount: number; description?: string; panelId?: string },
  ) {
    return this.trafficService.topUp(
      adminId,
      BigInt(dto.amount),
      dto.description,
      dto.panelId,
    );
  }

  @Get('destinations')
  @ApiOperation({ summary: 'Ledger destination tabs for the caller' })
  getDestinations(@Req() req: AuthRequest) {
    return this.trafficService.getDestinations(req.user.id);
  }

  @Get('destinations/:adminId')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Ledger destination tabs for a specific admin' })
  getAdminDestinations(@Param('adminId') adminId: string) {
    return this.trafficService.getDestinations(adminId);
  }

  @Get('ledger')
  @ApiOperation({ summary: 'Get traffic ledger (scoped to caller)' })
  getLedger(
    @Req() req: AuthRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
    @Query('search') search?: string,
    @Query('panelId') panelId?: string,
  ) {
    return this.trafficService.getLedger(
      req.user.id,
      Number(page) || 1,
      Number(limit) || 100,
      type,
      search,
      panelId,
    );
  }

  @Get('ledger/:adminId')
  @UseGuards(RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Get traffic ledger for a specific admin' })
  getAdminLedger(
    @Param('adminId') adminId: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('type') type?: string,
    @Query('search') search?: string,
    @Query('panelId') panelId?: string,
  ) {
    return this.trafficService.getLedger(
      adminId,
      Number(page) || 1,
      Number(limit) || 100,
      type,
      search,
      panelId,
    );
  }
}
