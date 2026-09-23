import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LicenseManagerService } from './license-manager.service';
import { FeatureEntitlementService } from './feature-entitlement.service';
import { FeatureManagerService } from './feature-manager.service';
import { MODULE_MANIFESTS } from './manifests';

/** Community-side premium module list — works even before the premium bundle backend loads. */
@Injectable()
export class PremiumCatalogService {
  constructor(
    private licenseManager: LicenseManagerService,
    private prisma: PrismaService,
    private entitlement: FeatureEntitlementService,
    private features: FeatureManagerService,
  ) {}

  /** Modules the caller may actually open: licensed by the plan *and* enabled. */
  private async readableModuleIds(): Promise<Set<string>> {
    const allowed = new Set<string>();
    for (const manifest of MODULE_MANIFESTS) {
      const access = await this.features.getModuleAccess(manifest.id);
      if (access.canRead) allowed.add(manifest.id);
    }
    return allowed;
  }

  /** Modules covered by the license, regardless of whether an operator disabled them. */
  private async licensedModuleIds(): Promise<Set<string>> {
    return new Set(await this.licenseManager.getLicensedModuleIds());
  }

  async listForLicensedAdmin(
    adminId: string,
    role: string,
  ): Promise<
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
    const licensed = await this.entitlement.isPremiumEdition();

    if (!licensed) return [];

    await this.ensureModuleRowsSeeded();

    let stateMap = new Map<string, { enabled: boolean }>();
    try {
      const rows = await this.prisma.premiumModuleState.findMany();
      stateMap = new Map(rows.map((r) => [r.moduleId, { enabled: r.enabled }]));
    } catch {
      /* tables may not exist yet */
    }

    let assignedModuleIds: Set<string> | null = null;
    if (role !== 'SUPER_ADMIN') {
      try {
        const assignments = await this.prisma.adminModuleAssignment.findMany({
          where: { adminId, enabled: true },
          select: { moduleId: true },
        });
        assignedModuleIds = new Set(assignments.map((a) => a.moduleId));
      } catch {
        assignedModuleIds = new Set();
      }
    }

    const readableModuleIds = await this.readableModuleIds();

    return MODULE_MANIFESTS.filter((m) => m.id !== 'job-center')
      .filter((m) => readableModuleIds.has(m.id))
      .filter((m) => {
        if (role === 'SUPER_ADMIN') return true;
        return m.kind === 'BUSINESS' && assignedModuleIds?.has(m.id);
      })
      .map((m) => {
        const row = stateMap.get(m.id);
        const enabled = row?.enabled ?? (m.defaultEnabled || m.phase <= 3);
        return {
          id: m.id,
          name: m.name,
          description: m.description,
          kind: m.kind,
          version: m.version,
          phase: m.phase,
          enabled,
          frontendPath: m.routes.frontend,
          settingsSchema: {},
          settings: {},
          status:
            !enabled
              ? ('disabled' as const)
              : license.mode === 'read_only'
                ? ('read_only' as const)
                : ('healthy' as const),
        };
      })
      .filter((m) => m.enabled && m.status !== 'disabled');
  }

  /** Super-admin module manager — always returns full catalog + DB state (patch layer). */
  async listAllForSuperAdmin(): Promise<
    Array<{
      id: string;
      name: string;
      description: string;
      kind: string;
      version: string;
      phase: number;
      enabled: boolean;
      licensed: boolean;
      frontendPath: string;
      settingsSchema: Record<string, unknown>;
      settings: Record<string, unknown>;
      status: 'healthy' | 'read_only' | 'disabled' | 'future';
    }>
  > {
    const license = await this.licenseManager.getLicenseState();
    const licensed = await this.entitlement.isPremiumEdition();

    if (!licensed) return [];

    await this.ensureModuleRowsSeeded();

    const licensedModuleIds = await this.licensedModuleIds();

    let stateMap = new Map<string, { enabled: boolean; settings: Record<string, unknown> }>();
    try {
      const rows = await this.prisma.premiumModuleState.findMany();
      stateMap = new Map(
        rows.map((r) => [
          r.moduleId,
          { enabled: r.enabled, settings: (r.settings as Record<string, unknown>) ?? {} },
        ]),
      );
    } catch {
      /* tables may not exist yet */
    }

    return MODULE_MANIFESTS.map((m) => {
      const row = stateMap.get(m.id);
      const enabled = row?.enabled ?? (m.defaultEnabled || m.phase <= 3);
      const moduleLicensed = licensedModuleIds.has(m.id);
      return {
        id: m.id,
        name: m.name,
        description: m.description,
        kind: m.kind,
        version: m.version,
        phase: m.phase,
        enabled,
        // Unlicensed modules stay listed so Super Admin can see what the plan excludes.
        licensed: moduleLicensed,
        frontendPath: m.routes.frontend,
        settingsSchema: {},
        settings: row?.settings ?? {},
        status: !enabled
          ? ('disabled' as const)
          : !moduleLicensed
            ? ('disabled' as const)
            : license.mode === 'read_only'
              ? ('read_only' as const)
              : m.phase > 3
                ? ('future' as const)
                : ('healthy' as const),
      };
    });
  }

  private async ensureModuleRowsSeeded(): Promise<void> {
    try {
      for (const m of MODULE_MANIFESTS) {
        await this.prisma.premiumModuleState.upsert({
          where: { moduleId: m.id },
          create: {
            moduleId: m.id,
            kind: m.kind as 'PLATFORM' | 'BUSINESS',
            enabled: m.defaultEnabled || m.phase <= 3,
            settings: {},
          },
          update: {},
        });
      }
    } catch {
      /* ignore — db may not be migrated yet */
    }
  }

  async listAllAssignments() {
    return this.prisma.adminModuleAssignment.findMany({
      include: {
        admin: { select: { id: true, username: true, email: true, role: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async setModuleEnabled(moduleId: string, enabled: boolean) {
    const manifest = MODULE_MANIFESTS.find((m) => m.id === moduleId);
    if (!manifest) {
      throw new Error('Module not found');
    }
    await this.ensureModuleRowsSeeded();
    return this.prisma.premiumModuleState.upsert({
      where: { moduleId },
      create: {
        moduleId,
        kind: manifest.kind as 'PLATFORM' | 'BUSINESS',
        enabled,
        settings: {},
      },
      update: { enabled },
    });
  }

  async updateModuleSettings(moduleId: string, settings: Record<string, unknown>) {
    const manifest = MODULE_MANIFESTS.find((m) => m.id === moduleId);
    if (!manifest) {
      throw new Error('Module not found');
    }
    await this.ensureModuleRowsSeeded();
    const jsonSettings = settings as Prisma.InputJsonValue;
    return this.prisma.premiumModuleState.upsert({
      where: { moduleId },
      create: {
        moduleId,
        kind: manifest.kind as 'PLATFORM' | 'BUSINESS',
        enabled: manifest.defaultEnabled || manifest.phase <= 3,
        settings: jsonSettings,
      },
      update: { settings: jsonSettings },
    });
  }

  async assignModule(
    adminId: string,
    moduleId: string,
    enabled: boolean,
    settings: Record<string, unknown> = {},
  ) {
    const manifest = MODULE_MANIFESTS.find((m) => m.id === moduleId);
    if (!manifest) {
      throw new Error('Module not found');
    }
    if (manifest.kind !== 'BUSINESS') {
      throw new Error('Only business modules can be assigned to admins.');
    }
    const jsonSettings = settings as Prisma.InputJsonValue;
    const row = await this.prisma.adminModuleAssignment.upsert({
      where: { adminId_moduleId: { adminId, moduleId } },
      create: { adminId, moduleId, enabled, settings: jsonSettings },
      update: { enabled, settings: jsonSettings },
    });

    // Keep legacy Admin.storeEnabled in sync with Premium Settings / Admin Management.
    if (moduleId === 'store') {
      await this.prisma.admin.update({
        where: { id: adminId },
        data: { storeEnabled: enabled },
      }).catch(() => undefined);
    }

    return row;
  }
}
