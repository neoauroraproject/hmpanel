import { Controller, Get, Post, Query, UseGuards, Req } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard, Roles } from '../common/roles.guard';
import { StatsService } from './stats.service';
import type { AuthRequest } from '../common/auth-request';
import { PremiumGuard } from '../common/guards/premium.guard';

@ApiTags('Stats')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('SUPER_ADMIN')
@Controller('stats')
export class StatsController {
  constructor(private stats: StatsService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Dashboard KPI cards' })
  overview() {
    return this.stats.overview();
  }

  @Get('reseller-overview')
  @Roles('SUPER_ADMIN', 'RESELLER')
  @ApiOperation({ summary: 'Dashboard KPI cards for resellers' })
  resellerOverview(@Req() req: AuthRequest) {
    return this.stats.resellerOverview(req.user.id);
  }

  @Get('traffic-series')
  @ApiOperation({ summary: 'Traffic volume time-series (24h | 7d | 30d)' })
  trafficSeries(@Query('range') range: '24h' | '7d' | '30d' = '24h') {
    return this.stats.trafficSeries(range);
  }

  @Get('trends')
  @ApiOperation({ summary: 'New-clients / by-admin / by-inbound / by-panel trends' })
  trends() {
    return this.stats.trends();
  }

  @Get('monitoring')
  @ApiOperation({ summary: 'Live monitoring snapshot (CPU/RAM/disk/net, Xray, sync)' })
  monitoring() {
    return this.stats.monitoring();
  }

  @Post('sync')
  @ApiOperation({ summary: 'Run a sync across all online panels' })
  runSync() {
    return this.stats.runSync();
  }

  @Post('restart-xray')
  @ApiOperation({ summary: 'Restart Xray across all online panels' })
  restartXray() {
    return this.stats.restartXray();
  }

  @Post('backup')
  @ApiOperation({ summary: 'Create a manual backup' })
  createBackup() {
    return this.stats.createBackup();
  }

  @Get('diagnostics')
  @ApiOperation({ summary: 'Run system diagnostics' })
  getDiagnostics() {
    return this.stats.getDiagnostics();
  }
}
