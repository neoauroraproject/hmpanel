import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { assertAdminSessionActive } from './admin-session.util';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  private signTokens(admin: { id: string; role: string; tokenVersion: number }) {
    const payload = { sub: admin.id, role: admin.role, tv: admin.tokenVersion ?? 0 };
    const accessToken = this.jwt.sign(payload, { expiresIn: '24h' });
    const refreshToken = this.jwt.sign(
      { ...payload, refresh: true },
      { expiresIn: '30d' },
    );
    return { accessToken, refreshToken };
  }

  async login(username: string, password: string) {
    const admin = await this.prisma.admin.findUnique({
      where: { username },
      select: {
        id: true,
        username: true,
        email: true,
        passwordHash: true,
        role: true,
        status: true,
        expiryTime: true,
        tokenVersion: true,
      },
    });

    if (!admin) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    assertAdminSessionActive(admin);

    const { accessToken, refreshToken } = this.signTokens(admin);

    return {
      accessToken,
      refreshToken,
      admin: {
        id: admin.id,
        username: admin.username,
        email: admin.email,
        role: admin.role,
      },
    };
  }

  async refresh(token: string) {
    try {
      const decoded = this.jwt.verify(token) as {
        sub: string;
        role: string;
        tv?: number;
        refresh?: boolean;
      };
      if (!decoded.refresh)
        throw new UnauthorizedException('Invalid token type');

      const admin = await this.prisma.admin.findUnique({
        where: { id: decoded.sub },
        select: {
          id: true,
          role: true,
          status: true,
          expiryTime: true,
          tokenVersion: true,
        },
      });
      assertAdminSessionActive(admin, decoded.tv);

      const { accessToken, refreshToken } = this.signTokens(admin!);

      return { accessToken, refreshToken };
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }
}
