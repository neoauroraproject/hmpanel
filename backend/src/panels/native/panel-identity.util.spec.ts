import { generatePanelKey, isPanelKey, parseConnectionHealth, ulid } from './panel-identity.util';

describe('panel identity', () => {
  it('generates pnl_<ULID> keys that pass the panelKey regex', () => {
    const key = generatePanelKey();
    expect(key.startsWith('pnl_')).toBe(true);
    expect(isPanelKey(key)).toBe(true);
  });

  it('produces unique keys', () => {
    const set = new Set(Array.from({ length: 20 }, () => generatePanelKey()));
    expect(set.size).toBe(20);
  });

  it('ulid is 26 chars', () => {
    expect(ulid().length).toBe(26);
  });

  it('parseConnectionHealth falls back to UNKNOWN', () => {
    expect(parseConnectionHealth('CONNECTED')).toBe('CONNECTED');
    expect(parseConnectionHealth('nope')).toBe('UNKNOWN');
  });
});
