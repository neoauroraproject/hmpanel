import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PremiumModulesService } from './premium-modules.service';
import { FeatureManagerService } from '../platform/feature-manager.service';
import type { ModuleAccess } from '../platform/types/module-manifest.types';

export const PREMIUM_MODULE_KEY = 'premium_module';

/**
 * Accepts a single module id, or a list of ids where any one of them grants access.
 */
export const RequirePremiumModule = (moduleId: string | string[]) =>
  SetMetadata(PREMIUM_MODULE_KEY, moduleId);

@Injectable()
export class PremiumModuleGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private modules: PremiumModulesService,
    private features: FeatureManagerService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const metadata = this.reflector.getAllAndOverride<string | string[]>(
      PREMIUM_MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );
    const moduleIds = (Array.isArray(metadata) ? metadata : [metadata]).filter(
      (id): id is string => !!id,
    );
    if (!moduleIds.length) return true;

    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user?.id) throw new ForbiddenException();

    let licensedAccess: ModuleAccess | null = null;
    let unlicensedId: string | null = null;

    for (const moduleId of moduleIds) {
      const access = await this.features.getModuleAccess(moduleId);
      if (!access.canRead) {
        unlicensedId ??= moduleId;
        continue;
      }
      licensedAccess ??= access;
      const allowed = await this.modules.canAccessModule(
        user.id,
        user.role,
        moduleId,
      );
      if (allowed) {
        req.moduleAccess = access;
        return true;
      }
    }

    if (!licensedAccess) {
      throw new ForbiddenException(
        `Module "${unlicensedId ?? moduleIds[0]}" is not licensed or enabled.`,
      );
    }
    throw new ForbiddenException(
      `Module "${licensedAccess.moduleId}" is not enabled for this account.`,
    );
  }
}
