import { Injectable } from '@nestjs/common';
import { FeatureManagerService } from './feature-manager.service';
import { LicenseManagerService } from './license-manager.service';

/**
 * Single entitlement gate. Prefer `can('external-panels')` / `can('feature.WHITE_LABEL')`
 * over scattered `edition === 'PREMIUM'` checks in business logic.
 */
@Injectable()
export class FeatureEntitlementService {
  constructor(
    private features: FeatureManagerService,
    private license: LicenseManagerService,
  ) {}

  async can(key: string): Promise<boolean> {
    const id = key.replace(/^feature\./, '').trim();
    if (!id) return false;

    if (id === 'premium' || id === 'PREMIUM') {
      const state = await this.license.getLicenseState();
      return (
        state.edition === 'PREMIUM' &&
        state.mode !== 'disabled' &&
        (state.status === 'active' || state.status === 'grace')
      );
    }

    if (await this.features.isEnabled(id)) return true;
    if (await this.features.isFeatureEnabled(id)) return true;
    return this.features.isFeatureEnabled(id.toUpperCase());
  }
}
