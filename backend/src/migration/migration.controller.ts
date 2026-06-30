import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { MigrationService } from './migration.service';
import { RolesGuard, Roles } from '../common/roles.guard';
import type { AuthRequest } from '../common/auth-request';
import * as multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = path.join(process.cwd(), 'uploads', 'migration');
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    cb(null, `whale-backup-${Date.now()}.db`);
  },
});

@ApiTags('Migration')
@ApiBearerAuth()
@UseGuards(AuthGuard('jwt'), RolesGuard)
@Roles('SUPER_ADMIN')
@Controller('migration')
export class MigrationController {
  constructor(private readonly migrationService: MigrationService) {}

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage,
      fileFilter: (req, file, cb) => {
        if (!file.originalname.match(/\.db$/)) {
          return cb(
            new BadRequestException(
              'Only .db SQLite database files are allowed!',
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  @ApiOperation({ summary: 'Upload Whale Panel SQLite Backup (.db)' })
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
  async uploadBackup(@UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('File is required');
    return this.migrationService.validateBackup(file.path);
  }

  @Post('preview')
  @ApiOperation({ summary: 'Preview migration data from uploaded backup' })
  async preview(@Req() req: AuthRequest) {
    return this.migrationService.preview();
  }

  @Post('import')
  @ApiOperation({ summary: 'Import data from uploaded backup' })
  async importData(@Req() req: AuthRequest) {
    return this.migrationService.importData();
  }

  @Post('sync')
  @ApiOperation({ summary: 'Run post-import synchronization' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { createGroups: { type: 'boolean', default: true } },
    },
  })
  async runSync(@Req() req: AuthRequest) {
    const createGroups = req.body?.createGroups ?? true;
    return this.migrationService.runPostImportSync(createGroups);
  }
}
