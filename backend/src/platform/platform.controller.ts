import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Res,
  NotFoundException,
  Req,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { Roles, RolesGuard } from '../common/roles.guard';
import { LicenseManagerService } from './license-manager.service';
import { LicenseActivationService } from './license-activation.service';
import { FeatureManagerService } from './feature-manager.service';
import { PremiumBundleService } from './premium-bundle.service';
import { PremiumCatalogService } from './premium-catalog.service';
import { PluginsService } from '../plugins/plugins.service';
import type { Response } from 'express';
import type { AuthRequest } from '../common/auth-request';
import * as fs from 'fs';
import * as path from 'path';

export const PREMIUM_SUPPORT_URL = 'https://t.me/hmraysupport';

@ApiTags('Platform')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('platform')
export class PlatformController {
  constructor(
    private licenseManager: LicenseManagerService,
    private licenseActivation: LicenseActivationService,
    private featureManager: FeatureManagerService,
    private bundleService: PremiumBundleService,
    private catalogService: PremiumCatalogService,
    private pluginsService: PluginsService,
  ) {}

  @Get('license')
  @ApiOperation({ summary: 'Current license state' })
  async getLicense() {
    const state = await this.licenseManager.getLicenseState();
    const bundle = await this.licenseActivation.getBundleStatus();
    return {
      ...state,
      bundle,
      supportUrl: PREMIUM_SUPPORT_URL,
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
  @ApiOperation({ summary: 'Deactivate license (keeps bundle on disk)' })
  async deactivateLicense() {
    const result = await this.licenseActivation.deactivate();
    return { ok: true, ...result };
  }

  @Post('license/reload-plugins')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Reload premium backend modules without reinstalling bundle' })
  async reloadPlugins() {
    return this.licenseActivation.reloadPlugins();
  }

  @Post('license/diagnose-bundle')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Diagnose premium bundle download pipeline' })
  async diagnoseBundle() {
    return this.licenseActivation.diagnoseBundle();
  }

  @Post('license/update-bundle')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Download latest premium bundle for active license' })
  async updateBundle() {
    return this.licenseActivation.updateBundle();
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

  @Get('premium-module-catalog')
  @ApiOperation({ summary: 'Premium module list (community fallback)' })
  async getPremiumCatalog(@Req() req: AuthRequest) {
    return this.catalogService.listForLicensedAdmin(req.user.role);
  }

  @Get('features')
  @ApiOperation({ summary: 'Premium feature flags' })
  async getFeatures() {
    return this.featureManager.getActiveFeatures();
  }
}

/** Public static assets from installed premium bundle (frontend runtime). */
@ApiTags('Platform')
@Controller('platform/premium-assets')
export class PremiumAssetsController {
  constructor(private bundleService: PremiumBundleService) {}

  @Get('frontend/premium-runtime.js')
  serveRuntime(@Res() res: Response) {
    const file = path.join(
      this.bundleService.getPremiumRoot(),
      'frontend',
      'premium-runtime.js',
    );
    if (!fs.existsSync(file)) {
      throw new NotFoundException('Premium runtime not installed');
    }
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.sendFile(file);
  }
}
