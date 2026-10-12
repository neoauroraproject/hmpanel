import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Sse,
  Query,
} from '@nestjs/common';
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
  async renew(@Body() body: { opId?: string } = {}) {
    return this.sslService.renew(body?.opId);
  }

  @Post('switch')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Switch between HTTP and HTTPS mode' })
  async switchMode(@Body() body: { enableHttps: boolean; opId?: string }) {
    return this.sslService.switchMode(body.enableHttps, body.opId);
  }

  @Post('issue')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Issue a new SSL certificate' })
  async issue(
    @Body()
    body: { domain: string; email: string; selfSigned?: boolean; opId?: string },
  ) {
    return this.sslService.issue(
      body.domain,
      body.email,
      body.selfSigned,
      body.opId,
    );
  }

  @Post('change-domain')
  @Roles('SUPER_ADMIN')
  @ApiOperation({
    summary: 'Change the domain and issue a new certificate with rollback',
  })
  async changeDomain(
    @Body() body: { domain: string; email: string; opId?: string },
  ) {
    return this.sslService.changeDomain(body.domain, body.email, body.opId);
  }

  @Post('repair')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Repair the system SSL configuration' })
  async repair(@Body() body: { opId?: string } = {}) {
    return this.sslService.repair(body?.opId);
  }

  @Sse('stream')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Stream HMCTL execution progress via SSE' })
  stream(@Query('op') op?: string) {
    return this.sslService.getStream(op);
  }
}
