import { Injectable, Logger, InternalServerErrorException, NotFoundException, BadRequestException } from '@nestjs/common';
import { spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as zlib from 'zlib';
import { Readable } from 'stream';

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

    return new Promise((resolve, reject) => {
      this.logger.log(`Starting backup: ${backupFile}`);
      
      const pgDump = spawn('pg_dump', [databaseUrl, '-cO', '--if-exists'], { shell: false });
      const gzip = zlib.createGzip();
      const outStream = fs.createWriteStream(backupFile);

      let errorMsg = '';

      pgDump.stderr.on('data', (data) => {
        errorMsg += data.toString();
      });

      pgDump.on('error', (err) => {
        if (fs.existsSync(backupFile)) fs.unlinkSync(backupFile);
        reject(new InternalServerErrorException('pg_dump failed to start: ' + err.message));
      });

      pgDump.on('close', (code) => {
        if (code !== 0) {
          if (fs.existsSync(backupFile)) fs.unlinkSync(backupFile);
          reject(new InternalServerErrorException(`pg_dump exited with code ${code}: ${errorMsg}`));
          return;
        }
      });

      // Pipeline
      pgDump.stdout.pipe(gzip).pipe(outStream)
        .on('finish', () => {
          if (errorMsg && errorMsg.toLowerCase().includes('error')) {
            this.logger.warn(`pg_dump had warnings: ${errorMsg}`);
          }
          this.logger.log(`Backup completed successfully: ${backupFile}`);
          resolve({ id: backupId, file: `backup-${backupId}.sql.gz` });
        })
        .on('error', (err) => {
          if (fs.existsSync(backupFile)) fs.unlinkSync(backupFile);
          reject(new InternalServerErrorException('Failed to write backup file: ' + err.message));
        });
    });
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
    const isGzip = safeName.endsWith('.gz');
    if (!isGzip && !safeName.endsWith('.sql')) {
      throw new BadRequestException('Unsupported file format. Please upload .sql or .sql.gz');
    }

    return new Promise((resolve, reject) => {
      this.logger.log(`Starting restore from uploaded file`);
      
      const psql = spawn('psql', [databaseUrl, '-v', 'ON_ERROR_STOP=0'], { shell: false });
      
      let errorMsg = '';
      psql.stderr.on('data', (data) => {
        errorMsg += data.toString();
      });

      psql.on('error', (err) => {
        reject(new InternalServerErrorException('psql failed to start: ' + err.message));
      });

      psql.on('close', (code) => {
        if (code !== 0 && code !== 3) {
          reject(new InternalServerErrorException(`psql exited with code ${code}: ${errorMsg}`));
        } else {
          this.logger.log('Restore completed');
          resolve({ success: true });
        }
      });

      const inStream = Readable.from(file.buffer);
      
      if (isGzip) {
        const gunzip = zlib.createGunzip();
        inStream.pipe(gunzip).pipe(psql.stdin).on('error', (err) => {
           reject(new InternalServerErrorException('Failed to extract backup: ' + err.message));
        });
      } else {
        inStream.pipe(psql.stdin).on('error', (err) => {
           reject(new InternalServerErrorException('Failed to read backup: ' + err.message));
        });
      }
    });
  }
}
