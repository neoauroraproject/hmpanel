import { hashApiKey, generateApiKey, hasScope, parseScopes } from './bot-api.types';

describe('Bot API key helpers', () => {
  it('hashes keys stably and generates hmp_ prefix', () => {
    const a = generateApiKey();
    expect(a.plain.startsWith('hmp_')).toBe(true);
    expect(hashApiKey(a.plain)).toBe(a.hash);
    expect(parseScopes(['clients.read', 'nope'])).toEqual(['clients.read']);
  });

  it('collapses full access to a single wildcard that satisfies every scope', () => {
    expect(parseScopes(['clients.read', '*'])).toEqual(['*']);
    expect(hasScope(['*'], 'clients.renew')).toBe(true);
    expect(hasScope(['clients.read'], 'clients.write')).toBe(false);
    expect(hasScope(null, 'clients.read')).toBe(false);
  });
});
