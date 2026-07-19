import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard, Roles } from '../common/roles.guard';
import { SettingsService } from './settings.service';
import { LicenseService } from './license.service';
import { DiagnosticService } from './diagnostic.service';
@ApiTags('Settings')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('settings')
export class SettingsController {
  constructor(
    private settingsService: SettingsService,
    private licenseService: LicenseService,
    private diagnosticService: DiagnosticService,
  ) {}

  @Get('diagnostics')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Get full system diagnostics report' })
  async getDiagnostics() {
    return this.diagnosticService.getDiagnostics();
  }

  @Get('display-timezone')
  // Any authenticated JWT user (no SUPER_ADMIN) — used by UI clocks
  @ApiOperation({ summary: 'Get display timezone for UI and notifications' })
  async getDisplayTimezone() {
    const timezone = await this.settingsService.getDisplayTimezone();
    return { timezone };
  }

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

  @Get('ssl-diagnostic')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Run SSL diagnostic audit' })
  async runSslDiagnostic() {
    // We can put the logic directly here or in service. For quick diagnostic, we call a new service method
    return this.settingsService.runSslDiagnostic();
  }

  @Get('update-logs')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Get current updater logs' })
  async getUpdateLogs() {
    return this.settingsService.getUpdateLogs();
  }
}
