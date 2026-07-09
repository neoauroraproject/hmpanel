import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Roles, RolesGuard } from '../common/roles.guard';
import { LicenseManagerService } from './license-manager.service';
import { LicenseActivationService } from './license-activation.service';

@ApiTags('Platform')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('platform')
export class PlatformController {
  constructor(
    private licenseManager: LicenseManagerService,
    private licenseActivation: LicenseActivationService,
  ) {}

  @Get('license')
  @ApiOperation({ summary: 'Current license state' })
  async getLicense() {
    const state = await this.licenseManager.getLicenseState();
    const bundle = await this.licenseActivation.getBundleStatus();
    return {
      ...state,
      bundle,
      licenseServer: {
        primary: this.licenseActivation.getLicenseServerUrl(),
        urls: this.licenseActivation.getLicenseServerUrls(),
      },
    };
  }

  @Post('license/activate')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Activate premium license and download bundle' })
  async activateLicense(@Body() body: { licenseKey: string }) {
    if (!body.licenseKey?.trim()) {
      return { ok: false, error: 'licenseKey required' };
    }
    return this.licenseActivation.activate(body.licenseKey.trim());
  }

  @Post('license/deactivate')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Deactivate license and free installation slot' })
  async deactivateLicense() {
    await this.licenseActivation.deactivate();
    return { ok: true };
  }

  @Get('license/bundle-status')
  @Roles('SUPER_ADMIN')
  async bundleStatus() {
    return this.licenseActivation.getBundleStatus();
  }

  @Post('license/recheck')
  @Roles('SUPER_ADMIN')
  async recheckLicense() {
    const state = await this.licenseActivation.recheckNow();
    return { ok: true, state };
  }
}
