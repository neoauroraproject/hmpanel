import {
  Injectable,
  Logger,
  forwardRef,
  Inject,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
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
      githubDownloadUrl?: string;
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
    } else if ((bundle?.downloadUrl || bundle?.githubDownloadUrl) && targetVersion) {
      onProgress?.({ stage: 'downloading', percent: 25, message: 'Downloading premium bundle...' });
      await this.bundleService.downloadAndInstall(
        (bundle.downloadUrl as string) || (bundle.githubDownloadUrl as string),
        bundle.sha256 ?? null,
        targetVersion,
        (pct, stage) =>
          onProgress?.({ stage, percent: 25 + Math.round(pct * 0.65), message: stage }),
      );
      await this.bundleService.applyDatabaseOverlay();
    }

    onProgress?.({ stage: 'loading', percent: 95, message: 'Loading premium modules...' });
    const loaded = await this.pluginsService.reloadPremiumPlugins();

    onProgress?.({ stage: 'complete', percent: 100, message: 'Activation complete' });
    this.logger.log(`License activated via ${usedUrl}`);

    return {
      ok: true,
      state: await this.licenseManager.getLicenseState(),
      bundleVersion: bundle?.version,
      bundleSkipped,
      needsReload: true,
      needsRestart: !loaded,
      licenseServerUrl: usedUrl,
      message: loaded
        ? 'Premium activated. Refresh the page to see premium sections.'
        : 'Premium files installed. Restart the panel service, then refresh the page.',
    };
  }

  async updateBundle(): Promise<ActivateResult> {
    const licenseKey = await this.settingsService.getSetting(LICENSE_KEY_KEY);
    if (!licenseKey) {
      throw new Error('No active license');
    }
    return this.activate(licenseKey);
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

    return { needsReload: true };
  }

  async getBundleStatus() {
    return {
      installed: this.bundleService.isBundleInstalled(),
      version: this.bundleService.getInstalledVersion(),
      path: this.bundleService.getPremiumRoot(),
      pluginsLoaded: this.pluginsService.isLoaded(),
    };
  }

  async recheckNow(): Promise<LicenseState> {
    return this.licenseManager.refreshFromServer();
  }
}
