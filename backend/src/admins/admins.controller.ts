import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Req, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard, Roles } from '../common/roles.guard';
import { AdminsService } from './admins.service';
import { CreateAdminDto, UpdateAdminDto } from './dto/admin.dto';
import type { AuthRequest } from '../common/auth-request';

@ApiTags('Admins')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Controller('admins')
export class AdminsController {
  constructor(private adminsService: AdminsService) {}

  @Post()
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Create a reseller admin' })
  create(@Body() dto: CreateAdminDto) {
    return this.adminsService.create(dto);
  }

  @Get()
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'List all admins' })
  findAll(
    @Query('page') page?: string, 
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('inboundId') inboundId?: string,
    @Query('panelId') panelId?: string
  ) {
    return this.adminsService.findAll(Number(page) || 1, Number(limit) || 50, { search, status, inboundId, panelId });
  }

  @Get('audit-refunds')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Generate a refund audit report for all resellers' })
  auditRefunds() {
    return this.adminsService.auditRefunds();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get admin details' })
  findOne(@Req() req: AuthRequest, @Param('id') id: string) {
    if (req.user.role !== 'SUPER_ADMIN' && req.user.id !== id) {
      throw new ForbiddenException('You can only view your own profile');
    }
    return this.adminsService.findOne(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update admin' })
  update(@Req() req: AuthRequest, @Param('id') id: string, @Body() dto: UpdateAdminDto) {
    if (req.user.role !== 'SUPER_ADMIN' && req.user.id !== id) {
      throw new ForbiddenException('You can only update your own profile');
    }
    return this.adminsService.update(id, dto);
  }

  @Delete(':id')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Delete admin' })
  remove(@Param('id') id: string) {
    return this.adminsService.remove(id);
  }

  @Post(':id/fix-migration')
  @Roles('SUPER_ADMIN')
  @ApiOperation({ summary: 'Fix migrated admin: sync balance from trafficPool and set up adminInbound' })
  fixMigration(@Param('id') id: string, @Body() dto: { balanceGb?: number; inboundIds?: string[] }) {
    return this.adminsService.fixMigratedAdmin(id, dto);
  }
}
