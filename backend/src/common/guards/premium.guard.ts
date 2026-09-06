import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { FeatureEntitlementService } from '../../platform/feature-entitlement.service';

@Injectable()
export class PremiumGuard implements CanActivate {
  constructor(private entitlement: FeatureEntitlementService) {}

  async canActivate(_context: ExecutionContext): Promise<boolean> {
    if (!(await this.entitlement.can('premium'))) {
      throw new ForbiddenException(
        'This feature requires an active Premium license.',
      );
    }
    return true;
  }
}
