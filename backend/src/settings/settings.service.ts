import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SettingsService {
  constructor(private prisma: PrismaService) {}

  async getSetting(key: string, defaultValue: any = null) {
    const setting = await this.prisma.systemSetting.findUnique({ where: { key } });
    if (!setting) return defaultValue;
    try {
      return JSON.parse(setting.value);
    } catch {
      return setting.value;
    }
  }

  async getAllSettings() {
    const settings = await this.prisma.systemSetting.findMany();
    const result: Record<string, any> = {};
    for (const s of settings) {
      try {
        result[s.key] = JSON.parse(s.value);
      } catch {
        result[s.key] = s.value;
      }
    }
    return result;
  }

  async setSetting(key: string, value: any) {
    const valueStr = JSON.stringify(value);
    return this.prisma.systemSetting.upsert({
      where: { key },
      update: { value: valueStr },
      create: { key, value: valueStr },
    });
  }

  async setSettings(settings: Record<string, any>) {
    const results = [];
    for (const [key, value] of Object.entries(settings)) {
      results.push(await this.setSetting(key, value));
    }
    return results;
  }
}
