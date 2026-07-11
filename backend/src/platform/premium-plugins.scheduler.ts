import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LicenseManagerService } from './license-manager.service';
import { PremiumBundleService } from './premium-bundle.service';
import { PluginsService } from '../plugins/plugins.service';

/**
 * If the premium bundle is on disk and licensed but this process did not
 * import it at bootstrap (corrupt file, race on first boot), exit so
 * Docker start.sh restarts and main.ts registers controller routes.
 */
@Injectable()
export class PremiumPluginsScheduler {
  private readonly logger = new Logger(PremiumPluginsScheduler.name);
  private restartScheduled = false;

  constructor(
    private licenseManager: LicenseManagerService,
    private bundleService: PremiumBundleService,
    private pluginsService: PluginsService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async ensurePremiumPluginsLoaded(): Promise<void> {
    if (this.pluginsService.isLoaded()) return;
    if (!this.bundleService.isBundleInstalled()) return;
    if (this.restartScheduled) return;

    const state = await this.licenseManager.getLicenseState();
    const active =
      state.edition === 'PREMIUM' &&
      state.mode !== 'disabled' &&
      state.status !== 'invalid' &&
      state.status !== 'community' &&
      state.status !== 'expired';

    if (!active) return;

    const err = this.pluginsService.getLastLoadError();
    this.logger.warn(
      `Premium bundle installed but routes not bootstrapped${err ? `: ${err}` : ''}. Exiting for clean reload…`,
    );
    this.restartScheduled = true;
    const delayMs = Number(process.env.PREMIUM_RESTART_DELAY_MS || 1500);
    setTimeout(() => {
      this.logger.warn('Exiting process for premium bootstrap reload…');
      process.exit(0);
    }, delayMs);
  }
}
