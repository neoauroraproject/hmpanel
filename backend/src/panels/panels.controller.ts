import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard, Roles } from '../common/roles.guard';
import { PanelsService } from './panels.service';

@ApiTags('Panels')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('SUPER_ADMIN')
@Controller('panels')
export class PanelsController {
  constructor(private panelsService: PanelsService) {}

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
  getOnlineIps() {
    return this.panelsService.getOnlineClientIps();
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
