import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import type { AuthRequest } from '../common/auth-request';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @ApiOperation({ summary: 'Admin login' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.username, dto.password);
  }

  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  async refresh(@Body() dto: { refreshToken: string }) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Get('me')
  @ApiBearerAuth()
  @UseGuards(AuthGuard('jwt'))
  @ApiOperation({ summary: 'Current admin session' })
  me(@Req() req: AuthRequest) {
    return this.authService.me(req.user.id);
  }
}
