import { UnauthorizedException } from '@nestjs/common';
import { assertAdminSessionActive } from './admin-session.util';

describe('assertAdminSessionActive', () => {
  const active = { status: 'active', expiryTime: 0n, tokenVersion: 0 };

  it('passes for active admin with matching token version', () => {
    expect(() => assertAdminSessionActive(active, 0)).not.toThrow();
  });

  it('rejects disabled admin', () => {
    expect(() =>
      assertAdminSessionActive({ ...active, status: 'disabled' }, 0),
    ).toThrow(UnauthorizedException);
  });

  it('rejects expired admin', () => {
    expect(() =>
      assertAdminSessionActive({ ...active, expiryTime: BigInt(Date.now() - 1000) }, 0),
    ).toThrow(UnauthorizedException);
  });

  it('rejects stale token version', () => {
    expect(() =>
      assertAdminSessionActive({ ...active, tokenVersion: 2 }, 1),
    ).toThrow(UnauthorizedException);
  });
});
