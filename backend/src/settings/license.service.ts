import { Injectable } from '@nestjs/common';
import { SettingsService } from './settings.service';

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
  constructor(private settingsService: SettingsService) {}

  /**
   * Checks if a specific feature is enabled by the current license.
   * Currently, returns true for all features as per the user's requirement
   * until the actual license enforcement system is built.
   */
  async hasFeature(feature: PremiumFeature): Promise<boolean> {
    // In the future, this will check the 'LICENSE_KEY' from settings
    // const licenseKey = await this.settingsService.getSetting('LICENSE_KEY');
    // return verifyLicense(licenseKey, feature);

    return true; // All features are active for now
  }

  /**
   * Returns a map of all premium features and their active status.
   */
  async getActiveFeatures(): Promise<Record<PremiumFeature, boolean>> {
    const features = {} as Record<PremiumFeature, boolean>;
    for (const f of PREMIUM_FEATURES) {
      features[f] = true; // All true for now
    }
    return features;
  }
}
