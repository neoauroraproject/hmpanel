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

function contextFor(target: any) {
  return {
    getHandler: () => () => undefined,
    getClass: () => target,
  } as any;
}

function guardWith(readable: string[]) {
  return new PremiumModuleGuard(new Reflector(), {
    getModuleAccess: jest.fn(async (moduleId: string) => ({
      moduleId,
      enabled: readable.includes(moduleId),
      licensed: readable.includes(moduleId),
      mode: 'full' as const,
      canRead: readable.includes(moduleId),
      canWrite: readable.includes(moduleId),
    })),
  } as any);
}

describe('RequirePremiumModule', () => {
  it('records the required module ids as metadata', () => {
    expect(Reflect.getMetadata(PREMIUM_MODULE_KEY, StoreController)).toEqual(['store']);
    expect(Reflect.getMetadata(PREMIUM_MODULE_KEY, SharedController)).toEqual([
      'admin-recharge',
      'external-panels',
    ]);
  });
});

describe('PremiumModuleGuard', () => {
  it('allows a licensed module', async () => {
    const guard = guardWith(['store']);
    await expect(guard.canActivate(contextFor(StoreController))).resolves.toBe(true);
  });

  it('rejects a module the license does not include', async () => {
    const guard = guardWith(['branding']);
    await expect(guard.canActivate(contextFor(StoreController))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows a shared route when any of its modules is licensed', async () => {
    const guard = guardWith(['external-panels']);
    await expect(guard.canActivate(contextFor(SharedController))).resolves.toBe(true);
  });

  it('rejects a shared route when none of its modules is licensed', async () => {
    const guard = guardWith([]);
    await expect(guard.canActivate(contextFor(SharedController))).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('stays out of the way on routes that declare no module', async () => {
    const guard = guardWith([]);
    await expect(guard.canActivate(contextFor(UnguardedController))).resolves.toBe(true);
  });
});
