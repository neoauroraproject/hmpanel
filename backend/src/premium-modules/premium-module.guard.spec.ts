import { PremiumModuleGuard, RequirePremiumModule } from './premium-module.guard';

describe('Community PremiumModuleGuard stub', () => {
  it('always allows access (real checks live in the Premium overlay)', () => {
    const guard = new PremiumModuleGuard();
    expect(guard.canActivate({} as any)).toBe(true);
  });

  it('RequirePremiumModule is a no-op decorator', () => {
    class Target {
      handler() {
        return 'ok';
      }
    }
    const descriptor = Object.getOwnPropertyDescriptor(Target.prototype, 'handler');
    const result = RequirePremiumModule('store')(Target.prototype, 'handler', descriptor);
    expect(result).toBe(descriptor);
  });
});
