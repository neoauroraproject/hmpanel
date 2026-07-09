import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LicenseManagerService } from './license-manager.service';
import { getAllFeatureIds, getManifest, MODULE_MANIFESTS } from './manifests';
import type { ModuleAccess } from './types/module-manifest.types';

@Injectable()
export class FeatureManagerService {
  constructor(
    private licenseManager: LicenseManagerService,
    private prisma: PrismaService,
  ) {}

  async isEnabled(moduleId: string): Promise<boolean> {
    const access = await this.getModuleAccess(moduleId);
    return access.enabled && access.canRead;
  }

  async canWrite(moduleId: string): Promise<boolean> {
    const access = await this.getModuleAccess(moduleId);
    return access.enabled && access.canWrite;
  }

  async isOperational(moduleId: string): Promise<boolean> {
    return this.canWrite(moduleId);
  }

  async isFeatureEnabled(featureId: string): Promise<boolean> {
    const licensed = await this.licenseManager.isFeatureLicensed(featureId);
    if (!licensed) return false;

    const manifest = MODULE_MANIFESTS.find((m) => m.features.includes(featureId));
    if (!manifest) return licensed;

    try {
      const state = await this.prisma.premiumModuleState.findUnique({
        where: { moduleId: manifest.id },
      });
      return state?.enabled ?? manifest.defaultEnabled;
    } catch {
      return false;
    }
  }

  async getModuleAccess(moduleId: string): Promise<ModuleAccess> {
    const manifest = getManifest(moduleId);
    if (!manifest) {
      return {
        moduleId,
        enabled: false,
        licensed: false,
        mode: 'disabled',
        canRead: false,
        canWrite: false,
      };
    }

    const license = await this.licenseManager.getLicenseState();
    if (license.edition === 'COMMUNITY' || license.status === 'community') {
      return {
        moduleId,
        enabled: false,
        licensed: false,
        mode: 'disabled',
        canRead: false,
        canWrite: false,
      };
    }

    const allFeatures = getAllFeatureIds();
    const featureLicensed =
      license.status !== 'invalid' &&
      (manifest.features.length === 0 ||
        license.licensedFeatures.length === 0 ||
        license.licensedFeatures.length >= allFeatures.length ||
        manifest.features.every((f) => license.licensedFeatures.includes(f)));

    const state = await this.safeModuleState(moduleId);
    const moduleEnabled = state?.enabled ?? manifest.defaultEnabled;

    const enabled = featureLicensed && moduleEnabled && license.status !== 'invalid';
    const mode = !enabled ? 'disabled' : license.mode;
    const canRead = enabled || (moduleEnabled && license.mode === 'read_only' && license.status !== 'invalid');
    const canWrite = enabled && license.mode === 'full';

    return {
      moduleId,
      enabled: moduleEnabled && featureLicensed && license.status !== 'invalid',
      licensed: featureLicensed,
      mode: canWrite ? 'full' : canRead ? license.mode : 'disabled',
      canRead: !!canRead,
      canWrite: !!canWrite,
    };
  }

  async getActiveFeatures(): Promise<Record<string, boolean>> {
    const result: Record<string, boolean> = {};
    for (const manifest of MODULE_MANIFESTS) {
      for (const feature of manifest.features) {
        result[feature] = await this.isFeatureEnabled(feature);
      }
    }
    return result;
  }

  async assertWrite(moduleId: string): Promise<void> {
    if (!(await this.canWrite(moduleId))) {
      const access = await this.getModuleAccess(moduleId);
      if (access.enabled && access.mode === 'read_only') {
        throw new Error(`Module "${moduleId}" is in read-only mode`);
      }
      throw new Error(`Module "${moduleId}" is not enabled`);
    }
  }

  private async safeModuleState(moduleId: string) {
    try {
      return await this.prisma.premiumModuleState.findUnique({
        where: { moduleId },
      });
    } catch {
      return null;
    }
  }
}
