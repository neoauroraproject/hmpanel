import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles, RolesGuard } from '../common/roles.guard';
import type { AuthRequest } from '../common/auth-request';
import { BotApiService } from './bot-api.service';
import { BotApiKeyGuard } from './bot-api.guard';
import { BOT_API_SCOPES } from './bot-api.types';

@ApiTags('API v1')
@Controller('v1')
export class BotApiV1Controller {
  constructor(private bots: BotApiService) {}

  @Get('health')
  health() {
    return { ok: true, api: 'v1', deprecated: false };
  }

  @Get('scopes')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiBearerAuth()
  scopes() {
    return { scopes: BOT_API_SCOPES };
  }

  @Get('api-clients')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiBearerAuth()
  list(@Req() req: AuthRequest) {
    return this.bots.list(req.user.id);
  }

  @Post('api-clients')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiBearerAuth()
  create(
    @Req() req: AuthRequest,
    @Body() body: { name: string; scopes?: string[] },
  ) {
    return this.bots.createClient(req.user.id, body.name, body.scopes || ['clients.read']);
  }

  @Delete('api-clients/:id')
  @UseGuards(AuthGuard('jwt'), RolesGuard)
  @Roles('SUPER_ADMIN')
  @ApiBearerAuth()
  revoke(@Param('id') id: string) {
    return this.bots.revoke(id);
  }

  @Get('me')
  @UseGuards(BotApiKeyGuard)
  me(@Req() req: any) {
    const c = req.botApiClient;
    return {
      id: c.id,
      name: c.name,
      scopes: c.scopes,
      rateLimitPerMin: c.rateLimitPerMin,
      webhookUrl: c.webhookUrl ?? null,
    };
  }

  @Patch('me/webhook')
  @UseGuards(BotApiKeyGuard)
  setMyWebhook(@Req() req: any, @Body() body: { webhookUrl?: string | null }) {
    this.bots.assertScope(req.botApiClient, 'webhooks.manage');
    return this.bots.setWebhookUrl(req.botApiClient.id, body.webhookUrl ?? null);
  }

  @Get('clients')
  @UseGuards(BotApiKeyGuard)
  async clients(@Req() req: any) {
    this.bots.assertScope(req.botApiClient, 'clients.read');
    const data = await this.bots.listClientsForAdmin(req.botApiClient.adminId);
    return { data };
  }

  @Post('clients')
  @UseGuards(BotApiKeyGuard)
  createClient(
    @Req() req: any,
    @Body()
    body: {
      email?: string;
      inboundIds?: string[];
      total?: number;
      expiryTime?: number;
      remark?: string;
      limitIp?: number;
    },
  ) {
    this.bots.assertScope(req.botApiClient, 'clients.write');
    return this.bots.provisionClient(req.botApiClient.adminId, body);
  }

  @Patch('clients/:id')
  @UseGuards(BotApiKeyGuard)
  patchClient(
    @Req() req: any,
    @Param('id') id: string,
    @Body()
    body: {
      enable?: boolean;
      total?: number;
      expiryTime?: number;
      remark?: string;
      limitIp?: number;
    },
  ) {
    this.bots.assertScope(req.botApiClient, 'clients.write');
    return this.bots.patchClient(req.botApiClient.adminId, id, body);
  }

  @Delete('clients/:id')
  @UseGuards(BotApiKeyGuard)
  deleteClient(@Req() req: any, @Param('id') id: string) {
    this.bots.assertScope(req.botApiClient, 'clients.write');
    return this.bots.deleteClient(req.botApiClient.adminId, id);
  }

  @Get('traffic')
  @UseGuards(BotApiKeyGuard)
  traffic(
    @Req() req: any,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    this.bots.assertScope(req.botApiClient, 'traffic.read');
    return this.bots.listTraffic(
      req.botApiClient.adminId,
      page ? Number(page) : undefined,
      limit ? Number(limit) : undefined,
    );
  }
}
