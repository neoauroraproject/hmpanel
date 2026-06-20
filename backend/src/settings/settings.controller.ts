import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard, Roles } from '../common/roles.guard';
import { SettingsService } from './settings.service';
import { LicenseService } from './license.service';
import { PremiumGuard } from '../common/guards/premium.guard';

@ApiTags('Settings')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('settings')
export class SettingsController {
  constructor(
    private settingsService: SettingsService,
    private licenseService: LicenseService,
  ) {}

  @Get()
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Get all system settings' })
  async getAllSettings() {
    return this.settingsService.getAllSettings();
  }

  @Post()
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Update system settings' })
  async updateSettings(@Body() body: Record<string, any>) {
    await this.settingsService.setSettings(body);
    return { success: true };
  }

  @Get('license')
  @UseGuards(PremiumGuard)
  // No @Roles guard here, we want all authenticated users (even resellers) to know what features they have
  @ApiOperation({ summary: 'Get active premium features for the platform' })
  async getLicenseFeatures() {
    return this.licenseService.getActiveFeatures();
  }

  @Get('check-update')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Check for panel updates on GitHub' })
  async checkUpdate() {
    return this.settingsService.checkUpdate();
  }

  @Post('update-panel')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Trigger automatic panel update' })
  async updatePanel() {
    return this.settingsService.updatePanel();
  }
}
