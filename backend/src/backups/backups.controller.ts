import {
  Controller,
  Post,
  Get,
  Param,
  Res,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
  Body,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { RolesGuard, Roles } from '../common/roles.guard';
import { BackupsService } from './backups.service';
import type { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';

@ApiTags('Backups')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('SUPER_ADMIN')
@Controller('backups')
export class BackupsController {
  constructor(private readonly backupsService: BackupsService) {}

  @Post()
  @ApiOperation({ summary: 'Generate a new PostgreSQL backup' })
  async generateBackup() {
    return this.backupsService.generateBackup();
  }

  @Get(':id/download')
  @ApiOperation({ summary: 'Download a specific backup file' })
  async downloadBackup(@Param('id') id: string, @Res() res: Response) {
    const filePath = await this.backupsService.getBackupFilePath(id);
    res.download(filePath);
  }

  @Post('analyze-upload')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Upload and analyze a database backup before restoring',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async analyzeBackup(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }
    return this.backupsService.analyzeBackup(file);
  }

  @Post('restore-apply/:id')
  @ApiOperation({ summary: 'Apply a previously analyzed backup' })
  @ApiBody({
    schema: { type: 'object', properties: { fileName: { type: 'string' } } },
  })
  async applyBackup(
    @Param('id') id: string,
    @Body('fileName') fileName: string,
  ) {
    if (!fileName) {
      throw new BadRequestException('fileName is required');
    }
    return this.backupsService.applyBackup(id, fileName);
  }
}
