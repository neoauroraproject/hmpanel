import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  Res,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ClientsService } from './clients.service';
import { ClientOutputService } from './output/client-output.service';
import { getRequestOrigin } from '../common/utils/request-origin';
import {
  CreateClientDto,
  UpdateClientDto,
  BulkClientDto,
  BulkCreateClientDto,
} from './dto/client.dto';
import type { AuthRequest } from '../common/auth-request';

@ApiTags('Clients')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('clients')
export class ClientsController {
  constructor(
    private clientsService: ClientsService,
    private clientOutput: ClientOutputService,
  ) {}

  @Post()
  @ApiOperation({ summary: 'Create a client' })
  create(@Req() req: AuthRequest, @Body() dto: CreateClientDto) {
    return this.clientsService.create(req.user.id, dto);
  }

  @Post('bulk-create')
  @ApiOperation({ summary: 'Bulk create clients' })
  bulkCreate(@Req() req: AuthRequest, @Body() dto: BulkCreateClientDto) {
    return this.clientsService.bulkCreate(req.user.id, req.user.role, dto);
  }

  @Post('bulk-create/validate')
  @ApiOperation({ summary: 'Validate parameters for bulk client creation' })
  validateBulkCreate(
    @Req() req: AuthRequest,
    @Body() dto: BulkCreateClientDto,
  ) {
    return this.clientsService.validateBulkCreate(
      req.user.id,
      req.user.role,
      dto,
    );
  }

  @Get('groups')
  @ApiOperation({ summary: 'List all unique groups across all panels' })
  getGroups(@Req() req: AuthRequest) {
    return this.clientsService.getGroups(req.user.id, req.user.role);
  }

  @Post('bulk')
  @ApiOperation({
    summary:
      'Bulk action on clients (enable/disable/delete/addTraffic/addDays/assignGroup)',
  })
  bulk(@Req() req: AuthRequest, @Body() dto: BulkClientDto) {
    return this.clientsService.bulk(req.user.id, req.user.role, dto);
  }

  @Get('cleanup-candidates')
  @ApiOperation({ summary: 'Get expired clients eligible for cleanup' })
  getCleanupCandidates(@Req() req: AuthRequest) {
    return this.clientsService.getCleanupCandidates(req.user.id, req.user.role);
  }

  @Get()
  @ApiOperation({
    summary: 'List clients (scoped by role, filterable, paginated)',
  })
  findAll(
    @Req() req: AuthRequest,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
    @Query('inboundId') inboundId?: string,
    @Query('panelId') panelId?: string,
    @Query('panelType') panelType?: string,
    @Query('adminId') adminId?: string,
    @Query('expiry') expiry?: string,
    @Query('trafficRange') trafficRange?: string,
  ) {
    return this.clientsService.findAll(
      req.user.id,
      req.user.role,
      Number(page) || 1,
      Number(limit) || 25,
      { search, status, inboundId, panelId, panelType, adminId, expiry, trafficRange },
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get client details' })
  findOne(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.clientsService.findOne(id, req.user.id, req.user.role);
  }

  @Get(':id/output')
  @ApiOperation({ summary: 'Protocol-aware connection output model' })
  async getOutput(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Query('inboundId') inboundId?: string,
  ) {
    await this.clientsService.findOne(id, req.user.id, req.user.role);
    const origin = getRequestOrigin(req);
    return this.clientOutput.getOutputByClientId(id, { origin, inboundId });
  }

  @Get(':id/config')
  @ApiOperation({
    summary: 'Download protocol config file (e.g. WireGuard .conf)',
  })
  async downloadConfig(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    await this.clientsService.findOne(id, req.user.id, req.user.role);
    const file = await this.clientOutput.getConfigFile(id, 'clientId');
    if (!file) {
      throw new NotFoundException('No downloadable config for this client');
    }
    res.setHeader('Content-Type', file.contentType);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${file.filename.replace(/"/g, '')}"`,
    );
    return res.send(file.configText);
  }

  @Get(':id/qrcode')
  @ApiOperation({ summary: 'Get QR Code for Client Subscription' })
  getQrCode(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.clientsService.getQrCode(id, req.user.id, req.user.role);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update client' })
  update(
    @Req() req: AuthRequest,
    @Param('id') id: string,
    @Body() dto: UpdateClientDto,
  ) {
    return this.clientsService.update(id, req.user.id, req.user.role, dto);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete client' })
  remove(@Req() req: AuthRequest, @Param('id') id: string) {
    return this.clientsService.remove(id, req.user.id, req.user.role);
  }
}
