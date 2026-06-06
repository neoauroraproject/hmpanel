import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';

@Injectable()
export class PremiumGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const releaseMode = process.env.RELEASE_MODE || 'PREMIUM';
    if (releaseMode === 'COMMUNITY') {
      throw new ForbiddenException('This feature is not available in the Community Edition.');
    }
    return true;
  }
}
