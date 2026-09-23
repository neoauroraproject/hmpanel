import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';

/** Community stub — Premium overlay replaces this with real entitlement checks. */
export const RequirePremiumModule = (_moduleId: string | string[]) =>
  (_target: any, _key?: any, descriptor?: any) => descriptor;

@Injectable()
export class PremiumModuleGuard implements CanActivate {
  canActivate(_context: ExecutionContext) {
    return true;
  }
}
