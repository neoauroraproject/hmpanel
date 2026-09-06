import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  mergePlatformFlags,
  PLATFORM_FLAG_DEFAULTS,
  PLATFORM_FLAGS_SETTING_KEY,
  type PlatformFlagName,
} from './feature-flags';

@Injectable()
export class FeatureFlagsService {
  private readonly logger = new Logger(FeatureFlagsService.name);
  private cache: Record<PlatformFlagName, boolean> | null = null;
  private cacheAt = 0;
  private readonly ttlMs = 5_000;

  constructor(private prisma: PrismaService) {}

  async getAll(): Promise<Record<PlatformFlagName, boolean>> {
    const now = Date.now();
    if (this.cache && now - this.cacheAt < this.ttlMs) return this.cache;
    try {
      const row = await this.prisma.systemSetting.findUnique({
        where: { key: PLATFORM_FLAGS_SETTING_KEY },
      });
      let parsed: unknown = null;
      if (row?.value) {
        try {
          parsed = JSON.parse(row.value);
        } catch {
          parsed = null;
        }
      }
      this.cache = mergePlatformFlags(parsed);
      this.cacheAt = now;
      return this.cache;
    } catch (err: any) {
      this.logger.warn(`Feature flags fallback to defaults: ${err?.message || err}`);
      return { ...PLATFORM_FLAG_DEFAULTS };
    }
  }

  async isEnabled(flag: PlatformFlagName): Promise<boolean> {
    const all = await this.getAll();
    return !!all[flag];
  }

  async setFlags(
    patch: Partial<Record<PlatformFlagName, boolean>>,
  ): Promise<Record<PlatformFlagName, boolean>> {
    const current = await this.getAll();
    const next = { ...current, ...patch };
    await this.prisma.systemSetting.upsert({
      where: { key: PLATFORM_FLAGS_SETTING_KEY },
      update: { value: JSON.stringify(next) },
      create: { key: PLATFORM_FLAGS_SETTING_KEY, value: JSON.stringify(next) },
    });
    this.cache = next;
    this.cacheAt = Date.now();
    return next;
  }
}
