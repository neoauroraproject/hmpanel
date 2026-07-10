import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { LicenseManagerService } from '../../platform/license-manager.service';

@Injectable()
export class PremiumGuard implements CanActivate {
  constructor(private licenseManager: LicenseManagerService) {}

  async canActivate(_context: ExecutionContext): Promise<boolean> {
    const state = await this.licenseManager.getLicenseState();
    const active =
      (state.status === 'active' || state.status === 'grace') &&
      state.mode !== 'disabled' &&
      state.status !== 'expired' &&
      state.edition === 'PREMIUM';

    if (!active) {
      throw new ForbiddenException(
        'This feature requires an active Premium license.',
      );
    }

    return true;
  }
}
