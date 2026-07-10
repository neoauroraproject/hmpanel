import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LicenseManagerService } from './license-manager.service';
import { PluginsService } from '../plugins/plugins.service';

@Injectable()
export class LicenseHeartbeatScheduler {
  private readonly logger = new Logger(LicenseHeartbeatScheduler.name);

  constructor(
    private licenseManager: LicenseManagerService,
    private pluginsService: PluginsService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_1AM)
  async dailyHeartbeat(): Promise<void> {
    await this.runHeartbeatWithRetry();
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
