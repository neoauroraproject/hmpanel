import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureManagerService } from '../platform/feature-manager.service';

export const PREMIUM_MODULE_KEY = 'premium:required-modules';

/**
 * Declares which premium module(s) a controller or handler belongs to. When several are
 * listed the route is shared, so access to any one of them is enough.
 */
export const RequirePremiumModule = (moduleId: string | string[]) =>
  SetMetadata(PREMIUM_MODULE_KEY, Array.isArray(moduleId) ? moduleId : [moduleId]);

@Injectable()
export class PremiumModuleGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private features: FeatureManagerService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[] | undefined>(
      PREMIUM_MODULE_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!required?.length) return true;

    for (const moduleId of required) {
      const access = await this.features.getModuleAccess(moduleId);
      if (access.canRead) return true;
    }

    throw new ForbiddenException(
      `Module "${required.join('" or "')}" is not included in this license.`,
    );
  }
}
