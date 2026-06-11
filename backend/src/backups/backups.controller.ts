import { Controller, Get, Post, Delete, Body, Param, UseGuards, UseInterceptors, UploadedFile, Res, ForbiddenException } from '@nestjs/common';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard, Roles } from '../common/roles.guard';
import { BackupsService } from './backups.service';

@ApiTags('Backups')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('SUPER_ADMIN')
@Controller('backups')
export class BackupsController {
  constructor(private backupsService: BackupsService) {}

  @Get()
  @ApiOperation({ summary: 'List backups' })
  findAll() {
    return this.backupsService.findAll();
  }

  @Post()
  @ApiOperation({ summary: 'Create a manual backup' })
  create(@Body() dto: { type?: 'postgres' | 'x-ui-db', panelId?: string }) {
    if (dto?.type === 'x-ui-db' && process.env.RELEASE_MODE === 'COMMUNITY') {
      throw new ForbiddenException('Remote Panel Backups are a Premium feature.');
    }
    return this.backupsService.create(dto?.type, 'manual', true, dto?.panelId);
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download backup file' })
  async download(@Param('id') id: string, @Res() res: Response) {
    const filePath = await this.backupsService.getDownloadPath(id);
    res.download(filePath);
  }

  @Post(':id/restore')
  @ApiOperation({ summary: 'Restore a backup' })
  restore(@Param('id') id: string) {
    return this.backupsService.restore(id);
  }

  @Post('restore-upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Restore platform from uploaded file' })
  uploadRestore(@UploadedFile() file: Express.Multer.File) {
    return this.backupsService.uploadPlatformRestore(file.buffer);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a backup' })
  remove(@Param('id') id: string) {
    return this.backupsService.remove(id);
  }
}
