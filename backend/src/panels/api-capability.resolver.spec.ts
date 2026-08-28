import { ApiCapabilityResolver } from './api-capability.resolver';

describe('ApiCapabilityResolver', () => {
  const resolver = new ApiCapabilityResolver();

  it('resolves 3.7.x panels from api370.json when present', () => {
    const result = resolver.resolve('3.7.0', '1.0');
    expect(result.hash).not.toMatch(/^fallback-/);
    expect(result.capabilities.clientsApi).toBe(true);
  });

  it('returns stable hash for the same version', () => {
    const a = resolver.resolve('3.7.1', '1.0');
    const b = resolver.resolve('3.7.2', '1.0');
    expect(a.hash).toBe(b.hash);
  });
});
