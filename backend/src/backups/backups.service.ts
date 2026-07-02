import {
  Injectable,
  Logger,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { spawn, exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { HmctlClient } from '../settings/hmctl.client';
const execPromise = promisify(exec);

@Injectable()
export class BackupsService {
  private readonly logger = new Logger(BackupsService.name);
  private readonly backupsDir =
    process.env.BACKUP_PATH || path.join(process.cwd(), 'backups');

  constructor(private readonly hmctl: HmctlClient) {
    if (!fs.existsSync(this.backupsDir)) {
      fs.mkdirSync(this.backupsDir, { recursive: true });
    }
  }

  private async calculateChecksum(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = fs.createReadStream(filePath);
      stream.on('error', (err) => reject(err));
      stream.on('data', (chunk) => hash.update(chunk));
      stream.on('end', () => resolve(hash.digest('hex')));
    });
  }

  async generateBackup(type: 'full' | 'database' | 'config' = 'full') {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new InternalServerErrorException('DATABASE_URL is not configured');
    }

    const parsedUrl = new URL(databaseUrl);
    parsedUrl.searchParams.delete('schema');
    const cleanDatabaseUrl = parsedUrl.toString();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupId = Date.now().toString();
    const backupFile = path.join(
      this.backupsDir,
      `backup_${type}_${timestamp}.tar.gz`,
    );
    const tempDir = path.join(this.backupsDir, `temp_${backupId}`);

    fs.mkdirSync(tempDir, { recursive: true });

    try {
      const checksums: Record<string, string> = {};

      if (type === 'full' || type === 'database') {
        const dbFile = path.join(tempDir, 'database.sql.gz');
        this.logger.log('Exporting database via docker exec...');
        const dbUser = process.env.POSTGRES_USER || 'panel_user';
        
        // Ensure the directory exists
        fs.mkdirSync(tempDir, { recursive: true });

        await execPromise(
          `docker exec hmpanel-postgres pg_dumpall -c -U ${dbUser} | gzip > "${dbFile}"`
        );
        
        checksums['database.sql.gz'] = await this.calculateChecksum(dbFile);
      }

      if (type === 'full' || type === 'config') {
        this.logger.log('Archiving configuration...');
        const confTemp = path.join(this.backupsDir, `temp_conf_${backupId}`);
        fs.mkdirSync(confTemp, { recursive: true });

        // Use standard Node.js path resolutions to find .env and nginx.
        // Assuming we are running from /app in the docker container.
        const appRoot = process.cwd();

        if (fs.existsSync(path.join(appRoot, '.env'))) {
          fs.copyFileSync(
            path.join(appRoot, '.env'),
            path.join(confTemp, '.env'),
          );
        }

        if (fs.existsSync(path.join(appRoot, 'nginx_host'))) {
          await execPromise(
            `cp -r "${path.join(appRoot, 'nginx_host')}" "${path.join(confTemp, 'nginx')}"`,
          );
        }

        const confFile = path.join(tempDir, 'config.tar.gz');
        await execPromise(`tar -czf "${confFile}" -C "${confTemp}" .`);
        await execPromise(`rm -rf "${confTemp}"`);

        checksums['config.tar.gz'] = await this.calculateChecksum(confFile);
      }

      let appVer = '1.0.0';
      try {
        const pkg = JSON.parse(
          fs.readFileSync(path.join(process.cwd(), 'package.json'), 'utf-8'),
        );
        appVer = pkg.version;
      } catch (e) {}

      const manifest = {
        version: appVer,
        schemaVersion: '1',
        timestamp: new Date().toISOString(),
        type: type,
        domain: process.env.PANEL_DOMAIN || 'localhost',
        checksums,
      };

      fs.writeFileSync(
        path.join(tempDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
      );

      this.logger.log('Creating final tar.gz archive...');
      await execPromise(`tar -czf "${backupFile}" -C "${tempDir}" .`);

      this.logger.log(`Backup completed successfully: ${backupFile}`);
      return {
        id: path.basename(backupFile),
        file: path.basename(backupFile),
        type,
        size: fs.statSync(backupFile).size,
      };
    } catch (error) {
      this.logger.error('Backup generation failed', error);
      throw new InternalServerErrorException('Backup failed: ' + error.message);
    } finally {
      if (fs.existsSync(tempDir)) {
        await execPromise(`rm -rf "${tempDir}"`).catch(() => {});
      }
    }
  }

  async getBackupFilePath(id: string) {
    // Strip out potential directory traversal
    const safeId = path.basename(id);
    let filePath = path.join(this.backupsDir, `backup-${safeId}.sql.gz`);

    if (!fs.existsSync(filePath)) {
      filePath = path.join(this.backupsDir, safeId);
      if (!fs.existsSync(filePath)) {
        throw new NotFoundException('Backup file not found');
      }
    }
    return filePath;
  }

  async analyzeBackup(file: Express.Multer.File) {
    const safeName = path.basename(file.originalname);
    if (
      !safeName.endsWith('.tar.gz') &&
      !safeName.endsWith('.sql.gz') &&
      !safeName.endsWith('.sql')
    ) {
      throw new BadRequestException(
        'Unsupported file format. Please upload .tar.gz, .sql, or .sql.gz',
      );
    }

    const tempId = Date.now().toString();
    const tempFilePath = path.join(
      this.backupsDir,
      `temp-restore-${tempId}-${safeName}`,
    );
    fs.writeFileSync(tempFilePath, file.buffer);

    this.logger.log(`Analyzing backup: ${tempFilePath}`);

    try {
      let counts = { admin: 0, panel: 0, inbound: 0 };

      const extractCounts = async (sqlFile: string) => {
        const catCmd = sqlFile.endsWith('.gz') ? 'zcat' : 'cat';
        const awkScript = `
          /^COPY public\\."Admin" / { in_admin=1; next }
          /^COPY public\\."Panel" / { in_panel=1; next }
          /^COPY public\\."Inbound" / { in_inbound=1; next }
          /^\\\\\\./ { in_admin=0; in_panel=0; in_inbound=0; next }
          in_admin { admin_count++ }
          in_panel { panel_count++ }
          in_inbound { inbound_count++ }
          /^INSERT INTO "Admin"/ { admin_count++ }
          /^INSERT INTO "Panel"/ { panel_count++ }
          /^INSERT INTO "Inbound"/ { inbound_count++ }
          /^INSERT INTO \\\`Admin\\\`/ { admin_count++ }
          /^INSERT INTO \\\`Panel\\\`/ { panel_count++ }
          /^INSERT INTO \\\`Inbound\\\`/ { inbound_count++ }
          END { print "admin:" admin_count+0 ",panel:" panel_count+0 ",inbound:" inbound_count+0 }
        `;
        try {
          const { stdout } = await execPromise(`${catCmd} "${sqlFile}" | awk '${awkScript.replace(/\n/g, ' ')}'`);
          const matches = stdout.match(/admin:(\d+),panel:(\d+),inbound:(\d+)/);
          if (matches) {
            counts.admin = parseInt(matches[1], 10);
            counts.panel = parseInt(matches[2], 10);
            counts.inbound = parseInt(matches[3], 10);
          }
        } catch (e) {
          this.logger.warn('Failed to extract counts: ' + e.message);
        }
      };

      if (safeName.endsWith('.sql') || safeName.endsWith('.sql.gz')) {
        // Legacy Support
        await extractCounts(tempFilePath);
        return {
          id: `temp-restore-${tempId}-${safeName}`,
          fileName: safeName,
          type: 'database',
          sizeBytes: file.size,
          uploadDate: new Date(),
          isLegacy: true,
          counts,
          warnings: [
            'This is a legacy SQL backup format. Full rollback functionality may be limited.',
          ],
        };
      }

      // New format .tar.gz
      const tempExtractDir = path.join(
        this.backupsDir,
        `temp_extract_${tempId}`,
      );
      fs.mkdirSync(tempExtractDir, { recursive: true });

      await execPromise(
        `tar -xzf "${tempFilePath}" -C "${tempExtractDir}"`,
      );

      let manifest: any = null;
      if (fs.existsSync(path.join(tempExtractDir, 'manifest.json'))) {
        const manifestStr = fs.readFileSync(
          path.join(tempExtractDir, 'manifest.json'),
          'utf-8',
        );
        manifest = JSON.parse(manifestStr);
      }

      let dbPath: string | null = null;
      try {
        const { stdout } = await execPromise(
          `find "${tempExtractDir}" -type f \\( -name "*.sql.gz" -o -name "*.sql" \\) | head -n 1`,
        );
        if (stdout.trim()) {
          dbPath = stdout.trim();
        }
      } catch (e) {
        this.logger.warn('Failed to search for sql files: ' + e.message);
      }

      if (dbPath) {
        await extractCounts(dbPath);
      } else if (!manifest) {
        throw new BadRequestException(
          'Invalid backup archive: missing manifest.json and no SQL dump found',
        );
      }

      await execPromise(`rm -rf "${tempExtractDir}"`);

      if (!manifest) {
        return {
          id: `temp-restore-${tempId}-${safeName}`,
          fileName: safeName,
          type: 'full',
          sizeBytes: file.size,
          uploadDate: new Date(),
          isLegacy: true,
          counts,
          warnings: [
            'This backup was created with an older version (Legacy tar.gz). Metadata is not available.',
          ],
        };
      }

      return {
        id: `temp-restore-${tempId}-${safeName}`,
        fileName: safeName,
        type: manifest.type || 'full',
        domain: manifest.domain,
        version: manifest.version,
        schemaVersion: manifest.schemaVersion,
        sizeBytes: file.size,
        uploadDate: new Date(manifest.timestamp || Date.now()),
        isLegacy: false,
        counts,
        warnings: [],
      };
    } catch (error) {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      throw new BadRequestException(
        `Failed to analyze backup: ${error.message}`,
      );
    }
  }

  async restoreBackup(backupId: string) {
    throw new BadRequestException(
      'To perform a full transactional restore, please run "hm restore" on the host server CLI. The web UI currently only supports downloading backups.',
    );
  }

  async applyBackup(id: string, fileName: string) {
    const backupFilePath = await this.getBackupFilePath(fileName);
    
    // We execute the restore asynchronously because it will stop this very container
    setTimeout(() => {
      this.hmctl.execute('restore', backupFilePath).catch(err => {
        this.logger.error('Failed to execute restore: ' + err.message);
      });
    }, 1000);

    return {
      success: true,
      message: 'Restore initiated. The panel will restart shortly.',
    };
  }
}
