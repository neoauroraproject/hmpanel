import { Controller, Get, Post, Body, UseGuards, Sse } from '@nestjs/common';
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

  @Post('issue')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Issue a new SSL certificate' })
  async issue(
    @Body() body: { domain: string; email: string; selfSigned?: boolean },
  ) {
    return this.sslService.issue(body.domain, body.email, body.selfSigned);
  }

  @Post('change-domain')
  @Roles('SUPER_ADMIN')
  @ApiOperation({
    summary: 'Change the domain and issue a new certificate with rollback',
  })
  async changeDomain(@Body() body: { domain: string; email: string }) {
    return this.sslService.changeDomain(body.domain, body.email);
  }

  @Post('repair')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Repair the system SSL configuration' })
  async repair() {
    return this.sslService.repair();
  }

  @Sse('stream')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Stream HMCTL execution progress via SSE' })
  stream() {
    return this.sslService.getStream();
  }
}
