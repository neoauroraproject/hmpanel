import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import type { LicenseState } from './types/module-manifest.types';
import { getAllFeatureIds } from './manifests';
import { PremiumBundleService } from './premium-bundle.service';
import { InstanceFingerprintService } from './instance-fingerprint.service';
import { requestLicenseServer } from './license-server.client';

const GRACE_DAYS = 7;
const LICENSE_STATE_KEY = 'LICENSE_STATE';
const LICENSE_KEY_KEY = 'LICENSE_KEY';
const LICENSE_ENTITLEMENT_KEY = 'LICENSE_ENTITLEMENT_JWT';

@Injectable()
export class LicenseManagerService {
  private readonly logger = new Logger(LicenseManagerService.name);

  constructor(
    private settingsService: SettingsService,
    private bundleService: PremiumBundleService,
    private instanceFingerprint: InstanceFingerprintService,
  ) {}

  async getLicenseState(): Promise<LicenseState> {
    const edition =
      (process.env.RELEASE_MODE || 'COMMUNITY').toUpperCase() === 'COMMUNITY'
        ? 'COMMUNITY'
        : 'PREMIUM';

    const storedState = await this.settingsService.getSetting(LICENSE_STATE_KEY);
    if (storedState) {
      try {
        const parsed = JSON.parse(storedState) as LicenseState;
        return this.applyExpiry({ ...parsed, edition: parsed.edition || 'PREMIUM' });
      } catch {
        /* fall through */
      }
    }

    const licenseKey = await this.settingsService.getSetting(LICENSE_KEY_KEY);
    const jwt = await this.settingsService.getSetting(LICENSE_ENTITLEMENT_KEY);

    if (licenseKey && jwt) {
      return this.validateFromJwt(jwt, licenseKey);
    }

    if (edition === 'COMMUNITY' && !this.bundleService.isBundleInstalled()) {
      return this.communityDisabled();
    }

    if (!licenseKey || !jwt) {
      return edition === 'COMMUNITY' ? this.communityDisabled() : this.invalidState();
    }

    return this.validateFromJwt(jwt, licenseKey);
  }

  async isFeatureLicensed(featureId: string): Promise<boolean> {
    const state = await this.getLicenseState();
    if (state.edition === 'COMMUNITY' || state.status === 'invalid') {
      return false;
    }
    if (state.mode === 'disabled') return false;
    if (state.licensedFeatures.length === 0) {
      return state.status === 'active' || state.status === 'grace' || state.status === 'expired';
    }
    return state.licensedFeatures.includes(featureId);
  }

  async setLicenseState(state: Omit<LicenseState, 'edition'> & { edition?: 'COMMUNITY' | 'PREMIUM' }): Promise<void> {
    await this.settingsService.setSetting(
      LICENSE_STATE_KEY,
      JSON.stringify({ ...state, edition: state.edition || 'PREMIUM' }),
    );
  }

  async refreshFromServer(): Promise<LicenseState> {
    const licenseKey = await this.settingsService.getSetting(LICENSE_KEY_KEY);
    if (!licenseKey) return this.getLicenseState();

    const { res, data } = await requestLicenseServer('/v1/panel/heartbeat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        licenseKey,
        instanceId: this.instanceFingerprint.getInstanceId(),
      }),
    });
    const now = new Date().toISOString();
    const stored = await this.getStoredState();

    if (!res.ok || data.ok === false) {
      const next: LicenseState = {
        ...(stored || this.invalidState()),
        status: data.mode === 'disabled' ? 'invalid' : stored?.status || 'active',
        mode: data.mode === 'disabled' ? 'disabled' : stored?.mode || 'full',
        lastServerCheckAt: now,
        edition: 'PREMIUM',
      };
      if (data.mode === 'disabled') {
        next.status = 'invalid';
        next.mode = 'disabled';
        next.licensedFeatures = [];
      }
      await this.setLicenseState(next);
      return this.getLicenseState();
    }

    const expiresAt =
      typeof data.expiresAt === 'string'
        ? data.expiresAt
        : stored?.expiresAt ?? null;

    const next: LicenseState = {
      ...(stored || {
        status: 'active',
        mode: 'full',
        expiresAt,
        graceEndsAt: null,
        licensedFeatures: getAllFeatureIds(),
      }),
      status: 'active',
      mode: data.mode === 'read_only' ? 'read_only' : 'full',
      expiresAt,
      lastHeartbeatAt: now,
      lastServerCheckAt: now,
      edition: 'PREMIUM',
    };
    await this.setLicenseState(next);
    return this.applyExpiry(next);
  }

  async markServerUnreachable(): Promise<void> {
    const stored = await this.getStoredState();
    if (!stored) return;
    const now = new Date().toISOString();
    // Offline license server must not disable premium — bundle runs locally; only record last check.
    await this.setLicenseState({
      ...stored,
      lastServerCheckAt: now,
    });
  }

  private async getStoredState(): Promise<LicenseState | null> {
    const raw = await this.settingsService.getSetting(LICENSE_STATE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as LicenseState;
    } catch {
      return null;
    }
  }

  private communityDisabled(): LicenseState {
    return {
      status: 'community',
      mode: 'disabled',
      expiresAt: null,
      graceEndsAt: null,
      licensedFeatures: [],
      edition: 'COMMUNITY',
    };
  }

  private invalidState(): LicenseState {
    return {
      status: 'invalid',
      mode: 'disabled',
      expiresAt: null,
      graceEndsAt: null,
      licensedFeatures: [],
      edition: 'PREMIUM',
    };
  }

  private applyExpiry(state: LicenseState): LicenseState {
    if (state.edition === 'COMMUNITY' && state.status === 'community') {
      return state;
    }

    if (state.mode === 'disabled' || state.status === 'invalid') {
      return { ...state, mode: 'disabled', licensedFeatures: [] };
    }

    // Local JWT + stored state drive premium while offline; server is only for validity checks.

    if (!state.expiresAt) {
      return { ...state, status: state.status === 'grace' ? 'grace' : 'active', mode: state.mode === 'read_only' ? 'read_only' : 'full' };
    }

    const now = Date.now();
    const expiresAt = new Date(state.expiresAt).getTime();
    const graceEndsAt = state.graceEndsAt
      ? new Date(state.graceEndsAt).getTime()
      : expiresAt + GRACE_DAYS * 86_400_000;

    if (now <= expiresAt) {
      return { ...state, status: 'active', mode: 'full' };
    }
    if (now <= graceEndsAt) {
      return {
        ...state,
        status: 'grace',
        mode: 'read_only',
        graceEndsAt: new Date(graceEndsAt).toISOString(),
      };
    }
    return {
      ...state,
      status: 'expired',
      mode: 'disabled',
      licensedFeatures: [],
      graceEndsAt: new Date(graceEndsAt).toISOString(),
    };
  }

  private async validateFromJwt(jwt: string, licenseKey: string): Promise<LicenseState> {
    const payload = this.decodeJwtPayload(jwt);
    if (!payload) return this.invalidState();

    const instanceId = this.instanceFingerprint.getInstanceId();
    if (payload.instanceId && payload.instanceId !== instanceId) {
      this.logger.warn('JWT instanceId mismatch');
      return this.invalidState();
    }

    const exp = payload.exp as number | undefined;
    if (exp && exp * 1000 < Date.now()) {
      return {
        status: 'expired',
        mode: 'disabled',
        expiresAt: new Date(exp * 1000).toISOString(),
        graceEndsAt: null,
        licensedFeatures: [],
        edition: 'PREMIUM',
      };
    }

    const stored = await this.getStoredState();
    const jwtFeatures = this.normalizeLicensedFeatures(payload.features as string[] | undefined);
    return this.applyExpiry({
      status: 'active',
      mode: 'full',
      expiresAt: payload.exp ? new Date((payload.exp as number) * 1000).toISOString() : stored?.expiresAt ?? null,
      graceEndsAt: null,
      licensedFeatures: jwtFeatures,
      edition: 'PREMIUM',
      activationId: (payload.activationId as string) || stored?.activationId,
      instanceId,
      bundleVersion: stored?.bundleVersion,
      lastHeartbeatAt: stored?.lastHeartbeatAt,
      lastServerCheckAt: stored?.lastServerCheckAt,
    });
  }

  private normalizeLicensedFeatures(features?: string[]): string[] {
    if (!features?.length) return getAllFeatureIds();
    const moduleSlugs = new Set([
      'monitoring',
      'monitoring-pro',
      'backup-center',
      'store',
      'branding',
      'client-templates',
      'custom-domains',
      'premium-modules',
    ]);
    if (features.some((f) => moduleSlugs.has(f))) return getAllFeatureIds();
    return features;
  }

  private decodeJwtPayload(token: string): Record<string, unknown> | null {
    try {
      const parts = token.split('.');
      if (parts.length < 2) return null;
      const json = Buffer.from(parts[1].replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
      return JSON.parse(json);
    } catch {
      return null;
    }
  }
}
