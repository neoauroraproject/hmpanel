import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../prisma/prisma.service';
import { PaygMeterService } from './payg-meter.service';
import { PaygService } from './payg.service';

@Injectable()
export class PaygMeterScheduler {
  private readonly logger = new Logger(PaygMeterScheduler.name);
  private running = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly meter: PaygMeterService,
    private readonly payg: PaygService,
  ) {}

  /** Default hourly tick; per-admin meterIntervalHours can skip if > 1 (best-effort). */
  @Cron(CronExpression.EVERY_HOUR)
  async hourlyMeterTick() {
    if (this.running) {
      this.logger.warn('PAYG meter tick already running; skip');
      return;
    }
    this.running = true;
    try {
      const settings = await this.prisma.paygSettings.findMany({
        select: { adminId: true, meterIntervalHours: true },
      });
      const hour = new Date().getUTCHours();
      const admins =
        settings.length > 0
          ? settings.filter((s) => {
              const interval = Math.max(1, Number(s.meterIntervalHours) || 1);
              return hour % interval === 0;
            })
          : null;

      if (admins && admins.length === 0) {
        this.logger.debug('PAYG meter: no admins due this hour');
        return;
      }

      if (!admins) {
        const result = await this.meter.runMeterTick();
        if (result.charged > 0) {
          this.logger.log(
            `PAYG meter: processed=${result.processed} charged=${result.charged}`,
          );
        }
        return;
      }

      let charged = 0;
      let processed = 0;
      for (const s of admins) {
        const result = await this.meter.runMeterTick({ adminId: s.adminId });
        charged += result.charged;
        processed += result.processed;
      }
      if (charged > 0) {
        this.logger.log(`PAYG meter: processed=${processed} charged=${charged}`);
      }
    } catch (err: any) {
      this.logger.warn(`PAYG meter tick failed: ${err?.message || err}`);
    } finally {
      this.running = false;
    }
  }

  /** Optional daily digest prep at 00:05 UTC for bot/logs consumers. */
  @Cron('5 0 * * *')
  async dailyDigestPrep() {
    try {
      const admins = await this.prisma.paygSettings.findMany({
        select: { adminId: true },
      });
      for (const a of admins) {
        const digest = await this.payg.prepareDailyDigest(a.adminId);
        if (digest.entryCount > 0) {
          this.logger.log(
            `PAYG daily digest admin=${a.adminId} entries=${digest.entryCount} amount=${digest.totalAmount}`,
          );
        }
      }
    } catch (err: any) {
      this.logger.warn(`PAYG daily digest failed: ${err?.message || err}`);
    }
  }
}
