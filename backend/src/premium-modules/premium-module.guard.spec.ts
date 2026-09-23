import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  PREMIUM_MODULE_KEY,
  PremiumModuleGuard,
  RequirePremiumModule,
} from './premium-module.guard';

class StoreController {}
RequirePremiumModule('store')(StoreController);

class SharedController {}
RequirePremiumModule(['admin-recharge', 'external-panels'])(SharedController);

class UnguardedController {}

function contextFor(target: any, user?: { id: string; role: string }) {
  return {
    getHandler: () => () => undefined,
    getClass: () => target,
    switchToHttp: () => ({
      getRequest: () => ({ user: user ?? { id: 'admin-1', role: 'RESELLER' } }),
    }),
  } as any;
}

function guardWith(opts: {
  readable: string[];
  allowed?: string[];
}) {
  const readable = opts.readable;
  const allowed = opts.allowed ?? readable;
  return new PremiumModuleGuard(
    new Reflector(),
    {
      canAccessModule: jest.fn(async (_adminId: string, _role: string, moduleId: string) =>
        allowed.includes(moduleId),
      ),
    } as any,
    {
      getModuleAccess: jest.fn(async (moduleId: string) => ({
        moduleId,
        enabled: readable.includes(moduleId),
        licensed: readable.includes(moduleId),
        mode: 'full' as const,
        canRead: readable.includes(moduleId),
        canWrite: readable.includes(moduleId),
      })),
    } as any,
  );
}

describe('RequirePremiumModule', () => {
  it('records the required module ids as metadata', () => {
    expect(Reflect.getMetadata(PREMIUM_MODULE_KEY, StoreController)).toEqual('store');
    expect(Reflect.getMetadata(PREMIUM_MODULE_KEY, SharedController)).toEqual([
      'admin-recharge',
      'external-panels',
    ]);
  });
});

describe('PremiumModuleGuard', () => {
  it('allows a licensed module assigned to the admin', async () => {
    const guard = guardWith({ readable: ['store'], allowed: ['store'] });
    await expect(guard.canActivate(contextFor(StoreController))).resolves.toBe(true);
  });

  it('rejects a module the license does not include', async () => {
    const guard = guardWith({ readable: ['branding'], allowed: ['store'] });
    await expect(guard.canActivate(contextFor(StoreController))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rejects when licensed but not assigned to the reseller', async () => {
    const guard = guardWith({ readable: ['store'], allowed: [] });
    await expect(guard.canActivate(contextFor(StoreController))).rejects.toThrow(
      /not enabled for this account/,
    );
  });

  it('allows a shared route when any of its modules is licensed and assigned', async () => {
    const guard = guardWith({
      readable: ['external-panels'],
      allowed: ['external-panels'],
    });
    await expect(guard.canActivate(contextFor(SharedController))).resolves.toBe(true);
  });

  it('rejects a shared route when none of its modules is licensed', async () => {
    const guard = guardWith({ readable: [], allowed: [] });
    await expect(guard.canActivate(contextFor(SharedController))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('stays out of the way on routes that declare no module', async () => {
    const guard = guardWith({ readable: [], allowed: [] });
    await expect(guard.canActivate(contextFor(UnguardedController))).resolves.toBe(true);
  });
});
