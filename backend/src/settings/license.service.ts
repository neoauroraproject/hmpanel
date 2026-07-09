import { Injectable } from '@nestjs/common';
import { FeatureManagerService } from '../platform/feature-manager.service';

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
  constructor(private featureManager: FeatureManagerService) {}

  async hasFeature(feature: PremiumFeature): Promise<boolean> {
    return this.featureManager.isFeatureEnabled(feature);
  }

  async getActiveFeatures(): Promise<Record<PremiumFeature, boolean>> {
    const features = await this.featureManager.getActiveFeatures();
    const result = {} as Record<PremiumFeature, boolean>;
    for (const f of PREMIUM_FEATURES) {
      result[f] = !!features[f];
    }
    return result;
  }
}
