import { Controller, Get, Post, Body, Query, UseGuards, Req } from '@nestjs/common';
import { ProService } from './pro.service';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard, Roles } from '../common/roles.guard';
import { PremiumGuard } from '../common/guards/premium.guard';

@Controller('pro')
@UseGuards(AuthGuard('jwt'), RolesGuard, PremiumGuard)
@Roles('SUPER_ADMIN') // ONLY SUPER ADMIN
export class ProController {
  constructor(private readonly proService: ProService) {}

  @Get('overview')
  getOverview() {
    return this.proService.getOverview();
  }

  @Get('metrics')
  getMetrics(@Query('range') range: string = '1h') {
    return this.proService.getMetrics(range);
  }

  @Get('incidents')
  getIncidents() {
    return this.proService.getIncidents();
  }

  @Get('maintenance')
  getMaintenance() {
    return this.proService.getMaintenance();
  }

  @Post('operations/execute')
  executeOperation(@Req() req: any, @Body() body: { action: string, targetPanelId: string | null }) {
    return this.proService.executeOperation(body.action, body.targetPanelId, req);
  }
}
