import { Injectable } from '@nestjs/common';
import { LicenseManagerService } from './license-manager.service';
import { MODULE_MANIFESTS } from './manifests';

/** Community-side premium module list when bundle API is unavailable. */
@Injectable()
export class PremiumCatalogService {
  constructor(private licenseManager: LicenseManagerService) {}

  async listForLicensedAdmin(role: string): Promise<
    Array<{
      id: string;
      name: string;
      description: string;
      kind: string;
      version: string;
      phase: number;
      enabled: boolean;
      frontendPath: string;
      settingsSchema: Record<string, unknown>;
      settings: Record<string, unknown>;
      status: 'healthy' | 'read_only' | 'disabled' | 'future';
    }>
  > {
    const license = await this.licenseManager.getLicenseState();
    const licensed =
      license.edition === 'PREMIUM' &&
      license.status !== 'community' &&
      license.status !== 'invalid' &&
      license.mode !== 'disabled';

    if (!licensed) return [];

    return MODULE_MANIFESTS.filter((m) => m.id !== 'job-center')
      .filter((m) => role === 'SUPER_ADMIN' || m.kind === 'BUSINESS')
      .map((m) => ({
        id: m.id,
        name: m.name,
        description: m.description,
        kind: m.kind,
        version: m.version,
        phase: m.phase,
        enabled: m.defaultEnabled || m.phase <= 3,
        frontendPath: m.routes.frontend,
        settingsSchema: {},
        settings: {},
        status: license.mode === 'read_only' ? ('read_only' as const) : ('healthy' as const),
      }))
      .filter((m) => m.enabled);
  }
}
