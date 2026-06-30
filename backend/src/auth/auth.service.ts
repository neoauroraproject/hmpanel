import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

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
      },
    });

    if (!admin) throw new UnauthorizedException('Invalid credentials');
    if (admin.status !== 'active')
      throw new UnauthorizedException('Account suspended');

    const valid = await bcrypt.compare(password, admin.passwordHash);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    const payload = { sub: admin.id, role: admin.role };
    const accessToken = this.jwt.sign(payload, { expiresIn: '24h' });
    const refreshToken = this.jwt.sign(
      { ...payload, refresh: true },
      { expiresIn: '30d' },
    );

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
      const decoded = this.jwt.verify(token);
      if (!decoded.refresh)
        throw new UnauthorizedException('Invalid token type');

      const admin = await this.prisma.admin.findUnique({
        where: { id: decoded.sub },
      });
      if (!admin || admin.status !== 'active')
        throw new UnauthorizedException('Invalid user');

      const payload = { sub: admin.id, role: admin.role };
      const accessToken = this.jwt.sign(payload, { expiresIn: '24h' });
      const refreshToken = this.jwt.sign(
        { ...payload, refresh: true },
        { expiresIn: '30d' },
      );

      return { accessToken, refreshToken };
    } catch (e) {
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }
}
