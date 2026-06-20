import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard, Roles } from '../common/roles.guard';
import { SslService } from './ssl.service';

@ApiTags('SSL Management')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('settings/ssl')
export class SslController {
  constructor(private sslService: SslService) {}

  @Get()
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Get current SSL status and mode' })
  async getStatus() {
    return this.sslService.getStatus();
  }

  @Post('renew')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Force renew the ACME certificate' })
  async renew() {
    return this.sslService.renew();
  }

  @Post('switch')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Switch between HTTP and HTTPS mode' })
  async switchMode(@Body() body: { enableHttps: boolean }) {
    return this.sslService.switchMode(body.enableHttps);
  }
}
