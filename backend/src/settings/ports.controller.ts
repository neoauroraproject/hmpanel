import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard, Roles } from '../common/roles.guard';
import { PortsService } from './ports.service';

@ApiTags('Panel Ports')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('settings/ports')
export class PortsController {
  constructor(private readonly portsService: PortsService) {}

  @Get()
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Current HTTP/HTTPS ports the panel is published on' })
  getPorts() {
    return { ...this.portsService.getPorts(), status: this.portsService.getStatus() };
  }

  @Get('status')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Progress of the last port change' })
  getStatus() {
    return this.portsService.getStatus();
  }

  @Post()
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Move the panel to other HTTP/HTTPS ports' })
  changePorts(@Body() body: { httpPort: number | string; httpsPort: number | string }) {
    return this.portsService.changePorts(body?.httpPort, body?.httpsPort);
  }
}
