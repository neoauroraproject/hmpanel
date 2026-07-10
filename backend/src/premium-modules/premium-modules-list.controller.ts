import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { PremiumGuard } from '../common/guards/premium.guard';
import { PremiumCatalogService } from '../platform/premium-catalog.service';
import type { AuthRequest } from '../common/auth-request';

/**
 * Always-available premium module list (Community).
 * Premium bundle controllers add per-module APIs under /premium-modules/*.
 */
@ApiTags('Premium')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), PremiumGuard)
@Controller('premium-modules')
export class PremiumModulesListController {
  constructor(private catalog: PremiumCatalogService) {}

  @Get()
  @ApiOperation({ summary: 'List visible premium modules' })
  async list(@Req() req: AuthRequest) {
    return this.catalog.listForLicensedAdmin(req.user.id, req.user.role);
  }
}
