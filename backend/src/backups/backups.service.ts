import { Injectable, Logger, InternalServerErrorException, NotFoundException, BadRequestException } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

@Injectable()
export class BackupsService {
  private readonly logger = new Logger(BackupsService.name);
  private readonly backupsDir = process.env.BACKUP_PATH || path.join(process.cwd(), 'backups');

  constructor() {
    if (!fs.existsSync(this.backupsDir)) {
      fs.mkdirSync(this.backupsDir, { recursive: true });
    }
  }

  async generateBackup() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new InternalServerErrorException('DATABASE_URL is not configured');
    }

    const backupId = Date.now().toString();
    const backupFile = path.join(this.backupsDir, `backup-${backupId}.sql.gz`);

    try {
      this.logger.log(`Starting backup: ${backupFile}`);
      // pg_dump the entire database to a gzipped file
      await execAsync(`pg_dump "${databaseUrl}" -cO --if-exists | gzip > "${backupFile}"`);
      this.logger.log(`Backup completed successfully: ${backupFile}`);
      return { id: backupId, file: `backup-${backupId}.sql.gz` };
    } catch (error) {
      this.logger.error('Failed to generate backup', error);
      // Clean up failed file if it exists
      if (fs.existsSync(backupFile)) {
        fs.unlinkSync(backupFile);
      }
      throw new InternalServerErrorException('Failed to generate backup: ' + (error as Error).message);
    }
  }

  async getBackupFilePath(id: string) {
    // Strip out potential directory traversal
    const safeId = path.basename(id);
    let filePath = path.join(this.backupsDir, `backup-${safeId}.sql.gz`);
    
    if (!fs.existsSync(filePath)) {
      filePath = path.join(this.backupsDir, `backup-${safeId}.gz`);
      if (!fs.existsSync(filePath)) {
        throw new NotFoundException('Backup file not found');
      }
    }
    return filePath;
  }

  async restoreBackup(file: Express.Multer.File) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new InternalServerErrorException('DATABASE_URL is not configured');
    }

    const safeName = path.basename(file.originalname);
    const tempFilePath = path.join(this.backupsDir, `temp-restore-${Date.now()}-${safeName}`);
    fs.writeFileSync(tempFilePath, file.buffer);

    try {
      this.logger.log(`Starting restore from file: ${tempFilePath}`);
      
      let command = '';
      if (tempFilePath.endsWith('.gz')) {
        command = `zcat "${tempFilePath}" | psql "${databaseUrl}" -v ON_ERROR_STOP=0`;
      } else if (tempFilePath.endsWith('.sql')) {
        command = `psql "${databaseUrl}" -v ON_ERROR_STOP=0 < "${tempFilePath}"`;
      } else {
        throw new BadRequestException('Unsupported file format. Please upload .sql or .sql.gz');
      }

      await execAsync(command);
      this.logger.log('Restore completed');
      
      // Clean up
      fs.unlinkSync(tempFilePath);
      return { success: true };
    } catch (error) {
      this.logger.error('Failed to restore backup', error);
      if (fs.existsSync(tempFilePath)) {
        fs.unlinkSync(tempFilePath);
      }
      throw new InternalServerErrorException('Failed to restore backup: ' + (error as Error).message);
    }
  }
}
