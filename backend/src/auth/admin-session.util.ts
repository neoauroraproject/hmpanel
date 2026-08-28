import { UnauthorizedException } from '@nestjs/common';

export type AdminSessionRecord = {
  status: string;
  expiryTime: bigint | number | null;
  tokenVersion?: number | null;
};

export function assertAdminSessionActive(
  admin: AdminSessionRecord | null | undefined,
  payloadTokenVersion?: number,
): void {
  if (!admin || admin.status !== 'active') {
    throw new UnauthorizedException('Account disabled');
  }
  const expiry = BigInt(admin.expiryTime ?? 0);
  if (expiry > 0n && BigInt(Date.now()) >= expiry) {
    throw new UnauthorizedException('Account expired');
  }
  const currentVersion = admin.tokenVersion ?? 0;
  const tokenVersion = payloadTokenVersion ?? 0;
  if (tokenVersion !== currentVersion) {
    throw new UnauthorizedException('Session revoked');
  }
}
