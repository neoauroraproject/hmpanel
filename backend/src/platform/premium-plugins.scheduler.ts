import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LicenseManagerService } from './license-manager.service';
import { PremiumBundleService } from './premium-bundle.service';
import { PluginsService } from '../plugins/plugins.service';

/**
 * Premium backend routes (client-templates, backup-center, monitoring, …) only exist
 * after the lazy-loaded bundle registers. If the first boot attempt fails (timing,
 * Redis, dist path), retry until the bundle is loaded — otherwise the UI works but
 * every API returns 404.
 */
@Injectable()
export class PremiumPluginsScheduler {
  private readonly logger = new Logger(PremiumPluginsScheduler.name);

  constructor(
    private licenseManager: LicenseManagerService,
    private bundleService: PremiumBundleService,
    private pluginsService: PluginsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async ensurePremiumPluginsLoaded(): Promise<void> {
    if (this.pluginsService.isLoaded()) return;
    if (!this.bundleService.isBundleInstalled()) return;

    const state = await this.licenseManager.getLicenseState();
    const active =
      state.edition === 'PREMIUM' &&
      state.mode !== 'disabled' &&
      state.status !== 'invalid' &&
      state.status !== 'community' &&
      state.status !== 'expired';

    if (!active) return;

    const loaded = await this.pluginsService.reloadPremiumPlugins();
    if (loaded) {
      this.logger.log('Premium backend modules loaded (scheduled retry).');
    } else {
      const err = this.pluginsService.getLastLoadError();
      if (err) {
        this.logger.warn(`Premium module load retry failed: ${err}`);
      }
    }
  }
}
