import { Body, Controller, Delete, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import type { AuthRequest } from '../common/auth-request';
import { getRequestOrigin } from '../common/utils/request-origin';
import { AdminApiService, ApiActor } from './admin-api.service';
import { BotApiKeyGuard } from './bot-api.guard';
import { BotApiService } from './bot-api.service';
import { BOT_API_SCOPES, FULL_ACCESS_SCOPE } from './bot-api.types';

type KeyRequest = Request & { botApiClient: { id: string; adminId: string; adminRole: string; scopes: unknown } };

function actorOf(req: KeyRequest): ApiActor {
  return { adminId: req.botApiClient.adminId, role: req.botApiClient.adminRole };
}

/**
 * Per-admin API keys and the data they unlock. See docs/admin-api.md.
 * Routes live under /v1 next to the existing bot API, sharing its keys.
 */
@ApiTags('API v1')
@Controller('v1')
export class AdminApiV1Controller {
  constructor(
    private bots: BotApiService,
    private data: AdminApiService,
  ) {}

  // ---------- key management (signed-in admin, any role) ----------

  @Get('keys/scopes')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Scopes a key can be granted' })
  keyScopes() {
    return { scopes: BOT_API_SCOPES, fullAccess: FULL_ACCESS_SCOPE };
  }

  @Get('keys')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'List API keys (own keys; super admin sees all)' })
  listKeys(@Req() req: AuthRequest) {
    return this.bots.listForActor(req.user);
  }

  @Post('keys')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create an API key that acts as you (or, for a super admin, as adminId)' })
  createKey(
    @Req() req: AuthRequest,
    @Body() body: { name?: string; scopes?: string[]; adminId?: string; rateLimitPerMin?: number },
  ) {
    return this.bots.createForAdmin(req.user, body);
  }

  @Delete('keys/:id')
  @UseGuards(AuthGuard('jwt'))
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke an API key' })
  revokeKey(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.bots.revokeForActor(req.user, id);
  }

  // ---------- data (API key) ----------

  @Get('account')
  @UseGuards(BotApiKeyGuard)
  @ApiOperation({ summary: 'The admin this key acts as' })
  account(@Req() req: KeyRequest) {
    this.bots.assertScope(req.botApiClient, 'account.read');
    return this.data.profile(actorOf(req));
  }

  @Get('stats')
  @UseGuards(BotApiKeyGuard)
  @ApiOperation({ summary: 'Client counts and total usage in scope' })
  stats(@Req() req: KeyRequest) {
    this.bots.assertScope(req.botApiClient, 'stats.read');
    return this.data.stats(actorOf(req));
  }

  @Get('inbounds')
  @UseGuards(BotApiKeyGuard)
  @ApiOperation({ summary: 'Inbounds this admin can create clients on' })
  inbounds(@Req() req: KeyRequest) {
    this.bots.assertScope(req.botApiClient, 'inbounds.read');
    return this.data.inbounds(actorOf(req));
  }

  @Get('clients/search')
  @UseGuards(BotApiKeyGuard)
  @ApiOperation({ summary: 'Paginated client list with usage (scoped to the key’s admin)' })
  searchClients(
    @Req() req: KeyRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('adminId') adminId?: string,
  ) {
    this.bots.assertScope(req.botApiClient, 'clients.read');
    return this.data.listClients(
      actorOf(req),
      { page: Number(page) || 1, limit: Number(limit) || 50, search, status, adminId },
      getRequestOrigin(req),
    );
  }

  @Get('clients/lookup')
  @UseGuards(BotApiKeyGuard)
  @ApiOperation({ summary: 'Find a client by subscription token, subId, email or uuid' })
  lookup(@Req() req: KeyRequest, @Query('key') key: string) {
    this.bots.assertScope(req.botApiClient, 'clients.read');
    return this.data.lookup(actorOf(req), key, getRequestOrigin(req));
  }

  @Get('clients/:id')
  @UseGuards(BotApiKeyGuard)
  @ApiOperation({ summary: 'One client with usage' })
  getClient(@Req() req: KeyRequest, @Param('id') id: string) {
    this.bots.assertScope(req.botApiClient, 'clients.read');
    return this.data.getClient(actorOf(req), id, getRequestOrigin(req));
  }

  @Post('clients/:id/renew')
  @UseGuards(BotApiKeyGuard)
  @ApiOperation({ summary: 'Extend expiry, set quota and optionally reset usage' })
  renew(
    @Req() req: KeyRequest,
    @Param('id') id: string,
    @Body() body: { days?: number; totalGb?: number; resetUsage?: boolean },
  ) {
    this.bots.assertScope(req.botApiClient, 'clients.renew');
    return this.data.renew(actorOf(req), id, body, getRequestOrigin(req));
  }

  @Post('clients/:id/reset-usage')
  @UseGuards(BotApiKeyGuard)
  @ApiOperation({ summary: 'Zero the client’s traffic counters' })
  resetUsage(@Req() req: KeyRequest, @Param('id') id: string) {
    this.bots.assertScope(req.botApiClient, 'clients.renew');
    return this.data.resetUsage(actorOf(req), id, getRequestOrigin(req));
  }
}
