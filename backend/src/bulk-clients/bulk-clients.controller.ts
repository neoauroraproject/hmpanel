import { Controller, Post, Body, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { BulkClientsService } from './bulk-clients.service';
import type { AuthRequest } from '../common/auth-request';

@ApiTags('Bulk Clients')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('bulk-clients')
export class BulkClientsController {
  constructor(private bulkClientsService: BulkClientsService) {}

  @Post('enable')
  @ApiOperation({ summary: 'Bulk enable clients (uses 3.4.2 endpoint when available, falls back to sequential)' })
  bulkEnable(@Req() req: AuthRequest, @Body() body: { ids: string[] }) {
    return this.bulkClientsService.bulkEnable(req.user.id, req.user.role, body.ids);
  }

  @Post('disable')
  @ApiOperation({ summary: 'Bulk disable clients (uses 3.4.2 endpoint when available, falls back to sequential)' })
  bulkDisable(@Req() req: AuthRequest, @Body() body: { ids: string[] }) {
    return this.bulkClientsService.bulkDisable(req.user.id, req.user.role, body.ids);
  }

  @Post('export-subs')
  @ApiOperation({ summary: 'Export subscription links for selected clients as downloadable TXT' })
  exportSubs(@Req() req: AuthRequest, @Body() body: { ids: string[] }) {
    return this.bulkClientsService.exportSubscriptionLinks(req.user.id, req.user.role, body.ids);
  }
}
