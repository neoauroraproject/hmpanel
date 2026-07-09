import { Injectable, Logger, OnApplicationBootstrap, Inject, forwardRef } from '@nestjs/common';
import { LazyModuleLoader } from '@nestjs/core';
import { LicenseManagerService } from '../platform/license-manager.service';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class PluginsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PluginsService.name);
  private loaded = false;

  constructor(
    private lazyModuleLoader: LazyModuleLoader,
    private licenseManager: LicenseManagerService,
  ) {}

  async onApplicationBootstrap() {
    await this.loadPremiumPlugins();
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  async reloadPremiumPlugins(): Promise<boolean> {
    this.loaded = false;
    return this.loadPremiumPlugins();
  }

  /**
   * Community backend dist path — premium bundle imports shared services from here.
   * Must be set before loading the bundle (bundles may bake wrong compile-time paths).
   */
  resolveHmpanelDist(): string {
    const candidates = [
      process.env.HMPANEL_DIST,
      path.join(process.cwd(), 'backend', 'dist'),
      '/app/backend/dist',
      path.join(process.cwd(), 'dist'),
    ].filter((v): v is string => Boolean(v?.trim()));

    for (const dir of candidates) {
      if (fs.existsSync(path.join(dir, 'main.js'))) {
        return dir;
      }
    }

    return path.join(process.cwd(), 'backend', 'dist');
  }

  async loadPremiumPlugins(): Promise<boolean> {
    const pluginPath =
      process.env.PREMIUM_PLUGIN_PATH ||
      path.join('/opt/hmpanel/premium', 'backend', 'index.js');

    if (!fs.existsSync(pluginPath)) {
      this.logger.log('No premium bundle installed — Community mode.');
      this.loaded = false;
      return false;
    }

    try {
      const state = await this.licenseManager.getLicenseState();
      if (
        state.mode === 'disabled' ||
        state.status === 'invalid' ||
        state.status === 'community'
      ) {
        this.logger.warn('Premium bundle on disk but license inactive — skipping load.');
        this.loaded = false;
        return false;
      }

      if (this.loaded) {
        return true;
      }

      const distPath = this.resolveHmpanelDist();
      process.env.HMPANEL_DIST = distPath;
      this.logger.log(`HMPANEL_DIST=${distPath}`);

      this.logger.log(`Loading premium bundle from ${pluginPath}`);
      const premiumModuleImport = await import(pluginPath);
      const PremiumBundleModule =
        premiumModuleImport.PremiumBundleModule || premiumModuleImport.default;

      if (!PremiumBundleModule) {
        throw new Error('Bundle does not export PremiumBundleModule.');
      }

      await this.lazyModuleLoader.load(() => PremiumBundleModule);
      this.loaded = true;
      this.logger.log('Premium bundle loaded.');
      return true;
    } catch (error: any) {
      this.logger.error(`Failed to load premium bundle: ${error.message}`, error?.stack);
      this.loaded = false;
      return false;
    }
  }
}
