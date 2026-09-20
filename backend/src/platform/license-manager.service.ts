import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import type { LicenseState } from './types/module-manifest.types';
import { getModulesForFeature } from './manifests';
import { PremiumBundleService } from './premium-bundle.service';
import { InstanceFingerprintService } from './instance-fingerprint.service';
import { requestLicenseServer } from './license-server.client';
import {
  decodeJwtPayload,
  entitlementSourceFromResponse,
  hydrateLicensedModules,
  licensedModuleSet,
  normalizeToModuleIds,
  resolveEntitlement,
} from './license-entitlement.util';

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

    const storedState = await this.getStoredState();
    if (storedState) {
      return this.applyExpiry({ ...storedState, edition: storedState.edition || 'PREMIUM' });
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

  /** Licensed module ids for the current state — empty when nothing is licensed. */
  async getLicensedModuleIds(): Promise<string[]> {
    const state = await this.getLicenseState();
    if (!this.isLicenseUsable(state)) return [];
    return [...licensedModuleSet(state)];
  }

  async isModuleLicensed(moduleId: string): Promise<boolean> {
    const state = await this.getLicenseState();
    return this.stateLicensesModule(state, moduleId);
  }

  /**
   * Feature ids are resolved through the manifests: a feature is licensed when any module
   * that ships it is licensed. Module ids are accepted here too for call-site convenience.
   */
  async isFeatureLicensed(featureId: string): Promise<boolean> {
    const state = await this.getLicenseState();
    if (!this.isLicenseUsable(state)) return false;
    if (state.legacyFull) return true;

    const owners = getModulesForFeature(featureId);
    if (owners.length) {
      return owners.some((moduleId) => this.stateLicensesModule(state, moduleId));
    }
    return this.stateLicensesModule(state, featureId);
  }

  /**
   * Normalises a JWT `features` claim into licensed module ids. An empty or missing claim
   * licenses nothing — full access requires an explicit signal (see resolveEntitlement).
   */
  normalizeLicensedFeatures(features?: string[] | null): string[] {
    if (!features?.length) return [];
    return normalizeToModuleIds(features);
  }

  async setLicenseState(state: Omit<LicenseState, 'edition'> & { edition?: 'COMMUNITY' | 'PREMIUM' }): Promise<void> {
    const licensedModules = state.licensedModules ?? state.licensedFeatures ?? [];
    await this.settingsService.setSetting(
      LICENSE_STATE_KEY,
      JSON.stringify({
        ...state,
        edition: state.edition || 'PREMIUM',
        licensedModules,
        licensedFeatures: licensedModules,
        legacyFull: state.legacyFull === true,
      }),
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

    if (!res.ok || data.ok === false) {
      const stored = await this.getStoredState();
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
        next.licensedModules = [];
        next.legacyFull = false;
      }
      await this.setLicenseState(next);
      return this.getLicenseState();
    }

    // Heartbeat may hand out a refreshed token; keep it so offline restarts see new modules.
    if (typeof data.entitlementJwt === 'string' && data.entitlementJwt) {
      await this.settingsService.setSetting(LICENSE_ENTITLEMENT_KEY, data.entitlementJwt);
    }

    const stored = (await this.getStoredState()) ?? (await this.getLicenseState());
    const expiresAt =
      typeof data.expiresAt === 'string' ? data.expiresAt : stored?.expiresAt ?? null;
    const entitlement = resolveEntitlement(entitlementSourceFromResponse(data));

    const next: LicenseState = {
      ...stored,
      status: 'active',
      mode: data.mode === 'read_only' ? 'read_only' : 'full',
      expiresAt,
      lastHeartbeatAt: now,
      lastServerCheckAt: now,
      edition: 'PREMIUM',
      // A thin heartbeat carries no entitlement data — never downgrade or expand on it.
      ...(entitlement.present
        ? {
            licensedModules: entitlement.licensedModules,
            licensedFeatures: entitlement.licensedModules,
            legacyFull: entitlement.legacyFull,
            licensePlan: entitlement.plan,
          }
        : {}),
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

  private isLicenseUsable(state: LicenseState): boolean {
    if (state.edition === 'COMMUNITY') return false;
    if (state.status === 'invalid' || state.status === 'community') return false;
    return state.mode !== 'disabled';
  }

  private stateLicensesModule(state: LicenseState, moduleId: string): boolean {
    if (!this.isLicenseUsable(state)) return false;
    if (state.legacyFull) return true;
    return licensedModuleSet(state).has(moduleId);
  }

  private async getStoredState(): Promise<LicenseState | null> {
    const raw = await this.settingsService.getSetting(LICENSE_STATE_KEY);
    if (!raw) return null;
    try {
      return hydrateLicensedModules(JSON.parse(raw) as LicenseState);
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
      licensedModules: [],
      legacyFull: false,
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
      licensedModules: [],
      legacyFull: false,
      edition: 'PREMIUM',
    };
  }

  private revoked(state: LicenseState, patch: Partial<LicenseState>): LicenseState {
    return {
      ...state,
      ...patch,
      licensedFeatures: [],
      licensedModules: [],
      legacyFull: false,
    };
  }

  private applyExpiry(state: LicenseState): LicenseState {
    if (state.edition === 'COMMUNITY' && state.status === 'community') {
      return state;
    }

    if (state.mode === 'disabled' || state.status === 'invalid') {
      return this.revoked(state, { mode: 'disabled' });
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
    return this.revoked(state, {
      status: 'expired',
      mode: 'disabled',
      graceEndsAt: new Date(graceEndsAt).toISOString(),
    });
  }

  private async validateFromJwt(jwt: string, licenseKey: string): Promise<LicenseState> {
    const payload = decodeJwtPayload(jwt);
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
        licensedModules: [],
        legacyFull: false,
        edition: 'PREMIUM',
      };
    }

    const stored = await this.getStoredState();
    const entitlement = resolveEntitlement(entitlementSourceFromResponse({}, jwt));
    return this.applyExpiry({
      status: 'active',
      mode: 'full',
      expiresAt: payload.exp ? new Date((payload.exp as number) * 1000).toISOString() : stored?.expiresAt ?? null,
      graceEndsAt: null,
      licensedFeatures: entitlement.licensedModules,
      licensedModules: entitlement.licensedModules,
      legacyFull: entitlement.legacyFull,
      licensePlan: entitlement.plan,
      edition: 'PREMIUM',
      activationId: (payload.activationId as string) || stored?.activationId,
      instanceId,
      bundleVersion: stored?.bundleVersion,
      lastHeartbeatAt: stored?.lastHeartbeatAt,
      lastServerCheckAt: stored?.lastServerCheckAt,
    });
  }
}
