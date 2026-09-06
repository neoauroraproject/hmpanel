import { Injectable, CanActivate, ExecutionContext, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FeatureFlagsService } from '../platform/architecture/feature-flags.service';
import { PLATFORM_FLAGS } from '../platform/architecture/feature-flags';
import { PermissionEngine } from '../authz/permission.engine';

export const ROLES_KEY = 'roles';
export const Roles =
  (...roles: string[]) =>
  (target: any, key?: string, descriptor?: any) => {
    Reflect.defineMetadata(ROLES_KEY, roles, descriptor?.value ?? target);
    return descriptor ?? target;
  };

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @Optional() private flags?: FeatureFlagsService,
    @Optional() private permissions?: PermissionEngine,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true;

    const { user } = context.switchToHttp().getRequest();
    if (!user) return false;
    if (!required.includes(user.role)) return false;

    // Legacy bridge: when permission_engine_v1 is on, SUPER_ADMIN still passes;
    // resellers still need the Roles decorator. Resource scopes stay in services.
    if (this.flags && this.permissions && (await this.flags.isEnabled(PLATFORM_FLAGS.PERMISSION_ENGINE_V1))) {
      return this.permissions.can(
        { id: user.id, role: user.role, permissions: user.permissions },
        user.role === 'SUPER_ADMIN' ? 'settings.read' : 'users.read',
      );
    }
    return true;
  }
}
