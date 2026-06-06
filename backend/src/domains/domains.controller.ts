import { Controller, Get, Post, Put, Delete, Param, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard, Roles } from '../common/roles.guard';
import { PremiumGuard } from '../common/guards/premium.guard';
import { DomainsService } from './domains.service';

@ApiTags('Domains')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard, PremiumGuard)
@Controller('domains')
export class DomainsController {
  constructor(private domainsService: DomainsService) {}

  @Get()
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Get all domains' })
  async getDomains() {
    return this.domainsService.getDomains();
  }

  @Post()
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Create a new domain' })
  async createDomain(@Body() dto: any) {
    return this.domainsService.createDomain(dto);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Delete a domain' })
  async deleteDomain(@Param('id') id: string) {
    return this.domainsService.deleteDomain(id);
  }

  @Post(':id/verify')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Verify and issue SSL for a domain' })
  async verifyDomain(@Param('id') id: string) {
    return this.domainsService.verifyDomain(id);
  }
}
