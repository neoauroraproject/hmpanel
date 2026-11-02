import { Injectable, Logger } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import type { LicenseState } from './types/module-manifest.types';
import { getModulesForFeature } from './manifests';
import { PremiumBundleService } from './premium-bundle.service';
import { InstanceFingerprintService } from './instance-fingerprint.service';
import { requestLicenseServer } from './license-server.client';
import {
  hydrateLicensedModules,
  licensedModuleSet,
  normalizeToModuleIds,
  resolveEntitlement,
} from './license-entitlement.util';
import {
  UNLIMITED_LEASE_EXP,
  leaseExpiresAtIso,
  verifyEntitlementLease,
  type PanelEntitlementLease,
} from './license-lease.util';

const GRACE_DAYS = 7;
const LICENSE_STATE_KEY = 'LICENSE_STATE';
const LICENSE_KEY_KEY = 'LICENSE_KEY';
const LICENSE_ENTITLEMENT_KEY = 'LICENSE_ENTITLEMENT_JWT';
export const LICENSE_LEASE_KEY = 'LICENSE_ENTITLEMENT_LEASE';

/**
 * Premium is decided by the Ed25519 entitlement lease from the license server, verified
 * with the embedded public key on every read. Expiry, modules and plan come only from that
 * lease; `LICENSE_STATE` can only narrow it (a server-side disable), never widen it.
 */
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
    if (storedState?.status === 'community') return storedState;

    const licenseKey = await this.settingsService.getSetting(LICENSE_KEY_KEY);
    if (!storedState && !licenseKey) {
      return edition === 'COMMUNITY' ? this.communityDisabled() : this.invalidState();
    }

    const lease = await this.getVerifiedLease();
    if (!lease) return this.unsignedState(storedState);

    const applied = this.applyLeaseExpiry(this.stateFromLease(lease, storedState), lease);
    if (storedState) await this.persistExpiryTransition(storedState, applied);
    return applied;
  }

  /** True when a lease signed by the license server for this instance is stored. */
  async hasVerifiedLease(): Promise<boolean> {
    return (await this.getVerifiedLease()) !== null;
  }

  /** Persists the tokens of an activate/heartbeat reply. A reply without a lease keeps the stored one. */
  async storeServerTokens(data: Record<string, unknown>): Promise<void> {
    if (typeof data.entitlementJwt === 'string' && data.entitlementJwt) {
      await this.settingsService.setSetting(LICENSE_ENTITLEMENT_KEY, data.entitlementJwt);
    }
    if (typeof data.entitlementLease === 'string' && data.entitlementLease) {
      if (!verifyEntitlementLease(data.entitlementLease)) {
        this.logger.warn('License server sent an entitlement lease that does not verify — ignored');
        return;
      }
      await this.settingsService.setSetting(LICENSE_LEASE_KEY, data.entitlementLease);
    }
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
        lastServerCheckAt: now,
        edition: 'PREMIUM',
      };
      if (data.mode === 'disabled') {
        // Revoked, expired or outdated: drop the lease too, so restoring an old
        // LICENSE_STATE cannot bring Premium back.
        await this.settingsService.setSetting(LICENSE_LEASE_KEY, '');
        next.status = 'invalid';
        next.mode = 'disabled';
        next.invalidReason = typeof data.reason === 'string' ? data.reason : 'disabled';
        next.licensedFeatures = [];
        next.licensedModules = [];
        next.legacyFull = false;
      }
      await this.setLicenseState(next);
      return this.getLicenseState();
    }

    await this.storeServerTokens(data);

    const stored = (await this.getStoredState()) ?? this.invalidState();
    const entitlement = resolveEntitlement({
      features: data.features,
      entitlements: data.entitlements,
      entitlementMode: data.entitlementMode,
      legacyFull: data.legacyFull,
    });

    await this.setLicenseState({
      ...stored,
      status: 'active',
      mode: 'full',
      invalidReason: null,
      expiresAt: typeof data.expiresAt === 'string' ? data.expiresAt : null,
      lastHeartbeatAt: now,
      lastServerCheckAt: now,
      edition: 'PREMIUM',
      // Informational only — getLicenseState takes modules from the signed lease.
      ...(entitlement.present
        ? {
            licensedModules: entitlement.licensedModules,
            licensedFeatures: entitlement.licensedModules,
            legacyFull: entitlement.legacyFull,
            licensePlan: entitlement.plan,
          }
        : {}),
    });
    return this.getLicenseState();
  }

  async markServerUnreachable(): Promise<void> {
    const stored = await this.getStoredState();
    if (!stored) return;
    const now = new Date().toISOString();
    // Offline license server must not disable premium — the signed lease keeps working.
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

  private async getVerifiedLease(): Promise<PanelEntitlementLease | null> {
    const raw = await this.settingsService.getSetting(LICENSE_LEASE_KEY);
    if (!raw) return null;
    const lease = verifyEntitlementLease(raw);
    if (!lease) {
      this.logger.warn('Stored entitlement lease failed signature verification');
      return null;
    }
    if (lease.inst !== this.instanceFingerprint.getInstanceId()) {
      this.logger.warn('Entitlement lease was issued to another panel instance');
      return null;
    }
    return lease;
  }

  /**
   * Builds the state the lease grants. The stored state contributes only bookkeeping
   * (bundle version, timestamps) and a server-side disable.
   */
  private stateFromLease(lease: PanelEntitlementLease, stored: LicenseState | null): LicenseState {
    const entitlement = resolveEntitlement({
      features: lease.features,
      legacyFull: lease.legacyFull,
      plan: lease.planSlug,
    });
    const state: LicenseState = {
      ...(stored ?? {}),
      status: 'active',
      mode: 'full',
      expiresAt: leaseExpiresAtIso(lease),
      graceEndsAt: null,
      licensedFeatures: entitlement.licensedModules,
      licensedModules: entitlement.licensedModules,
      legacyFull: entitlement.legacyFull,
      licensePlan: entitlement.plan,
      edition: 'PREMIUM',
      activationId: lease.act || stored?.activationId || null,
      instanceId: lease.inst,
      invalidReason: null,
    };

    const serverDisabled =
      stored?.status === 'invalid' && stored.invalidReason !== 'unsigned';
    return serverDisabled
      ? this.revoked(state, {
          status: 'invalid',
          mode: 'disabled',
          invalidReason: stored?.invalidReason ?? null,
        })
      : state;
  }

  private unsignedState(stored: LicenseState | null): LicenseState {
    return this.revoked(
      { ...(stored ?? this.invalidState()), edition: 'PREMIUM', graceEndsAt: null },
      { status: 'invalid', mode: 'disabled', invalidReason: 'unsigned' },
    );
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

  /** Expiry and grace are computed from the signed `exp` alone. */
  private applyLeaseExpiry(state: LicenseState, lease: PanelEntitlementLease): LicenseState {
    if (state.mode === 'disabled' || state.status === 'invalid') {
      return this.revoked(state, { mode: 'disabled' });
    }
    if (lease.exp >= UNLIMITED_LEASE_EXP) {
      return { ...state, status: 'active', mode: 'full' };
    }

    const now = Date.now();
    const expiresAt = lease.exp * 1000;
    const graceEndsAt = expiresAt + GRACE_DAYS * 86_400_000;

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

  /** Persist grace/expired transitions so restart still sees cut-off until online recheck. */
  private async persistExpiryTransition(
    stored: LicenseState,
    applied: LicenseState,
  ): Promise<void> {
    const becameTerminal =
      (applied.status === 'expired' || applied.status === 'grace') &&
      applied.status !== stored.status;
    if (!becameTerminal) return;
    try {
      await this.setLicenseState(applied);
    } catch (err: any) {
      this.logger.warn(`persistExpiryTransition failed: ${err?.message || err}`);
    }
  }
}
