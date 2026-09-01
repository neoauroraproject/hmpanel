import { resolveOutputType } from './output-type.resolver';

describe('resolveOutputType', () => {
  it('maps eylan and pasarguard to subscription (QR/link renderers)', () => {
    expect(resolveOutputType('eylan')).toBe('subscription');
    expect(resolveOutputType('pasarguard')).toBe('subscription');
    expect(resolveOutputType('multi')).toBe('subscription');
  });

  it('keeps unknown as generic', () => {
    expect(resolveOutputType('unknown')).toBe('generic');
    expect(resolveOutputType('')).toBe('generic');
  });

  it('keeps wireguard dedicated', () => {
    expect(resolveOutputType('wireguard')).toBe('wireguard');
  });
});
