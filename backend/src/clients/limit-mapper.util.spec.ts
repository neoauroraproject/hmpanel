import { allowedUsersFromXuiClient } from './limit-mapper.util';

describe('allowedUsersFromXuiClient', () => {
  it('prefers limitHwid when set', () => {
    expect(allowedUsersFromXuiClient({ limitHwid: 3, limitIp: 1 })).toBe(3);
  });

  it('falls back to limitIp', () => {
    expect(allowedUsersFromXuiClient({ limitHwid: 0, limitIp: 2 })).toBe(2);
  });

  it('returns 0 when both unlimited', () => {
    expect(allowedUsersFromXuiClient({ limitHwid: 0, limitIp: 0 })).toBe(0);
  });
});
