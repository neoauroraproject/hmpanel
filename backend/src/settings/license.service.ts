import { Injectable } from '@nestjs/common';
import { LicenseManagerService } from '../platform/license-manager.service';

export const PREMIUM_FEATURES = [
  'CUSTOM_DOMAINS',
  'WHITE_LABEL',
  'CUSTOM_SUBSCRIPTION_PORTAL',
  'ADVANCED_ANALYTICS',
  'REMOTE_BACKUPS',
  'SMART_ALERTS',
  'XRAY_PRO',
] as const;

export type PremiumFeature = (typeof PREMIUM_FEATURES)[number];

@Injectable()
export class LicenseService {
  constructor(private licenseManager: LicenseManagerService) {}

  async hasFeature(feature: PremiumFeature): Promise<boolean> {
    return this.licenseManager.isFeatureLicensed(feature);
  }

  async getActiveFeatures(): Promise<Record<PremiumFeature, boolean>> {
    const result = {} as Record<PremiumFeature, boolean>;
    for (const f of PREMIUM_FEATURES) {
      result[f] = await this.licenseManager.isFeatureLicensed(f);
    }
    return result;
  }
}
