import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Put,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard, Roles } from '../common/roles.guard';
import { PanelsService } from './panels.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';
import {
  PANEL_PROXY_SETTING,
  PanelConnectionProxyService,
  normalizePanelProxyConfig,
} from './panel-connection-proxy.service';
import type { AuthRequest } from '../common/auth-request';
import { normalizeLocalOrigin } from './panel-local-route.util';

@ApiTags('Panels')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('SUPER_ADMIN')
@Controller('panels')
export class PanelsController {
  constructor(
    private panelsService: PanelsService,
    private prisma: PrismaService,
    private connectionProxy: PanelConnectionProxyService,
    private settings: SettingsService,
  ) {}

  // ── Proxy for reaching 3x-ui panels (fallback when the direct path fails) ──
  @Get('connection-proxy')
  @ApiOperation({ summary: 'Proxy used to reach panels (password never returned)' })
  async getConnectionProxy() {
    const cfg = await this.connectionProxy.getConfig();
    return { ...cfg, password: undefined, passwordSet: !!cfg.password };
  }

  @Put('connection-proxy')
  @ApiOperation({ summary: 'Save the panel connection proxy' })
  async saveConnectionProxy(@Body() body: Record<string, unknown>) {
    const current = normalizePanelProxyConfig(await this.settings.getSetting(PANEL_PROXY_SETTING, null));
    // Blank password keeps the saved one (the form never shows it).
    const password = String(body.password ?? '').trim() ? String(body.password) : current.password;
    const next = normalizePanelProxyConfig({ ...body, password });
    await this.settings.setSetting(PANEL_PROXY_SETTING, next);
    this.connectionProxy.invalidate();
    return { ...next, password: undefined, passwordSet: !!next.password };
  }

  @Post('connection-proxy/test')
  @ApiOperation({ summary: 'Reach one panel directly and through the proxy' })
  async testConnectionProxy(@Body() body: { panelId?: string; url?: string; proxy?: Record<string, unknown> }) {
    let url = String(body.url || '').trim();
    if (!url && body.panelId) {
      const panel = await this.prisma.panel.findUnique({ where: { id: body.panelId }, select: { url: true } });
      url = panel?.url || '';
    }
    if (!url) return { error: 'No panel URL' };
    const override = body.proxy ? normalizePanelProxyConfig(body.proxy) : undefined;
    if (override && !String(body.proxy?.password ?? '').trim()) {
      override.password = (await this.connectionProxy.getConfig()).password;
    }
    return this.connectionProxy.probe(url, override);
  }

  // ── Local route: 3x-ui on the same server as HMPanel ──
  @Get(':id/local-route')
  @ApiOperation({ summary: 'Local route of a panel and whether it is in use' })
  async getLocalRoute(@Param('id') id: string) {
    const panel = await this.prisma.panel.findUnique({ where: { id }, select: { url: true } });
    if (!panel) throw new NotFoundException('Panel not found');
    return this.connectionProxy.localRouteState(panel.url);
  }

  @Post(':id/local-route/detect')
  @ApiOperation({ summary: 'Look for this panel on local addresses of this server' })
  async detectLocalRoute(@Param('id') id: string) {
    const panel = await this.prisma.panel.findUnique({ where: { id }, select: { url: true, apiToken: true } });
    if (!panel) throw new NotFoundException('Panel not found');
    return this.connectionProxy.detectLocalRoute(panel);
  }

  @Put(':id/local-route')
  @ApiOperation({ summary: 'Use a local address for API calls to this panel (null turns it off)' })
  async saveLocalRoute(@Param('id') id: string, @Body() body: { localUrl?: string | null }) {
    const panel = await this.prisma.panel.findUnique({ where: { id }, select: { url: true, apiToken: true } });
    if (!panel) throw new NotFoundException('Panel not found');
    const raw = String(body?.localUrl ?? '').trim();
    let localUrl: string | null = null;
    if (raw) {
      localUrl = normalizeLocalOrigin(raw);
      if (!localUrl) throw new BadRequestException('LOCAL_URL_INVALID');
      const check = await this.connectionProxy.detectLocalRoute(panel, [localUrl]);
      if (!check.best) throw new BadRequestException('LOCAL_URL_UNREACHABLE');
    }
    await this.prisma.panel.update({ where: { id }, data: { localUrl } });
    this.connectionProxy.invalidate();
    return this.connectionProxy.localRouteState(panel.url);
  }

  @Post('test-connection')
  @ApiOperation({ summary: 'Test connectivity to a panel URL' })
  testConnection(
    @Body() dto: { url: string; apiToken?: string; panelId?: string },
  ) {
    return this.panelsService.testConnection(dto);
  }

  @Get('online-ips')
  @Roles('SUPER_ADMIN', 'RESELLER')
  @ApiOperation({ summary: 'Get active IP counts for online clients' })
  getOnlineIps(@Req() req: AuthRequest) {
    if (req.user.role !== 'SUPER_ADMIN') {
      return this.panelsService.getOnlineClientIpsForAdmin(req.user.id);
    }
    return this.panelsService.getOnlineClientIps();
  }

  @Get('online-sessions')
  @Roles('SUPER_ADMIN', 'RESELLER')
  @ApiOperation({
    summary: 'Get live online sessions (IP / device) for a client email',
  })
  async getOnlineSessions(
    @Req() req: AuthRequest,
    @Query('email') email?: string,
  ) {
    const normalized = String(email || '')
      .trim()
      .toLowerCase();
    if (req.user.role !== 'SUPER_ADMIN' && normalized) {
      const owned = await this.prisma.client.findFirst({
        where: {
          adminId: req.user.id,
          email: { equals: normalized, mode: 'insensitive' },
        },
        select: { id: true },
      });
      if (!owned) {
        throw new ForbiddenException('Client not found');
      }
    }
    return this.panelsService.getOnlineSessionsForEmail(normalized);
  }

  @Post()
  @ApiOperation({ summary: 'Register a 3x-ui panel' })
  register(
    @Body()
    dto: {
      serverId?: string;
      name: string;
      url: string;
      subUrl?: string;
      apiToken?: string;
      username?: string;
      password?: string;
    },
  ) {
    return this.panelsService.register(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'List all panels with sync health and client counts',
  })
  findAll() {
    return this.panelsService.findAll();
  }

  @Get('capability-catalog')
  @ApiOperation({ summary: 'Flat capability map for 3x-ui / Eylan / Pasarguard' })
  capabilityCatalog() {
    return this.panelsService.capabilityCatalog();
  }

  @Get(':id/capabilities')
  @ApiOperation({ summary: 'Flat capabilities for one panel (UI/policy, not panelType checks)' })
  capabilitiesForPanel(@Param('id') id: string) {
    return this.panelsService.capabilitiesForPanel(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get panel details with inbounds' })
  findOne(@Param('id') id: string) {
    return this.panelsService.findOne(id);
  }

  @Get(':id/inbounds')
  @ApiOperation({ summary: 'Fetch live inbounds from 3x-ui API' })
  getInbounds(@Param('id') id: string) {
    return this.panelsService.getInbounds(id);
  }

  @Post(':id/scan-capabilities')
  @ApiOperation({
    summary:
      'Manually trigger a deep scan of panel capabilities based on OpenAPI spec',
  })
  scanCapabilities(@Param('id') id: string) {
    return this.panelsService.scanCapabilities(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update panel' })
  update(
    @Param('id') id: string,
    @Body()
    dto: {
      name?: string;
      url?: string;
      subUrl?: string;
      apiToken?: string;
      status?: string;
      description?: string | null;
      maxClients?: number | string | null;
    },
  ) {
    return this.panelsService.update(id, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Remove panel' })
  remove(@Param('id') id: string) {
    return this.panelsService.remove(id);
  }

  @Post(':id/sync')
  @ApiOperation({ summary: 'Run sync for a panel' })
  sync(@Param('id') id: string) {
    return this.panelsService.sync(id);
  }

  @Get(':id/volume-conflicts')
  @ApiOperation({
    summary: 'Clients whose 3x-ui volume is below the one recorded in HMPanel',
  })
  volumeConflicts(@Param('id') id: string) {
    return this.panelsService.getVolumeConflicts(id);
  }

  @Post(':id/volume-conflicts/push')
  @ApiOperation({
    summary: 'Write HMPanel volumes to 3x-ui for the listed conflicts (manual)',
  })
  pushVolumes(@Param('id') id: string, @Body() body: { emails?: string[] }) {
    return this.panelsService.pushVolumesFromHmpanel(id, body?.emails);
  }

  @Post(':id/restart-xray')
  @ApiOperation({ summary: 'Restart Xray on the panel node' })
  restartXray(@Param('id') id: string) {
    return this.panelsService.restartXray(id);
  }

  @Get(':id/logs')
  @ApiOperation({ summary: 'Recent node logs' })
  logs(@Param('id') id: string) {
    return this.panelsService.logs(id);
  }
}
