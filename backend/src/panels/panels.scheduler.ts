import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PanelsService } from './panels.service';

/**
 * Global panel sync scheduler.
 *
 * Traffic usage sync runs about every minute; a full structural sync (inbound
 * prune, orphan cleanup, connectionExtras refresh) runs about every 5 minutes.
 * PanelsService owns the non-overlapping lock so boot / manual / cron never stack.
 */
@Injectable()
export class PanelsScheduler {
  private readonly logger = new Logger(PanelsScheduler.name);

  constructor(private readonly panelsService: PanelsService) {}

  /** Every minute — traffic-focused; escalates to full when due. */
  @Cron('0 * * * * *')
  async handleGlobalSync() {
    const result = await this.panelsService.runGlobalSyncCycle();
    if (result.skipped) {
      this.logger.warn(
        'Previous global sync is still running. Skipping this cycle.',
      );
    }
  }
}
