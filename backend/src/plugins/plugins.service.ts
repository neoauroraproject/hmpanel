import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { LazyModuleLoader } from '@nestjs/core';
import { LicenseManagerService } from '../platform/license-manager.service';
import { createRequire } from 'module';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class PluginsService implements OnApplicationBootstrap {
  private readonly logger = new Logger(PluginsService.name);
  private loaded = false;
  private lastLoadError: string | null = null;

  constructor(
    private lazyModuleLoader: LazyModuleLoader,
    private licenseManager: LicenseManagerService,
  ) {}

  async onApplicationBootstrap() {
    const pluginPath =
      process.env.PREMIUM_PLUGIN_PATH ||
      path.join('/opt/hmpanel/premium', 'backend', 'index.js');

    if (!fs.existsSync(pluginPath)) {
      await this.loadPremiumPlugins();
      return;
    }

    for (let attempt = 0; attempt < 5; attempt++) {
      if (await this.loadPremiumPlugins()) return;
      const err = this.lastLoadError;
      if (err) {
        this.logger.warn(
          `Premium bundle load attempt ${attempt + 1}/5 failed: ${err}`,
        );
      }
      await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)));
    }
  }

  isLoaded(): boolean {
    return this.loaded;
  }

  getLastLoadError(): string | null {
    return this.lastLoadError;
  }

  async reloadPremiumPlugins(): Promise<boolean> {
    this.loaded = false;
    return this.loadPremiumPlugins();
  }

  /** Keep plugin load flag aligned with license — bundle stays on disk, only activation/update downloads. */
  async syncWithLicenseState(): Promise<void> {
    const state = await this.licenseManager.getLicenseState();
    const active =
      state.edition === 'PREMIUM' &&
      state.mode !== 'disabled' &&
      state.status !== 'invalid' &&
      state.status !== 'community' &&
      state.status !== 'expired';

    if (!active) {
      if (this.loaded) {
        this.logger.warn(
          'Premium license inactive — premium modules deactivated (database records preserved).',
        );
      }
      this.loaded = false;
      this.lastLoadError = null;
      return;
    }

    if (!this.loaded) {
      await this.loadPremiumPlugins();
    }
  }

  resolveHmpanelDist(): string {
    const candidates = [
      process.env.HMPANEL_DIST,
      path.join(process.cwd(), 'backend', 'dist'),
      '/app/backend/dist',
      path.join(process.cwd(), 'dist'),
    ].filter((v): v is string => Boolean(v?.trim()));

    for (const dir of candidates) {
      if (fs.existsSync(path.join(dir, 'main.js'))) {
        return dir;
      }
    }

    return path.join(process.cwd(), 'backend', 'dist');
  }

  /** Premium bundle lives on a Docker volume; its externals resolve via panel node_modules. */
  private ensurePremiumModulePaths(distPath: string): void {
    const extra = [
      process.env.PREMIUM_NODE_PATH,
      path.join(path.dirname(distPath), 'node_modules'),
      path.join(process.cwd(), 'node_modules'),
      path.join(process.cwd(), 'backend', 'node_modules'),
      '/app/backend/node_modules',
      '/app/node_modules',
    ]
      .filter((v): v is string => Boolean(v?.trim()))
      .filter((p) => fs.existsSync(p));

    const current = (process.env.NODE_PATH || '')
      .split(path.delimiter)
      .map((p) => p.trim())
      .filter(Boolean);

    const merged = [...new Set([...extra, ...current])];
    process.env.NODE_PATH = merged.join(path.delimiter);
    this.logger.log(`NODE_PATH=${process.env.NODE_PATH}`);
  }

  private importBundle(pluginPath: string, distPath: string): Record<string, unknown> {
    const anchor = path.join(distPath, 'main.js');
    const req = createRequire(anchor);

    try {
      const resolved = req.resolve(pluginPath);
      delete req.cache[resolved];
    } catch {
      /* first load */
    }

    return req(pluginPath) as Record<string, unknown>;
  }

  async loadPremiumPlugins(): Promise<boolean> {
    const pluginPath =
      process.env.PREMIUM_PLUGIN_PATH ||
      path.join('/opt/hmpanel/premium', 'backend', 'index.js');

    if (!fs.existsSync(pluginPath)) {
      this.logger.log('No premium bundle installed — Community mode.');
      this.loaded = false;
      return false;
    }

    try {
      const state = await this.licenseManager.getLicenseState();
      if (
        state.mode === 'disabled' ||
        state.status === 'invalid' ||
        state.status === 'community'
      ) {
        this.logger.warn('Premium bundle on disk but license inactive — skipping load.');
        this.loaded = false;
        return false;
      }

      if (this.loaded && !this.lastLoadError) {
        return true;
      }

      const distPath = this.resolveHmpanelDist();
      process.env.HMPANEL_DIST = distPath;
      this.ensurePremiumModulePaths(distPath);
      this.logger.log(`HMPANEL_DIST=${distPath}`);

      this.lastLoadError = null;
      this.logger.log(`Loading premium bundle from ${pluginPath}`);

      const bundle = this.importBundle(pluginPath, distPath);

      const segments: Array<{ name: string; mod: unknown }> = [
        { name: 'core', mod: bundle.PremiumCoreBundleModule },
        { name: 'backup', mod: bundle.PremiumBackupBundleModule },
        { name: 'monitoring', mod: bundle.PremiumMonitoringBundleModule },
      ].filter((entry) => entry.mod);

      const errors: string[] = [];
      let anyLoaded = false;

      if (segments.length > 0) {
        for (const { name, mod } of segments) {
          try {
            await this.lazyModuleLoader.load(() => mod as never);
            anyLoaded = true;
            this.logger.log(`Premium ${name} module loaded.`);
          } catch (segmentError: any) {
            const message = segmentError?.message || String(segmentError);
            errors.push(`${name}: ${message}`);
            this.logger.error(`Premium ${name} module failed: ${message}`, segmentError?.stack);
          }
        }
      } else {
        const PremiumBundleModule = bundle.PremiumBundleModule || bundle.default;
        if (!PremiumBundleModule) {
          throw new Error('Bundle does not export PremiumBundleModule.');
        }
        await this.lazyModuleLoader.load(() => PremiumBundleModule as never);
        anyLoaded = true;
      }

      if (!anyLoaded) {
        this.lastLoadError = errors.join('; ') || 'No premium modules loaded';
        this.loaded = false;
        return false;
      }

      this.loaded = true;
      this.lastLoadError = errors.length ? errors.join('; ') : null;
      if (errors.length) {
        this.logger.warn(`Premium bundle partially loaded: ${this.lastLoadError}`);
      } else {
        this.logger.log('Premium bundle loaded.');
      }
      return true;
    } catch (error: any) {
      this.lastLoadError = error?.message || String(error);
      this.logger.error(`Failed to load premium bundle: ${this.lastLoadError}`, error?.stack);
      this.loaded = false;
      return false;
    }
  }
}
