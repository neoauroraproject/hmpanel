import {
  Body,
  Controller,
  Get,
  Post,
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

  @Get('me')
  @UseGuards(BotApiKeyGuard)
  me(@Req() req: any) {
    const c = req.botApiClient;
    return {
      id: c.id,
      name: c.name,
      scopes: c.scopes,
      rateLimitPerMin: c.rateLimitPerMin,
    };
  }

  @Get('clients')
  @UseGuards(BotApiKeyGuard)
  clients(@Req() req: any) {
    this.bots.assertScope(req.botApiClient, 'clients.read');
    return { data: [], note: 'External Bot API v1 — list is provisioned via Core adapters' };
  }
}
