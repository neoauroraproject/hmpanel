import { Injectable, Logger } from '@nestjs/common';
import { LicenseManagerService } from '../platform/license-manager.service';
import * as fs from 'fs';
import * as path from 'path';
import {
  getPremiumBootstrapResult,
  resolveHmpanelDist,
  type PremiumBootstrapResult,
} from './premium-bootstrap';

/**
 * Reports premium bundle status. Actual Nest module import happens in
 * main.ts via loadPremiumModulesForBootstrap() BEFORE NestFactory.create
 * so HTTP controllers register correctly.
 *
 * Hot-reload of controllers is impossible in Nest — after a bundle file
 * change, LicenseActivationService restarts the process and bootstrap
 * loads the new code.
 */
@Injectable()
export class PluginsService {
  private readonly logger = new Logger(PluginsService.name);
  /** Soft flag: license inactive hides premium even if modules were bootstrapped. */
  private licenseAllowsPremium = true;

  constructor(private licenseManager: LicenseManagerService) {
    const boot = getPremiumBootstrapResult();
    if (boot.loaded) {
      this.logger.log(
        `Premium modules active from bootstrap: [${boot.segments.join(', ')}]`,
      );
    } else if (boot.error) {
      this.logger.error(`Premium bootstrap error: ${boot.error}`);
    } else {
      this.logger.log('No premium modules in this process (Community / no bundle).');
    }
  }

  private boot(): PremiumBootstrapResult {
    return getPremiumBootstrapResult();
  }

  isLoaded(): boolean {
    return this.boot().loaded && this.licenseAllowsPremium;
  }

  getLastLoadError(): string | null {
    return this.boot().error;
  }

  getBootstrappedSegments(): string[] {
    return this.boot().segments;
  }

  /**
   * Controllers cannot be hot-swapped. Callers that need a fresh bundle
   * must restart the backend process (scheduleBackendRestart).
   */
  async reloadPremiumPlugins(): Promise<boolean> {
    const boot = this.boot();
    if (!boot.loaded) {
      this.logger.warn(
        'Premium modules were not imported at process start. Restart the backend after installing/updating the bundle.',
      );
      return false;
    }
    await this.syncWithLicenseState();
    return this.isLoaded();
  }

  /** Keep plugin load flag aligned with license — bundle stays on disk, only activation/update downloads. */
  async syncWithLicenseState(): Promise<void> {
    const state = await this.licenseManager.getLicenseState();
    const active =
      state.edition === 'PREMIUM' &&
      state.mode !== 'disabled' &&
      state.status !== 'invalid' &&
      state.status !== 'community' &&
      state.status !== 'expired';

    if (!active) {
      if (this.licenseAllowsPremium && this.boot().loaded) {
        this.logger.warn(
          'Premium license inactive — APIs guarded off (database records and bootstrapped modules preserved until restart).',
        );
      }
      this.licenseAllowsPremium = false;
      return;
    }

    this.licenseAllowsPremium = true;
    if (!this.boot().loaded) {
      this.logger.warn(
        'License active but premium modules missing from this process — restart backend to load bundle routes.',
      );
    }
  }

  resolveHmpanelDist(): string {
    return resolveHmpanelDist();
  }

  isBundleFilePresent(): boolean {
    const pluginPath =
      process.env.PREMIUM_PLUGIN_PATH ||
      path.join('/opt/hmpanel/premium', 'backend', 'index.js');
    return fs.existsSync(pluginPath);
  }
}
