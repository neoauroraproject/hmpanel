import {
  Injectable,
  Logger,
  forwardRef,
  Inject,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import * as fs from 'fs';
import { SettingsService } from '../settings/settings.service';
import { InstanceFingerprintService } from './instance-fingerprint.service';
import { PremiumBundleService } from './premium-bundle.service';
import { LicenseManagerService } from './license-manager.service';
import { PluginsService } from '../plugins/plugins.service';
import type { LicenseState } from './types/module-manifest.types';
import { getAllFeatureIds } from './manifests';
import { getPanelVersion } from '../common/utils/panel-version.util';
import {
  getLicenseServerUrls,
  getPrimaryLicenseServerUrl,
  requestLicenseServer,
} from './license-server.client';

const LICENSE_KEY_KEY = 'LICENSE_KEY';
const LICENSE_ENTITLEMENT_KEY = 'LICENSE_ENTITLEMENT_JWT';
const LICENSE_ACTIVATION_ID_KEY = 'LICENSE_ACTIVATION_ID';

export interface ActivationProgress {
  stage: string;
  percent: number;
  message?: string;
}

export interface ActivateResult {
  ok: boolean;
  state: LicenseState;
  bundleVersion?: string;
  needsReload?: boolean;
  needsRestart?: boolean;
  /** Backend process will exit shortly; Docker start.sh restarts it automatically. */
  autoRestart?: boolean;
  bundleSkipped?: boolean;
  licenseServerUrl?: string;
  message?: string;
}

@Injectable()
export class LicenseActivationService {
  private readonly logger = new Logger(LicenseActivationService.name);

  constructor(
    private settingsService: SettingsService,
    private instanceFingerprint: InstanceFingerprintService,
    private bundleService: PremiumBundleService,
    private licenseManager: LicenseManagerService,
    @Inject(forwardRef(() => PluginsService))
    private pluginsService: PluginsService,
  ) {}

  getLicenseServerUrl(): string {
    return getPrimaryLicenseServerUrl();
  }

  getLicenseServerUrls(): string[] {
    return getLicenseServerUrls();
  }

  async getClientIp(): Promise<string> {
    try {
      const res = await fetch('https://api.ipify.org?format=json', {
        signal: AbortSignal.timeout(5000),
      });
      if (res.ok) {
        const data = (await res.json()) as { ip: string };
        return data.ip;
      }
    } catch {
      /* fall through */
    }
    return process.env.LICENSE_CLIENT_IP || '127.0.0.1';
  }

  async activate(
    licenseKey: string,
    onProgress?: (p: ActivationProgress) => void,
  ): Promise<ActivateResult> {
    try {
      return await this.activateInternal(licenseKey, onProgress);
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      const message = err?.message || 'License activation failed';
      this.logger.error(`Activation failed: ${message}`, err?.stack);
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  private async activateInternal(
    licenseKey: string,
    onProgress?: (p: ActivationProgress) => void,
  ): Promise<ActivateResult> {
    const instanceId = this.instanceFingerprint.getInstanceId();
    const clientIp = await this.getClientIp();
    const panelVersion = getPanelVersion();

    onProgress?.({ stage: 'activating', percent: 10, message: 'Contacting license server...' });

    const { res, data, usedUrl } = await requestLicenseServer('/v1/panel/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseKey,
        instanceId,
        clientIp,
        panelVersion,
        productSlug: process.env.LICENSE_PRODUCT_ID || 'hmpanel',
      }),
    });

    if (!res.ok) {
      const message =
        (typeof data.error === 'string' && data.error) ||
        (typeof data.message === 'string' && data.message) ||
        `Activation failed (${res.status})`;
      const status =
        res.status === 401
          ? HttpStatus.UNAUTHORIZED
          : res.status === 403
            ? HttpStatus.FORBIDDEN
            : res.status === 400
              ? HttpStatus.BAD_REQUEST
              : res.status >= 500
                ? HttpStatus.BAD_GATEWAY
                : HttpStatus.BAD_REQUEST;
      throw new HttpException(message, status);
    }

    if (!data.entitlementJwt || typeof data.entitlementJwt !== 'string') {
      throw new HttpException(
        'License server response missing entitlement token',
        HttpStatus.BAD_GATEWAY,
      );
    }

    await this.settingsService.setSetting(LICENSE_KEY_KEY, licenseKey.trim());
    await this.settingsService.setSetting(LICENSE_ENTITLEMENT_KEY, data.entitlementJwt as string);
    if (data.activationId) {
      await this.settingsService.setSetting(LICENSE_ACTIVATION_ID_KEY, String(data.activationId));
    }

    const now = new Date().toISOString();
    const license = data.license as { expiresAt?: string | null } | undefined;
    const bundle = data.bundle as {
      version?: string;
      downloadUrl?: string;
      sha256?: string | null;
    } | undefined;

    const baseState: LicenseState = {
      status: 'active',
      mode: 'full',
      expiresAt: license?.expiresAt ?? null,
      graceEndsAt: null,
      licensedFeatures: getAllFeatureIds(),
      edition: 'PREMIUM',
      lastHeartbeatAt: now,
      lastServerCheckAt: now,
      bundleVersion: bundle?.version ?? null,
      activationId: data.activationId ? String(data.activationId) : null,
      instanceId,
    };
    await this.licenseManager.setLicenseState(baseState);

    let bundleSkipped = false;
    const targetVersion = bundle?.version;
    const installedVersion = this.bundleService.getInstalledVersion();

    if (
      targetVersion &&
      installedVersion &&
      this.bundleService.isBundleInstalled() &&
      installedVersion === targetVersion
    ) {
      bundleSkipped = true;
      onProgress?.({ stage: 'bundle', percent: 90, message: 'Premium bundle already installed.' });
    } else if (targetVersion) {
      onProgress?.({ stage: 'downloading', percent: 25, message: 'Downloading premium bundle...' });
      const downloadUrl = await this.resolveBundleDownloadUrl(licenseKey, targetVersion, bundle);
      await this.bundleService.downloadAndInstall(
        downloadUrl,
        bundle?.sha256 ?? null,
        targetVersion,
        (pct, stage) =>
          onProgress?.({ stage, percent: 25 + Math.round(pct * 0.65), message: stage }),
      );
      await this.bundleService.applyDatabaseOverlay();
    }

    onProgress?.({ stage: 'loading', percent: 95, message: 'Loading premium modules...' });
    const loaded = await this.pluginsService.reloadPremiumPlugins();

    // Nest cannot unload/replace lazy-loaded modules — restart so the new bundle is used.
    if (!bundleSkipped) {
      this.scheduleBackendRestart('premium bundle installed');
    }

    onProgress?.({ stage: 'complete', percent: 100, message: 'Activation complete' });
    this.logger.log(`License activated via ${usedUrl}`);

    return {
      ok: true,
      state: await this.licenseManager.getLicenseState(),
      bundleVersion: bundle?.version,
      bundleSkipped,
      needsReload: true,
      needsRestart: !bundleSkipped || !loaded,
      autoRestart: !bundleSkipped,
      licenseServerUrl: usedUrl,
      message: bundleSkipped
        ? loaded
          ? 'Premium activated. Refresh the page to see premium sections.'
          : 'Premium files already installed. Restart the panel service, then refresh the page.'
        : 'Premium bundle installed. Backend is restarting to load new modules…',
    };
  }

  async updateBundle(): Promise<ActivateResult> {
    const licenseKey = await this.settingsService.getSetting(LICENSE_KEY_KEY);
    if (!licenseKey) {
      throw new HttpException('No active license', HttpStatus.BAD_REQUEST);
    }

    try {
      const state = await this.licenseManager.getLicenseState();
      const { res, data } = await this.requestBundleUrl(licenseKey);
      if (!res.ok) {
        const message =
          (typeof data.error === 'string' && data.error) ||
          `License server refused bundle URL (${res.status})`;
        throw new HttpException(message, HttpStatus.BAD_GATEWAY);
      }

      const bundleMeta = data.bundle as { version?: string; sha256?: string | null } | undefined;
      const version =
        bundleMeta?.version || state.bundleVersion || '1.5.6';
      const downloadUrl =
        typeof data.downloadUrl === 'string'
          ? data.downloadUrl
          : await this.resolveBundleDownloadUrl(licenseKey, version);

      await this.bundleService.downloadAndInstall(
        downloadUrl,
        bundleMeta?.sha256 ?? null,
        version,
      );
      await this.bundleService.applyDatabaseOverlay();

      await this.licenseManager.setLicenseState({
        ...state,
        bundleVersion: version,
      });

      // Nest LazyModuleLoader cannot replace already-loaded premium modules in memory.
      // Exit so Docker start.sh restarts the backend and loads the new bundle cleanly.
      this.scheduleBackendRestart(`premium bundle updated to ${version}`);

      return {
        ok: true,
        state: await this.licenseManager.getLicenseState(),
        bundleVersion: version,
        needsReload: true,
        needsRestart: true,
        autoRestart: true,
        message: `Premium bundle ${version} installed. Backend is restarting to load new modules…`,
      };
    } catch (err: any) {
      if (err instanceof HttpException) throw err;
      const message = err?.message || 'Premium bundle update failed';
      this.logger.error(`Bundle update failed: ${message}`, err?.stack);
      throw new HttpException(message, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * Nest cannot unload lazy-loaded premium modules. After files on disk change,
   * exit the Node process; Docker start.sh restarts backend automatically.
   */
  private scheduleBackendRestart(reason: string) {
    const delayMs = Number(process.env.PREMIUM_RESTART_DELAY_MS || 1500);
    this.logger.warn(
      `Scheduling backend restart in ${delayMs}ms (${reason}). Nest cannot hot-reload premium modules.`,
    );
    setTimeout(() => {
      this.logger.warn('Exiting process for premium module reload…');
      process.exit(0);
    }, delayMs);
  }

  private async resolveBundleDownloadUrl(
    licenseKey: string,
    version: string,
    bundle?: {
      downloadUrl?: string;
    },
  ): Promise<string> {
    if (bundle?.downloadUrl?.includes('/v1/panel/bundle/download')) {
      return bundle.downloadUrl;
    }

    let { res, data } = await this.requestBundleUrl(licenseKey, version);

    if (!res.ok && this.isActivationMismatch(data, res.status)) {
      this.logger.warn(
        'License server has no activation for this panel instance — re-registering…',
      );
      await this.reregisterWithLicenseServer(licenseKey);
      ({ res, data } = await this.requestBundleUrl(licenseKey, version));
    }

    if (!res.ok) {
      const message =
        (typeof data.error === 'string' && data.error) ||
        `License server refused bundle URL (${res.status})`;
      throw new HttpException(message, HttpStatus.BAD_GATEWAY);
    }

    if (typeof data.downloadUrl === 'string' && data.downloadUrl.includes('/v1/panel/bundle/download')) {
      return data.downloadUrl;
    }

    throw new HttpException(
      'License server did not return a secure bundle download URL. Deploy license worker with GITHUB_TOKEN.',
      HttpStatus.BAD_GATEWAY,
    );
  }

  private async requestBundleUrl(licenseKey: string, version?: string) {
    const instanceId = this.instanceFingerprint.getInstanceId();
    const clientIp = await this.getClientIp();
    return requestLicenseServer('/v1/panel/bundle-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseKey,
        instanceId,
        clientIp,
        ...(version ? { version } : {}),
      }),
    });
  }

  private isActivationMismatch(data: Record<string, unknown>, status: number): boolean {
    if (status !== 403) return false;
    const err = typeof data.error === 'string' ? data.error : '';
    return (
      err.includes('No active activation') ||
      err.includes('Instance mismatch') ||
      err.includes('No active activation for this instance')
    );
  }

  /** Re-bind this panel instance on the license server (e.g. after container recreate). */
  private async reregisterWithLicenseServer(licenseKey: string): Promise<void> {
    const instanceId = this.instanceFingerprint.getInstanceId();
    const clientIp = await this.getClientIp();
    const panelVersion = getPanelVersion();

    const { res, data } = await requestLicenseServer('/v1/panel/activate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseKey,
        instanceId,
        clientIp,
        panelVersion,
        productSlug: process.env.LICENSE_PRODUCT_ID || 'hmpanel',
      }),
    });

    if (!res.ok) {
      const message =
        (typeof data.error === 'string' && data.error) ||
        `Could not re-register panel with license server (${res.status})`;
      throw new HttpException(message, HttpStatus.BAD_GATEWAY);
    }

    if (typeof data.entitlementJwt === 'string') {
      await this.settingsService.setSetting(LICENSE_ENTITLEMENT_KEY, data.entitlementJwt);
    }
    if (data.activationId) {
      await this.settingsService.setSetting(LICENSE_ACTIVATION_ID_KEY, String(data.activationId));
    }

    const license = data.license as { expiresAt?: string | null } | undefined;
    const bundle = data.bundle as { version?: string | null } | undefined;
    const now = new Date().toISOString();
    const stored = await this.licenseManager.getLicenseState();

    await this.licenseManager.setLicenseState({
      ...stored,
      status: 'active',
      mode: 'full',
      edition: 'PREMIUM',
      expiresAt: license?.expiresAt ?? stored.expiresAt,
      bundleVersion: bundle?.version ?? stored.bundleVersion,
      activationId: data.activationId ? String(data.activationId) : stored.activationId,
      instanceId,
      lastServerCheckAt: now,
      lastHeartbeatAt: now,
      licensedFeatures: getAllFeatureIds(),
    });

    this.logger.log(`Panel instance re-registered with license server (${instanceId})`);
  }

  async deactivate(): Promise<{ needsReload: boolean }> {
    const licenseKey = await this.settingsService.getSetting(LICENSE_KEY_KEY);
    const instanceId = this.instanceFingerprint.getInstanceId();

    if (licenseKey) {
      try {
        await requestLicenseServer('/v1/panel/deactivate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ licenseKey, instanceId }),
        });
      } catch (err: any) {
        this.logger.warn(`Remote deactivate failed: ${err.message}`);
      }
    }

    await this.settingsService.setSetting(LICENSE_KEY_KEY, '');
    await this.settingsService.setSetting(LICENSE_ENTITLEMENT_KEY, '');
    await this.settingsService.setSetting(LICENSE_ACTIVATION_ID_KEY, '');
    await this.licenseManager.setLicenseState({
      status: 'community',
      mode: 'disabled',
      expiresAt: null,
      graceEndsAt: null,
      licensedFeatures: [],
      edition: 'COMMUNITY',
    });

    this.logger.log(
      'License deactivated — premium modules hidden; database records and bundle on disk are preserved for reactivation.',
    );

    return { needsReload: true };
  }

  async getBundleStatus() {
    const distPath = this.pluginsService.resolveHmpanelDist();
    return {
      installed: this.bundleService.isBundleInstalled(),
      version: this.bundleService.getInstalledVersion(),
      path: this.bundleService.getPremiumRoot(),
      pluginsLoaded: this.pluginsService.isLoaded(),
      lastLoadError: this.pluginsService.getLastLoadError(),
      hmpanelDist: distPath,
    };
  }

  async reloadPlugins(): Promise<{
    loaded: boolean;
    hmpanelDist: string;
    lastLoadError: string | null;
    autoRestart?: boolean;
    message?: string;
  }> {
    const hmpanelDist = this.pluginsService.resolveHmpanelDist();
    process.env.HMPANEL_DIST = hmpanelDist;
    const loaded = await this.pluginsService.reloadPremiumPlugins();
    const lastLoadError = this.pluginsService.getLastLoadError();

    // Soft reload cannot replace modules already in memory — restart when anything failed
    // or when caller needs a clean load after a bundle file change.
    if (!loaded || lastLoadError) {
      this.scheduleBackendRestart(
        lastLoadError ? `reload failed: ${lastLoadError}` : 'reload incomplete',
      );
      return {
        loaded,
        hmpanelDist,
        lastLoadError,
        autoRestart: true,
        message:
          'Backend is restarting to load premium modules cleanly. The page will refresh when ready…',
      };
    }

    return {
      loaded,
      hmpanelDist,
      lastLoadError,
      message: 'Premium modules loaded',
    };
  }

  /** Step-by-step diagnostics for bundle download issues (SUPER_ADMIN). */
  async diagnoseBundle(): Promise<Record<string, unknown>> {
    const steps: Record<string, unknown>[] = [];
    const push = (step: string, ok: boolean, detail?: unknown) => {
      steps.push({ step, ok, detail });
    };

    const licenseKey = await this.settingsService.getSetting(LICENSE_KEY_KEY);
    push('license_key_stored', !!licenseKey, licenseKey ? 'present' : 'missing');

    const instanceId = this.instanceFingerprint.getInstanceId();
    push('instance_id', true, instanceId);

    let clientIp = 'unknown';
    try {
      clientIp = await this.getClientIp();
      push('public_ip', true, clientIp);
    } catch (e: any) {
      push('public_ip', false, e.message);
    }

    const root = this.bundleService.getPremiumRoot();
    push('premium_root', true, {
      path: root,
      exists: fs.existsSync(root),
      writable: this.bundleService.isPathWritable(root),
      pluginsLoaded: this.pluginsService.isLoaded(),
      hmpanelDist: this.pluginsService.resolveHmpanelDist(),
    });

    const workDir = this.bundleService.getWorkDirForDiagnostics();
    push('work_dir', this.bundleService.isPathWritable(workDir), workDir);

    if (!licenseKey) {
      return { ok: false, steps };
    }

    const state = await this.licenseManager.getLicenseState();
    const version = state.bundleVersion || '1.5.6';
    push('target_version', true, version);

    try {
      const { res, data, usedUrl } = await requestLicenseServer('/v1/panel/bundle-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ licenseKey, instanceId, version, clientIp }),
      });
      push('bundle_url_request', res.ok, {
        status: res.status,
        usedUrl,
        error: data.error,
        hasDownloadUrl: typeof data.downloadUrl === 'string',
      });

      if (res.ok && typeof data.downloadUrl === 'string') {
        const head = await fetch(data.downloadUrl, {
          method: 'GET',
          headers: { Range: 'bytes=0-0' },
          signal: AbortSignal.timeout(30_000),
        });
        push('bundle_download_probe', head.ok || head.status === 206, {
          status: head.status,
          statusText: head.statusText,
        });
      }
    } catch (e: any) {
      push('bundle_url_request', false, e.message);
    }

    const reloaded = await this.pluginsService.reloadPremiumPlugins();
    push('reload_plugins', reloaded, {
      hmpanelDist: this.pluginsService.resolveHmpanelDist(),
    });

    return { ok: steps.every((s) => s.ok !== false), steps };
  }

  async recheckNow(): Promise<LicenseState> {
    const state = await this.licenseManager.refreshFromServer();
    await this.pluginsService.syncWithLicenseState();
    return state;
  }
}
