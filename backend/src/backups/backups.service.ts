import {
  Injectable,
  Logger,
  InternalServerErrorException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { exec } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { promisify } from 'util';
import { HmctlClient } from '../settings/hmctl.client';
import { getAppVersion } from '../common/utils/app-version';

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

  async calculateChecksum(filePath: string): Promise<string> {
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

        fs.mkdirSync(tempDir, { recursive: true });

        await execPromise(
          `docker exec hmpanel-postgres pg_dumpall -c -U ${dbUser} | gzip > "${dbFile}"`,
        );

        checksums['database.sql.gz'] = await this.calculateChecksum(dbFile);
      }

      if (type === 'full' || type === 'config') {
        this.logger.log('Archiving configuration...');
        const confTemp = path.join(this.backupsDir, `temp_conf_${backupId}`);
        fs.mkdirSync(confTemp, { recursive: true });

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

        const acmeDir = path.join(appRoot, 'acme.sh');
        if (fs.existsSync(acmeDir)) {
          await execPromise(
            `cp -r "${acmeDir}" "${path.join(confTemp, 'acme.sh')}"`,
          );
        }

        const confFile = path.join(tempDir, 'config.tar.gz');
        await execPromise(`tar -czf "${confFile}" -C "${confTemp}" .`);
        await execPromise(`rm -rf "${confTemp}"`);

        checksums['config.tar.gz'] = await this.calculateChecksum(confFile);
      }

      const components: string[] = Object.keys(checksums);
      if (type === 'full') {
        const uploadsDir = path.join(process.cwd(), 'uploads');
        if (fs.existsSync(uploadsDir)) {
          this.logger.log('Archiving uploads (branding assets, etc.)...');
          const uploadsFile = path.join(tempDir, 'uploads.tar.gz');
          await execPromise(`tar -czf "${uploadsFile}" -C "${uploadsDir}" .`);
          checksums['uploads.tar.gz'] =
            await this.calculateChecksum(uploadsFile);
          components.push('uploads.tar.gz');
        } else {
          this.logger.warn(
            'Uploads directory missing — branding files will not be in this backup',
          );
        }

        // Premium plugin bundle (store, branding UI, backup-center, etc.)
        const premiumDir = '/opt/hmpanel/premium';
        if (fs.existsSync(premiumDir)) {
          this.logger.log('Archiving premium modules...');
          const premiumFile = path.join(tempDir, 'premium.tar.gz');
          try {
            await execPromise(
              `tar -czf "${premiumFile}" -C "${premiumDir}" .`,
            );
            if (
              fs.existsSync(premiumFile) &&
              fs.statSync(premiumFile).size > 32
            ) {
              checksums['premium.tar.gz'] =
                await this.calculateChecksum(premiumFile);
              components.push('premium.tar.gz');
            } else {
              fs.unlinkSync(premiumFile);
              this.logger.warn('Premium archive empty — skipped');
            }
          } catch (err: any) {
            this.logger.warn(
              `Could not archive premium volume: ${err.message}`,
            );
          }
        }

        const instanceCandidates = [
          path.join(this.backupsDir, '.hmpanel-instance-id'),
          path.join(process.cwd(), 'backups', '.hmpanel-instance-id'),
        ];
        for (const candidate of instanceCandidates) {
          if (fs.existsSync(candidate)) {
            fs.copyFileSync(
              candidate,
              path.join(tempDir, '.hmpanel-instance-id'),
            );
            components.push('.hmpanel-instance-id');
            break;
          }
        }
      }

      const manifest = {
        version: getAppVersion(),
        schemaVersion: '3',
        timestamp: new Date().toISOString(),
        type: type,
        domain: process.env.PANEL_DOMAIN || 'localhost',
        components: [...new Set([...Object.keys(checksums), ...components])],
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
    } catch (error: any) {
      this.logger.error('Backup generation failed', error);
      throw new InternalServerErrorException(
        'Backup failed: ' + (error?.message || error),
      );
    } finally {
      if (fs.existsSync(tempDir)) {
        await execPromise(`rm -rf "${tempDir}"`).catch(() => {});
      }
    }
  }

  async getBackupFilePath(id: string) {
    const safeId = path.basename(id);
    const candidates = [
      path.join(this.backupsDir, safeId),
      path.join(this.backupsDir, `backup-${safeId}.sql.gz`),
    ];
    for (const filePath of candidates) {
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        return filePath;
      }
    }
    throw new NotFoundException('Backup file not found');
  }

  /**
   * Analyze an uploaded backup. Supports multer memory (file.buffer) or disk (file.path).
   */
  async analyzeBackup(file: Express.Multer.File) {
    const safeName = path.basename(file.originalname || 'upload.tar.gz');
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
    const storedName = `temp-restore-${tempId}-${safeName}`;
    const tempFilePath = path.join(this.backupsDir, storedName);

    if (file.path && fs.existsSync(file.path)) {
      fs.renameSync(file.path, tempFilePath);
    } else if (file.buffer) {
      fs.writeFileSync(tempFilePath, file.buffer);
    } else {
      throw new BadRequestException('Uploaded file is empty or unreadable');
    }

    const sizeBytes = fs.statSync(tempFilePath).size;
    this.logger.log(`Analyzing backup: ${tempFilePath} (${sizeBytes} bytes)`);

    try {
      let counts = {
        admin: 0,
        panel: 0,
        inbound: 0,
        store: 0,
        brand: 0,
        domain: 0,
      };

      const extractCounts = async (sqlFile: string) => {
        const catCmd = sqlFile.endsWith('.gz') ? 'zcat' : 'cat';
        const awkScript = `
          /^COPY public\\."Admin" / { in_admin=1; next }
          /^COPY public\\."Panel" / { in_panel=1; next }
          /^COPY public\\."Inbound" / { in_inbound=1; next }
          /^COPY public\\."StoreProfile" / { in_store=1; next }
          /^COPY public\\."Brand" / { in_brand=1; next }
          /^COPY public\\."Domain" / { in_domain=1; next }
          /^\\\\\\./ { in_admin=0; in_panel=0; in_inbound=0; in_store=0; in_brand=0; in_domain=0; next }
          in_admin { admin_count++ }
          in_panel { panel_count++ }
          in_inbound { inbound_count++ }
          in_store { store_count++ }
          in_brand { brand_count++ }
          in_domain { domain_count++ }
          /^INSERT INTO "Admin"/ { admin_count++ }
          /^INSERT INTO "Panel"/ { panel_count++ }
          /^INSERT INTO "Inbound"/ { inbound_count++ }
          /^INSERT INTO "StoreProfile"/ { store_count++ }
          /^INSERT INTO "Brand"/ { brand_count++ }
          /^INSERT INTO "Domain"/ { domain_count++ }
          END { print "admin:" admin_count+0 ",panel:" panel_count+0 ",inbound:" inbound_count+0 ",store:" store_count+0 ",brand:" brand_count+0 ",domain:" domain_count+0 }
        `;
        try {
          const { stdout } = await execPromise(
            `${catCmd} "${sqlFile}" | awk '${awkScript.replace(/\n/g, ' ')}'`,
          );
          const matches = stdout.match(
            /admin:(\d+),panel:(\d+),inbound:(\d+),store:(\d+),brand:(\d+),domain:(\d+)/,
          );
          if (matches) {
            counts.admin = parseInt(matches[1], 10);
            counts.panel = parseInt(matches[2], 10);
            counts.inbound = parseInt(matches[3], 10);
            counts.store = parseInt(matches[4], 10);
            counts.brand = parseInt(matches[5], 10);
            counts.domain = parseInt(matches[6], 10);
          }
        } catch (e: any) {
          this.logger.warn('Failed to extract counts: ' + e.message);
        }
      };

      if (safeName.endsWith('.sql') || safeName.endsWith('.sql.gz')) {
        await extractCounts(tempFilePath);
        return {
          id: storedName,
          fileName: safeName,
          type: 'database',
          sizeBytes,
          uploadDate: new Date(),
          isLegacy: true,
          counts,
          components: ['database'],
          warnings: [
            'This is a legacy SQL backup format. Full rollback functionality may be limited.',
          ],
        };
      }

      const tempExtractDir = path.join(
        this.backupsDir,
        `temp_extract_${tempId}`,
      );
      fs.mkdirSync(tempExtractDir, { recursive: true });

      await execPromise(`tar -xzf "${tempFilePath}" -C "${tempExtractDir}"`);

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
      } catch (e: any) {
        this.logger.warn('Failed to search for sql files: ' + e.message);
      }

      if (dbPath) {
        await extractCounts(dbPath);
      } else if (!manifest) {
        throw new BadRequestException(
          'Invalid backup archive: missing manifest.json and no SQL dump found',
        );
      }

      const hasUploads = fs.existsSync(
        path.join(tempExtractDir, 'uploads.tar.gz'),
      );
      const hasPremium = fs.existsSync(
        path.join(tempExtractDir, 'premium.tar.gz'),
      );
      const hasInstanceId = fs.existsSync(
        path.join(tempExtractDir, '.hmpanel-instance-id'),
      );
      const components: string[] = Array.isArray(manifest?.components)
        ? manifest.components
        : [
            ...(fs.existsSync(path.join(tempExtractDir, 'database.sql.gz'))
              ? ['database.sql.gz']
              : []),
            ...(fs.existsSync(path.join(tempExtractDir, 'config.tar.gz'))
              ? ['config.tar.gz']
              : []),
            ...(hasUploads ? ['uploads.tar.gz'] : []),
            ...(hasPremium ? ['premium.tar.gz'] : []),
            ...(hasInstanceId ? ['.hmpanel-instance-id'] : []),
          ];

      await execPromise(`rm -rf "${tempExtractDir}"`);

      const warnings: string[] = [];
      if (!manifest) {
        warnings.push(
          'This backup was created with an older version (Legacy tar.gz). Metadata is not available.',
        );
      }
      const isFull = (manifest?.type || 'full') === 'full';
      if (isFull && !hasUploads) {
        warnings.push(
          'This archive has no uploads.tar.gz — branding logos and other uploaded assets will be missing after restore.',
        );
      }
      if (isFull && !hasPremium) {
        warnings.push(
          'This archive has no premium.tar.gz — premium modules (store, branding UI, etc.) will need to be re-downloaded after restore if they were installed.',
        );
      }

      return {
        id: storedName,
        fileName: safeName,
        type: manifest?.type || 'full',
        domain: manifest?.domain,
        version: manifest?.version,
        schemaVersion: manifest?.schemaVersion,
        sizeBytes,
        uploadDate: new Date(manifest?.timestamp || Date.now()),
        isLegacy: !manifest,
        counts,
        components,
        warnings,
      };
    } catch (error: any) {
      if (fs.existsSync(tempFilePath)) fs.unlinkSync(tempFilePath);
      throw new BadRequestException(
        `Failed to analyze backup: ${error.message}`,
      );
    }
  }

  async restoreBackup(_backupId: string) {
    throw new BadRequestException(
      'Use restore-apply after analyze-upload, or run "hm restore <file>" on the host.',
    );
  }

  /**
   * Apply a previously analyzed backup.
   * Critical: resolve by `id` (stored temp-restore-* name), not original fileName.
   * Host CLI receives the basename so it can find the bind-mounted backups dir.
   */
  async applyBackup(id: string, fileName?: string) {
    if (!id) {
      throw new BadRequestException('Backup id is required');
    }

    let backupFilePath: string | null = null;
    const candidates = [id, fileName].filter(Boolean) as string[];
    for (const name of candidates) {
      try {
        backupFilePath = await this.getBackupFilePath(name);
        break;
      } catch {
        /* try next */
      }
    }
    if (!backupFilePath) {
      throw new NotFoundException(
        `Backup file not found for id=${id} fileName=${fileName || ''}`,
      );
    }

    const basename = path.basename(backupFilePath);
    this.logger.log(
      `Scheduling restore of ${basename} (resolved from id=${id})`,
    );

    // Host `hm restore` runs after a short delay — this container may restart mid-restore
    setTimeout(() => {
      this.hmctl
        .execute('restore', basename, [], undefined, { timeoutMs: 900_000 })
        .then((res) => {
          this.logger.log(`Restore finished: ${JSON.stringify(res)}`);
        })
        .catch((err) => {
          this.logger.error('Failed to execute restore: ' + err.message);
        });
    }, 1500);

    return {
      success: true,
      message:
        'Restore initiated. The panel will restart shortly. Keep this page open and wait 1–2 minutes.',
      file: basename,
    };
  }
}
