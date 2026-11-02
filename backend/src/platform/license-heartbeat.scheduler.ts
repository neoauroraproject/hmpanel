import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LicenseManagerService } from './license-manager.service';
import { LicenseActivationService } from './license-activation.service';
import { PluginsService } from '../plugins/plugins.service';

@Injectable()
export class LicenseHeartbeatScheduler implements OnApplicationBootstrap {
  private readonly logger = new Logger(LicenseHeartbeatScheduler.name);

  constructor(
    private licenseManager: LicenseManagerService,
    private licenseActivation: LicenseActivationService,
    private pluginsService: PluginsService,
  ) {}

  /** A panel upgraded from a build without signed leases fetches one right away. */
  onApplicationBootstrap(): void {
    setTimeout(() => {
      this.licenseActivation
        .recoverEntitlementLease()
        .catch((err) => this.logger.warn(`Entitlement lease recovery failed: ${err?.message || err}`));
    }, 5_000).unref?.();
  }

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async dailyHeartbeat(): Promise<void> {
    await this.runHeartbeatWithRetry();
    await this.licenseActivation.recoverEntitlementLease();
  }

  async runHeartbeatWithRetry(): Promise<void> {
    const RETRY_DELAYS_MS = [5 * 60_000, 30 * 60_000, 2 * 60 * 60_000];
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        await this.licenseManager.refreshFromServer();
        await this.pluginsService.syncWithLicenseState();
        return;
      } catch (err: any) {
        this.logger.warn(`Heartbeat attempt ${attempt + 1} failed: ${err.message}`);
        if (attempt < RETRY_DELAYS_MS.length) {
          await new Promise((r) => setTimeout(r, RETRY_DELAYS_MS[attempt]));
        }
      }
    }
    await this.licenseManager.markServerUnreachable();
  }
}
