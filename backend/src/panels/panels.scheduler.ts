import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PanelsService } from './panels.service';
import { PrismaService } from '../prisma/prisma.service';
import { isExternalPanelType } from './native/native-panel-capabilities';

@Injectable()
export class PanelsScheduler {
  private readonly logger = new Logger(PanelsScheduler.name);
  private isSyncing = false;

  constructor(
    private readonly panelsService: PanelsService,
    private readonly prisma: PrismaService,
  ) {}

  @Cron(CronExpression.EVERY_30_SECONDS)
  async handleGlobalSync() {
    if (this.isSyncing) {
      this.logger.warn(
        'Previous global sync is still running. Skipping this cycle.',
      );
      return;
    }

    this.isSyncing = true;
    this.logger.log('Starting global panel sync...');

    try {
      const panels = await this.prisma.panel.findMany({
        select: { id: true, name: true, panelType: true },
      });

      for (const panel of panels) {
        if (isExternalPanelType(panel.panelType)) {
          continue;
        }
        try {
          await this.panelsService.sync(panel.id);
          this.logger.debug(`Synced panel ${panel.name} successfully.`);
        } catch (error) {
          this.logger.error(
            `Failed to sync panel ${panel.name}: ${error.message}`,
          );

          await this.prisma.syncState.upsert({
            where: { panelId: panel.id },
            update: {
              status: 'offline',
              errorLogs: error.message,
              updatedAt: new Date(),
            },
            create: {
              panelId: panel.id,
              lastSync: new Date(0),
              status: 'offline',
              errorLogs: error.message,
            },
          });

          await this.prisma.panel.update({
            where: { id: panel.id },
            data: { status: 'offline', lastOnline: null },
          });
        }
      }

      await this.panelsService.processSuspensions();

      this.logger.log('Global panel sync completed.');
    } catch (error) {
      this.logger.error(`Global sync failed: ${error.message}`);
    } finally {
      this.isSyncing = false;
    }
  }
}
