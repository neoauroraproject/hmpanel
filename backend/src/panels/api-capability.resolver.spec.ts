import { ApiCapabilityResolver } from './api-capability.resolver';

describe('ApiCapabilityResolver', () => {
  const resolver = new ApiCapabilityResolver();

  it('resolves 3.7.x panels from api370.json when present', () => {
    const result = resolver.resolve('3.7.0', '1.0');
    expect(result.hash).not.toMatch(/^fallback-/);
    expect(result.capabilities.clientsApi).toBe(true);
    expect(result.capabilities.hwidsApi).toBe(true);
    expect(result.capabilities.happLinkApi).toBeFalsy();
  });

  it('resolves 3.8.x panels from api380.json', () => {
    const v380 = resolver.resolve('3.8.0', '1.0');
    const v381 = resolver.resolve('3.8.1', '1.0');
    expect(v380.hash).not.toMatch(/^fallback-/);
    expect(v380.hash).toBe(v381.hash);
    expect(v380.capabilities.happLinkApi).toBe(true);
    expect(v380.capabilities.hwidStatusApi).toBe(true);
    expect(v380.capabilities.discordTestApi).toBe(true);
    expect(v380.capabilities.hwidsApi).toBe(true);
  });

  it('keeps 3.7 and 3.8 on different specs', () => {
    const v37 = resolver.resolve('3.7.0', '1.0');
    const v38 = resolver.resolve('3.8.0', '1.0');
    expect(v37.hash).not.toBe(v38.hash);
  });

  it('returns stable hash for the same 3.7 minor', () => {
    const a = resolver.resolve('3.7.1', '1.0');
    const b = resolver.resolve('3.7.2', '1.0');
    expect(a.hash).toBe(b.hash);
  });

  it('does not apply 3.8 flags to panels older than every bundled spec', () => {
    const result = resolver.resolve('2.0.0', '1.0');
    expect(result.hash).toMatch(/^fallback-/);
    expect(result.capabilities.happLinkApi).toBeFalsy();
    expect(result.capabilities.hwidsApi).toBeFalsy();
  });

  it('keeps 3.3.x on api331 rather than api380', () => {
    const v33 = resolver.resolve('3.3.1', '1.0');
    const v38 = resolver.resolve('3.8.0', '1.0');
    expect(v33.hash).not.toMatch(/^fallback-/);
    expect(v33.hash).not.toBe(v38.hash);
    expect(v33.capabilities.happLinkApi).toBeFalsy();
  });
});
