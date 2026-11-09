import {
  ApiCapabilityResolver,
  parseSpecFileVersion,
} from './api-capability.resolver';

describe('parseSpecFileVersion', () => {
  it.each([
    ['api331.json', [3, 3, 1]],
    ['api342.json', [3, 4, 2]],
    ['api390.json', [3, 9, 0]],
    ['api310.json', [3, 10, 0]],
    ['api311.json', [3, 11, 0]],
    ['api3112.json', [3, 11, 2]],
  ])('%s -> %j', (file, expected) => {
    expect(parseSpecFileVersion(file)).toEqual(expected);
  });
});

describe('ApiCapabilityResolver', () => {
  const resolver = new ApiCapabilityResolver();

  it('resolves 3.11.x panels from api311.json, not api390', () => {
    const v311 = resolver.resolve('3.11.0', '1.0');
    const v3112 = resolver.resolve('3.11.2', '1.0');
    const v39 = resolver.resolve('3.9.0', '1.0');
    expect(v311.hash).not.toMatch(/^fallback-/);
    expect(v311.hash).toBe(v3112.hash);
    expect(v311.hash).not.toBe(v39.hash);
    expect(v311.capabilities.clientsApi).toBe(true);
  });

  it('uses the newest spec (api311) for panels newer than every bundled spec', () => {
    expect(resolver.resolve('3.12.0', '1.0').hash).toBe(
      resolver.resolve('3.11.0', '1.0').hash,
    );
  });

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
