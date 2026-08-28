import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { assertAdminSessionActive } from './admin-session.util';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private prisma: PrismaService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        ExtractJwt.fromAuthHeaderAsBearerToken(),
        ExtractJwt.fromUrlQueryParameter('token'),
      ]),
      secretOrKey:
        config.get<string>('JWT_SECRET') ?? 'dev-only-change-me-in-production',
    });
  }

  async validate(payload: { sub: string; role: string; tv?: number; refresh?: boolean }) {
    if (payload.refresh) {
      throw new UnauthorizedException('Invalid token type');
    }
    const admin = await this.prisma.admin.findUnique({
      where: { id: payload.sub },
      select: {
        id: true,
        role: true,
        status: true,
        expiryTime: true,
        tokenVersion: true,
      },
    });
    assertAdminSessionActive(admin, payload.tv);
    return { id: admin!.id, role: admin!.role };
  }
}
