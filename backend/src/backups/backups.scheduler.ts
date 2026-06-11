import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { BackupsService } from './backups.service';
import { PrismaService } from '../prisma/prisma.service';
import { SettingsService } from '../settings/settings.service';

@Injectable()
export class BackupsScheduler {
  private readonly logger = new Logger(BackupsScheduler.name);

  constructor(
    private backupsService: BackupsService,
    private prisma: PrismaService,
    private settingsService: SettingsService,
  ) {}

  private async getPlatformConfig() {
    const enabled = await this.settingsService.getSetting('platformBackupEnabled', false);
    return {
      enabled,
      counts: {
        '5min': await this.settingsService.getSetting('platformBackupCount_5min', 6),
        '30min': await this.settingsService.getSetting('platformBackupCount_30min', 12),
        'hourly': await this.settingsService.getSetting('platformBackupCount_hourly', 24),
        'daily': await this.settingsService.getSetting('platformBackupCount_daily', 7),
        'weekly': await this.settingsService.getSetting('platformBackupCount_weekly', 4),
      }
    };
  }

  @Cron(CronExpression.EVERY_5_MINUTES)
  async handle5MinBackup() {
    const config = await this.getPlatformConfig();
    if (!config.enabled) return;
    this.logger.log('Running 5-Minute automated backup');
    await this.backupsService.create('postgres', '5min', false);
    await this.pruneBackups('postgres', '5min', config.counts['5min']);
  }

  @Cron(CronExpression.EVERY_30_MINUTES)
  async handle30MinBackup() {
    const config = await this.getPlatformConfig();
    if (!config.enabled) return;
    this.logger.log('Running 30-Minute automated backup');
    await this.backupsService.create('postgres', '30min', false);
    await this.pruneBackups('postgres', '30min', config.counts['30min']);
  }

  @Cron(CronExpression.EVERY_HOUR)
  async handleHourlyBackup() {
    const config = await this.getPlatformConfig();
    if (config.enabled) {
      this.logger.log('Running Hourly automated backup');
      await this.backupsService.create('postgres', 'hourly', false);
      await this.pruneBackups('postgres', 'hourly', config.counts['hourly']);
    }
    await this.runPanelBackups('hourly');
  }

  @Cron(CronExpression.EVERY_6_HOURS)
  async handle6HourBackup() {
    await this.runPanelBackups('6h');
  }

  @Cron(CronExpression.EVERY_12_HOURS)
  async handle12HourBackup() {
    await this.runPanelBackups('12h');
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async handleDailyBackup() {
    const config = await this.getPlatformConfig();
    if (config.enabled) {
      this.logger.log('Running Daily automated backup');
      await this.backupsService.create('postgres', 'daily', false);
      await this.pruneBackups('postgres', 'daily', config.counts['daily']);
    }
    await this.runPanelBackups('daily');
  }

  @Cron('0 0 * * 0') // Every Sunday at midnight
  async handleWeeklyBackup() {
    const config = await this.getPlatformConfig();
    if (!config.enabled) return;
    this.logger.log('Running Weekly automated backup');
    await this.backupsService.create('postgres', 'weekly', false);
    await this.pruneBackups('postgres', 'weekly', config.counts['weekly']);
  }

  private async runPanelBackups(frequency: string) {
    const panels = await this.prisma.panel.findMany({
      where: { backupEnabled: true, backupFrequency: frequency }
    });
    
    for (const panel of panels) {
      this.logger.log(`Running ${frequency} backup for panel ${panel.name}`);
      try {
        await this.backupsService.create('x-ui-db', frequency, false, panel.id);
        await this.prunePanelBackups(panel.id, frequency, panel.backupKeepCount);
      } catch (e: any) {
        this.logger.error(`Failed automated backup for panel ${panel.id}: ${e.message}`);
      }
    }
  }

  private async pruneBackups(type: string, tier: string, keepLimit: number) {
    const backups = await this.prisma.backup.findMany({
      where: { type, tier, isManual: false },
      orderBy: { createdAt: 'desc' },
    });

    if (backups.length > keepLimit) {
      const toDelete = backups.slice(keepLimit);
      for (const b of toDelete) {
        try {
          await this.backupsService.remove(b.id);
        } catch (e) {}
      }
    }
  }

  private async prunePanelBackups(panelId: string, tier: string, keepLimit: number) {
    const backups = await this.prisma.backup.findMany({
      where: { type: 'x-ui-db', panelId, tier, isManual: false },
      orderBy: { createdAt: 'desc' },
    });

    if (backups.length > keepLimit) {
      const toDelete = backups.slice(keepLimit);
      for (const b of toDelete) {
        try {
          await this.backupsService.remove(b.id);
        } catch (e) {}
      }
    }
  }
}
