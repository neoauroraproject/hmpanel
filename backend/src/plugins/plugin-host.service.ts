import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { FeatureFlagsService } from '../platform/architecture/feature-flags.service';
import { PLATFORM_FLAGS } from '../platform/architecture/feature-flags';
import {
  parsePluginManifest,
  type PluginManifest,
} from './plugin-manifest';
import { PluginSlotRegistry } from './plugin-slot.registry';

export const PLUGIN_ALLOWLIST_SETTING_KEY = 'plugin_host_allowlist';
export const PLUGIN_INSTALLED_SETTING_KEY = 'plugin_host_installed';

export type InstalledPlugin = {
  manifest: PluginManifest;
  enabled: boolean;
  installedAt: string;
};

/**
 * Premium-oriented plugin host. Community is a no-op executor:
 * manifests are stored, slots are registered by ref, arbitrary server code is refused.
 */
@Injectable()
export class PluginHostService {
  constructor(
    private prisma: PrismaService,
    private flags: FeatureFlagsService,
    private slots: PluginSlotRegistry,
  ) {}

  async list(): Promise<InstalledPlugin[]> {
    return this.loadInstalled();
  }

  async install(rawManifest: unknown): Promise<InstalledPlugin> {
    await this.assertEnabled();
    const manifest = parsePluginManifest(rawManifest);
    const allow = await this.loadAllowlist();
    if (allow.length && !allow.includes(manifest.id)) {
      throw new BadRequestException(`Plugin ${manifest.id} is not on the allowlist`);
    }
    const installed = await this.loadInstalled();
    const next: InstalledPlugin = {
      manifest,
      enabled: false,
      installedAt: new Date().toISOString(),
    };
    const idx = installed.findIndex((p) => p.manifest.id === manifest.id);
    if (idx >= 0) installed[idx] = next;
    else installed.push(next);
    await this.saveInstalled(installed);
    return next;
  }

  async uninstall(id: string): Promise<{ ok: true }> {
    await this.assertEnabled();
    const installed = (await this.loadInstalled()).filter((p) => p.manifest.id !== id);
    await this.saveInstalled(installed);
    return { ok: true };
  }

  async setEnabled(id: string, enabled: boolean): Promise<InstalledPlugin> {
    await this.assertEnabled();
    const installed = await this.loadInstalled();
    const row = installed.find((p) => p.manifest.id === id);
    if (!row) throw new BadRequestException('Plugin is not installed');
    row.enabled = enabled;
    await this.saveInstalled(installed);
    this.syncSlots(installed);
    return row;
  }

  async execute(_pluginId: string, _slot: string, _payload: unknown): Promise<never> {
    throw new BadRequestException(
      'Ordinary plugins cannot run server code. Use Core API, events, and allowed slots.',
    );
  }

  private syncSlots(installed: InstalledPlugin[]) {
    this.slots.clear();
    for (const row of installed) {
      if (!row.enabled) continue;
      for (const slot of row.manifest.slots) {
        this.slots.register({
          pluginId: row.manifest.id,
          slot,
          ref: `${row.manifest.id}:${slot}`,
        });
      }
    }
  }

  private async assertEnabled() {
    if (!(await this.flags.isEnabled(PLATFORM_FLAGS.PLUGIN_HOST_V1))) {
      throw new BadRequestException('Plugin host is disabled');
    }
  }

  private async loadAllowlist(): Promise<string[]> {
    const raw = await this.readJson(PLUGIN_ALLOWLIST_SETTING_KEY);
    return Array.isArray(raw) ? raw.map(String) : [];
  }

  private async loadInstalled(): Promise<InstalledPlugin[]> {
    const raw = await this.readJson(PLUGIN_INSTALLED_SETTING_KEY);
    if (!Array.isArray(raw)) return [];
    return raw.filter((row) => row && typeof row === 'object') as InstalledPlugin[];
  }

  private async saveInstalled(rows: InstalledPlugin[]) {
    await this.prisma.systemSetting.upsert({
      where: { key: PLUGIN_INSTALLED_SETTING_KEY },
      update: { value: JSON.stringify(rows) },
      create: { key: PLUGIN_INSTALLED_SETTING_KEY, value: JSON.stringify(rows) },
    });
  }

  private async readJson(key: string): Promise<unknown> {
    try {
      const row = await this.prisma.systemSetting.findUnique({ where: { key } });
      if (!row?.value) return null;
      return JSON.parse(row.value);
    } catch {
      return null;
    }
  }
}
