import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { LazyModuleLoader } from '@nestjs/core';
import { LicenseManagerService } from '../platform/license-manager.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class PluginsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PluginsService.name);

  constructor(
    private lazyModuleLoader: LazyModuleLoader,
    private licenseManager: LicenseManagerService,
  ) {}

  async onApplicationBootstrap() {
    await this.loadPremiumPlugins();
  }

  async loadPremiumPlugins() {
    const pluginPath =
      process.env.PREMIUM_PLUGIN_PATH ||
      path.join('/opt/hmpanel/premium', 'backend', 'index.js');

    if (!fs.existsSync(pluginPath)) {
      this.logger.log('No premium bundle installed — Community mode.');
      return;
    }

    try {
      const state = await this.licenseManager.getLicenseState();
      if (
        state.mode === 'disabled' ||
        state.status === 'invalid' ||
        state.status === 'community'
      ) {
        this.logger.warn('Premium bundle present but license inactive — skipping load.');
        return;
      }

      this.logger.log(`Loading premium bundle from ${pluginPath}`);
      const premiumModuleImport = await import(pluginPath);
      const PremiumBundleModule =
        premiumModuleImport.PremiumBundleModule || premiumModuleImport.default;

      if (!PremiumBundleModule) {
        throw new Error('Bundle does not export PremiumBundleModule.');
      }

      await this.lazyModuleLoader.load(() => PremiumBundleModule);
      this.logger.log('Premium bundle loaded.');
    } catch (error: any) {
      this.logger.error(`Failed to load premium bundle: ${error.message}`);
    }
  }
}
