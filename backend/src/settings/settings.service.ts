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

  async checkUpdate() {
    try {
      const axios = require('axios');
      const response = await axios.get('https://api.github.com/repos/neoauroraproject/hmpanel/releases/latest', {
        headers: { 'User-Agent': 'HMPanel' },
        timeout: 5000,
      });
      const latestVersion = response.data.tag_name;
      const currentVersion = process.env.NEXT_PUBLIC_APP_VERSION || 'v1.0.18'; // Fallback
      
      const latestClean = latestVersion.replace(/^v/, '');
      const currentClean = currentVersion.replace(/^v/, '');
      
      const hasUpdate = this.compareVersions(latestClean, currentClean) > 0;
      return { hasUpdate, latestVersion, currentVersion };
    } catch (error) {
      console.error('Failed to check for updates:', error.message);
      return { hasUpdate: false, latestVersion: 'unknown', currentVersion: process.env.NEXT_PUBLIC_APP_VERSION || 'unknown' };
    }
  }

  private compareVersions(v1: string, v2: string) {
    const p1 = v1.split('.').map(Number);
    const p2 = v2.split('.').map(Number);
    for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
      const num1 = p1[i] || 0;
      const num2 = p2[i] || 0;
      if (num1 > num2) return 1;
      if (num1 < num2) return -1;
    }
    return 0;
  }

  async updatePanel() {
    try {
      const { promisify } = require('util');
      const { exec } = require('child_process');
      const execAsync = promisify(exec);

      // Find the installation directory using Docker inspect on itself
      const inspectRes = await execAsync('docker inspect hmpanel-panel');
      const inspectData = JSON.parse(inspectRes.stdout);
      const installDir = inspectData[0].Config.Labels['com.docker.compose.project.working_dir'];

      if (!installDir) {
        throw new Error('Could not determine installation directory from container labels.');
      }

      console.log(`Starting panel update. Install dir: ${installDir}`);

      // Run a detached background docker container that executes the update.sh on the host
      // This allows the panel to go offline and be recreated by docker compose up -d without killing the update process!
      const command = `docker run -d --name hmpanel-updater --rm -v "${installDir}:${installDir}" -v /var/run/docker.sock:/var/run/docker.sock -w "${installDir}" docker:latest /bin/sh -c "apk add --no-cache bash curl && bash update.sh"`;
      
      await execAsync(command);

      return { success: true, message: 'Update process initiated. Panel will be back in a few minutes.' };
    } catch (error) {
      console.error('Failed to start update process:', error);
      throw new Error('Failed to initiate update: ' + error.message);
    }
  }
}
