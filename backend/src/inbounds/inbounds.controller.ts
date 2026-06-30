import {
  Controller,
  Get,
  Patch,
  Param,
  Body,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { InboundsService } from './inbounds.service';
import type { AuthRequest } from '../common/auth-request';

@ApiTags('Inbounds')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'))
@Controller('inbounds')
export class InboundsController {
  constructor(private inboundsService: InboundsService) {}

  @Get()
  @ApiOperation({ summary: 'List inbounds (scoped by role)' })
  findAll(@Req() req: AuthRequest) {
    return this.inboundsService.findAll(req.user.id, req.user.role);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update an inbound (e.g. remark)' })
  update(@Param('id') id: string, @Body() dto: { remark?: string }) {
    return this.inboundsService.update(id, dto);
  }
}
