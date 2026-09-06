import { hashApiKey, generateApiKey, parseScopes } from './bot-api.types';

describe('Bot API key helpers', () => {
  it('hashes keys stably and generates hmp_ prefix', () => {
    const a = generateApiKey();
    expect(a.plain.startsWith('hmp_')).toBe(true);
    expect(hashApiKey(a.plain)).toBe(a.hash);
    expect(parseScopes(['clients.read', 'nope'])).toEqual(['clients.read']);
  });
});
