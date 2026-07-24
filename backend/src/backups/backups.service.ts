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
import axios from 'axios';
import { HmctlClient } from '../settings/hmctl.client';
import { PrismaService } from '../prisma/prisma.service';
import { getAppVersion } from '../common/utils/app-version';

const execPromise = promisify(exec);

export type HmPanelBackupType = 'full' | 'database' | 'config';

export interface PanelDbExportResult {
  buffer: Buffer;
  source: 'getDb' | 'getMigration';
  format: 'sqlite' | 'sql-dump';
  extension: '.db' | '.dump';
  note?: string;
}

export interface StoredPanelDbBackup {
  fileName: string;
  filePath: string;
  size: number;
  checksum: string;
  exportSource: PanelDbExportResult['source'];
  exportFormat: PanelDbExportResult['format'];
  exportNote?: string;
}

/**
 * Single backup/restore engine for Community + Premium Backup Center.
 * Premium must only orchestrate (schedule/GFS/Telegram/UI) — not reimplement this.
 */
@Injectable()
export class BackupsService {
  private readonly logger = new Logger(BackupsService.name);
  private readonly backupsDir =
    process.env.BACKUP_PATH || path.join(process.cwd(), 'backups');

  constructor(
    private readonly hmctl: HmctlClient,
    private readonly prisma: PrismaService,
  ) {
    if (!fs.existsSync(this.backupsDir)) {
      fs.mkdirSync(this.backupsDir, { recursive: true });
    }
  }

  getBackupsDirectory(): string {
    return this.backupsDir;
  }

  /** Prefer Nest response body over generic "Bad Request Exception". */
  private errorMessage(error: unknown): string {
    if (!error) return 'Unknown error';
    const anyErr = error as {
      message?: string;
      getResponse?: () => string | { message?: string | string[] };
    };
    if (typeof anyErr.getResponse === 'function') {
      const res = anyErr.getResponse();
      if (typeof res === 'string' && res.trim()) return res;
      if (res && typeof res === 'object') {
        const msg = res.message;
        if (Array.isArray(msg) && msg.length) return msg.join('; ');
        if (typeof msg === 'string' && msg.trim()) return msg;
      }
    }
    if (typeof anyErr.message === 'string' && anyErr.message.trim()) {
      return anyErr.message;
    }
    return String(error);
  }

  /** Filesystem + shell-safe basename (keeps last extension segment(s)). */
  private sanitizeUploadBaseName(originalName: string): string {
    const base = path.basename(originalName || 'upload.bin');
    const cleaned = base.replace(/[^\w.\-()+]+/g, '_').replace(/_+/g, '_');
    return cleaned || `upload-${Date.now()}.bin`;
  }

  private sniffUploadKind(
    filePath: string,
    originalName: string,
  ): 'hmpanel-tar' | 'hmpanel-sql' | 'panel-db' | 'panel-dump' | 'unknown' {
    const lower = originalName.toLowerCase();
    const head = Buffer.alloc(16);
    let n = 0;
    try {
      const fd = fs.openSync(filePath, 'r');
      try {
        n = fs.readSync(fd, head, 0, 16, 0);
      } finally {
        fs.closeSync(fd);
      }
    } catch {
      /* fall through to extension */
    }
    const bytes = head.subarray(0, n);
    if (
      bytes.length >= 16 &&
      bytes.subarray(0, 15).toString('utf8') === 'SQLite format 3'
    ) {
      return 'panel-db';
    }
    // gzip magic — HMPanel .tar.gz / .sql.gz
    if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
      if (lower.endsWith('.sql.gz') || lower.endsWith('.sql')) return 'hmpanel-sql';
      return 'hmpanel-tar';
    }
    const textHead = bytes.toString('utf8').trim();
    if (
      textHead.startsWith('--') ||
      /^(PRAGMA|BEGIN|CREATE|INSERT)\b/i.test(textHead)
    ) {
      return lower.endsWith('.dump') || /dump/i.test(lower)
        ? 'panel-dump'
        : 'hmpanel-sql';
    }
    if (lower.endsWith('.db')) return 'panel-db';
    if (lower.endsWith('.dump')) return 'panel-dump';
    if (lower.endsWith('.tar.gz') || lower.endsWith('.tgz')) return 'hmpanel-tar';
    if (lower.endsWith('.sql.gz') || lower.endsWith('.sql')) return 'hmpanel-sql';
    return 'unknown';
  }

  private findSqlDumpInDir(dir: string): string | null {
    const stack = [dir];
    while (stack.length) {
      const cur = stack.pop()!;
      let entries: fs.Dirent[];
      try {
        entries = fs.readdirSync(cur, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const ent of entries) {
        const full = path.join(cur, ent.name);
        if (ent.isDirectory()) {
          stack.push(full);
          continue;
        }
        const n = ent.name.toLowerCase();
        if (n.endsWith('.sql.gz') || n.endsWith('.sql')) return full;
      }
    }
    return null;
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

  // ─── HMPanel archive create ─────────────────────────────────────────────

  async generateBackup(type: HmPanelBackupType = 'full') {
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
          this.logger.log('Archiving uploads...');
          const uploadsFile = path.join(tempDir, 'uploads.tar.gz');
          await execPromise(`tar -czf "${uploadsFile}" -C "${uploadsDir}" .`);
          checksums['uploads.tar.gz'] =
            await this.calculateChecksum(uploadsFile);
          components.push('uploads.tar.gz');
        }

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
            } else if (fs.existsSync(premiumFile)) {
              fs.unlinkSync(premiumFile);
            }
          } catch (err: any) {
            this.logger.warn(`Premium archive skipped: ${err.message}`);
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
        type,
        domain: process.env.PANEL_DOMAIN || 'localhost',
        components: [...new Set([...Object.keys(checksums), ...components])],
        checksums,
      };

      fs.writeFileSync(
        path.join(tempDir, 'manifest.json'),
        JSON.stringify(manifest, null, 2),
      );

      await execPromise(`tar -czf "${backupFile}" -C "${tempDir}" .`);
      this.logger.log(`Backup completed: ${backupFile}`);
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

  // ─── Analyze (HMPanel archive OR 3x-ui panel .db/.dump) ─────────────────

  async analyzeBackup(file: Express.Multer.File) {
    const displayName = path.basename(file.originalname || 'upload.tar.gz');
    const safeName = this.sanitizeUploadBaseName(displayName);
    const tempId = Date.now().toString();
    const storedName = `temp-restore-${tempId}-${safeName}`;
    const { tempFilePath, sizeBytes } = await this.storeUploadedTemp(
      file,
      storedName,
    );

    if (!sizeBytes) {
      try {
        fs.unlinkSync(tempFilePath);
      } catch {
        /* ignore */
      }
      throw new BadRequestException('Uploaded file is empty');
    }

    const kind = this.sniffUploadKind(tempFilePath, displayName);
    this.logger.log(
      `Analyzing backup kind=${kind} file=${tempFilePath} (${sizeBytes} bytes)`,
    );

    try {
      if (kind === 'panel-db' || kind === 'panel-dump') {
        return await this.analyzePanelDbUploadFromPath(
          tempFilePath,
          storedName,
          displayName,
          sizeBytes,
          kind === 'panel-db',
        );
      }
      if (kind === 'hmpanel-sql' || kind === 'hmpanel-tar') {
        const analysis = await this.analyzeHmPanelArchiveFromPath(
          tempFilePath,
          storedName,
          displayName,
          sizeBytes,
          kind === 'hmpanel-sql',
          tempId,
        );
        return {
          ...analysis,
          restoreTarget: 'hmpanel' as const,
          previewKind: analysis.isLegacy ? 'legacy' : 'hmpanel-archive',
          canApplyToHmpanel: true,
        };
      }
      throw new BadRequestException(
        'Unsupported file format. Upload .tar.gz / .sql.gz (HMPanel) or .db / .dump (3x-ui panel).',
      );
    } catch (error: unknown) {
      if (fs.existsSync(tempFilePath)) {
        try {
          fs.unlinkSync(tempFilePath);
        } catch {
          /* ignore */
        }
      }
      const detail = this.errorMessage(error);
      // Avoid "Failed to analyze backup: Failed to analyze backup: ..."
      if (/failed to analyze backup/i.test(detail)) {
        throw new BadRequestException(detail);
      }
      throw new BadRequestException(`Failed to analyze backup: ${detail}`);
    }
  }

  private async storeUploadedTemp(
    file: Express.Multer.File,
    storedName: string,
  ): Promise<{ tempFilePath: string; sizeBytes: number }> {
    const tempFilePath = path.join(this.backupsDir, storedName);
    if (file.path && fs.existsSync(file.path)) {
      try {
        fs.renameSync(file.path, tempFilePath);
      } catch (err: any) {
        // Cross-device rename (EXDEV) — copy then remove staging file
        if (err?.code === 'EXDEV') {
          fs.copyFileSync(file.path, tempFilePath);
          fs.unlinkSync(file.path);
        } else {
          throw err;
        }
      }
    } else if (file.buffer) {
      fs.writeFileSync(tempFilePath, file.buffer);
    } else {
      throw new BadRequestException('Uploaded file is empty or unreadable');
    }
    return { tempFilePath, sizeBytes: fs.statSync(tempFilePath).size };
  }

  private async analyzeHmPanelArchiveFromPath(
    tempFilePath: string,
    storedName: string,
    displayName: string,
    sizeBytes: number,
    isSqlOnly: boolean,
    tempId: string,
  ) {
    const counts = {
      admin: 0,
      panel: 0,
      inbound: 0,
      store: 0,
      brand: 0,
      domain: 0,
      client: 0,
    };

    const extractCounts = async (sqlFile: string) => {
      const isGz = sqlFile.toLowerCase().endsWith('.gz');
      // Prefer gzip -dc (always on Alpine); fall back to zcat/cat
      const catCmd = isGz ? 'gzip -dc' : 'cat';
      const awkScript = [
        '/^COPY public\\."Admin" / { in_admin=1; next }',
        '/^COPY public\\."Panel" / { in_panel=1; next }',
        '/^COPY public\\."Inbound" / { in_inbound=1; next }',
        '/^COPY public\\."Client" / { in_client=1; next }',
        '/^COPY public\\."StoreProfile" / { in_store=1; next }',
        '/^COPY public\\."Brand" / { in_brand=1; next }',
        '/^COPY public\\."Domain" / { in_domain=1; next }',
        '/^\\\\\\./ { in_admin=0; in_panel=0; in_inbound=0; in_client=0; in_store=0; in_brand=0; in_domain=0; next }',
        'in_admin { admin_count++ }',
        'in_panel { panel_count++ }',
        'in_inbound { inbound_count++ }',
        'in_client { client_count++ }',
        'in_store { store_count++ }',
        'in_brand { brand_count++ }',
        'in_domain { domain_count++ }',
        '/^INSERT INTO "Admin"/ { admin_count++ }',
        '/^INSERT INTO "Panel"/ { panel_count++ }',
        '/^INSERT INTO "Inbound"/ { inbound_count++ }',
        '/^INSERT INTO "Client"/ { client_count++ }',
        '/^INSERT INTO "StoreProfile"/ { store_count++ }',
        '/^INSERT INTO "Brand"/ { brand_count++ }',
        '/^INSERT INTO "Domain"/ { domain_count++ }',
        'END { print "admin:" admin_count+0 ",panel:" panel_count+0 ",inbound:" inbound_count+0 ",client:" client_count+0 ",store:" store_count+0 ",brand:" brand_count+0 ",domain:" domain_count+0 }',
      ].join(' ');
      try {
        const { stdout } = await execPromise(
          `${catCmd} "${sqlFile}" | awk '${awkScript}'`,
          { maxBuffer: 64 * 1024 * 1024 },
        );
        const matches = stdout.match(
          /admin:(\d+),panel:(\d+),inbound:(\d+),client:(\d+),store:(\d+),brand:(\d+),domain:(\d+)/,
        );
        if (matches) {
          counts.admin = parseInt(matches[1], 10);
          counts.panel = parseInt(matches[2], 10);
          counts.inbound = parseInt(matches[3], 10);
          counts.client = parseInt(matches[4], 10);
          counts.store = parseInt(matches[5], 10);
          counts.brand = parseInt(matches[6], 10);
          counts.domain = parseInt(matches[7], 10);
        }
      } catch (e: any) {
        this.logger.warn('Failed to extract counts: ' + e.message);
      }
    };

    if (isSqlOnly) {
      await extractCounts(tempFilePath);
      return {
        id: storedName,
        fileName: displayName,
        type: 'database',
        sizeBytes,
        uploadDate: new Date(),
        isLegacy: true,
        counts,
        components: ['database'],
        warnings: ['Legacy SQL backup format. Full rollback may be limited.'],
      };
    }

    const tempExtractDir = path.join(this.backupsDir, `temp_extract_${tempId}`);
    fs.mkdirSync(tempExtractDir, { recursive: true });
    try {
      try {
        await execPromise(
          `tar -xzf "${tempFilePath}" -C "${tempExtractDir}"`,
          { maxBuffer: 16 * 1024 * 1024 },
        );
      } catch (tarErr: any) {
        throw new BadRequestException(
          `Archive is not a valid gzip tar (.tar.gz): ${tarErr?.message || tarErr}`,
        );
      }

      let manifest: any = null;
      const manifestPath = path.join(tempExtractDir, 'manifest.json');
      if (fs.existsSync(manifestPath)) {
        try {
          manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
        } catch {
          throw new BadRequestException(
            'Backup manifest.json is corrupted or not valid JSON',
          );
        }
      }

      const dbPath = this.findSqlDumpInDir(tempExtractDir);
      if (dbPath) await extractCounts(dbPath);
      else if (!manifest) {
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

      const warnings: string[] = [];
      if (!manifest) {
        warnings.push('Older archive without manifest metadata.');
      }
      const isFull = (manifest?.type || 'full') === 'full';
      if (isFull && !hasUploads) {
        warnings.push(
          'No uploads.tar.gz — branding logos may be missing after restore.',
        );
      }
      if (isFull && !hasPremium) {
        warnings.push(
          'No premium.tar.gz — premium modules may need re-download after restore.',
        );
      }

      return {
        id: storedName,
        fileName: displayName,
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
    } finally {
      await execPromise(`rm -rf "${tempExtractDir}"`).catch(() => {});
    }
  }

  private async analyzePanelDbUploadFromPath(
    tempFilePath: string,
    storedName: string,
    displayName: string,
    sizeBytes: number,
    _forceSqlite: boolean,
  ) {
    const buf = fs.readFileSync(tempFilePath);
    const isSqlite =
      buf.length >= 16 &&
      buf.subarray(0, 15).toString('utf8') === 'SQLite format 3';
    const isDump =
      !isSqlite &&
      (/^(PRAGMA|BEGIN|CREATE|INSERT|--)/i.test(
        buf.subarray(0, 200).toString('utf8').trim(),
      ) ||
        displayName.toLowerCase().endsWith('.dump'));

    const counts = {
      admin: 0,
      panel: 0,
      inbound: 0,
      client: 0,
      store: 0,
      brand: 0,
      domain: 0,
    };
    const warnings: string[] = [];

    if (isSqlite) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const Database = require('better-sqlite3');
        const db = new Database(tempFilePath, {
          readonly: true,
          fileMustExist: true,
        });
        try {
          const tables = db
            .prepare(
              `SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`,
            )
            .all() as Array<{ name: string }>;
          const tableNames = tables.map((t) => t.name.toLowerCase());
          const countTable = (candidates: string[]) => {
            const hit = candidates.find((c) =>
              tableNames.includes(c.toLowerCase()),
            );
            if (!hit) return 0;
            try {
              const row = db
                .prepare(`SELECT COUNT(*) AS c FROM "${hit}"`)
                .get() as { c: number };
              return Number(row?.c || 0);
            } catch {
              return 0;
            }
          };
          counts.inbound = countTable(['inbounds', 'inbound']);
          counts.client = countTable([
            'client_traffics',
            'clients',
            'client',
          ]);
          counts.panel = 1;
        } finally {
          db.close();
        }
      } catch (err: any) {
        warnings.push(`SQLite open failed for counts: ${err.message}`);
      }
    } else if (isDump) {
      warnings.push(
        'SQL dump from getMigration on SQLite panel. Prefer .db (getDb or PostgreSQL getMigration) for importDB.',
      );
    } else {
      try {
        fs.unlinkSync(tempFilePath);
      } catch {
        /* ignore */
      }
      throw new BadRequestException(
        'Not a valid 3x-ui SQLite .db or SQL .dump file',
      );
    }

    warnings.push(
      '3x-ui panel database — restore via importDB on a target panel (not HMPanel archive restore).',
    );

    let availablePanels: Array<{
      id: string;
      name: string;
      status: string | null;
      version: string | null;
    }> = [];
    try {
      availablePanels = await this.prisma.panel.findMany({
        select: { id: true, name: true, status: true, version: true },
        orderBy: { name: 'asc' },
      });
    } catch (err: any) {
      warnings.push(`Could not list panels for restore target: ${err.message}`);
    }

    return {
      id: storedName,
      fileName: displayName,
      type: 'panel-db',
      restoreTarget: '3x-ui' as const,
      previewKind: isSqlite ? 'panel-sqlite' : 'panel-dump',
      sizeBytes,
      uploadDate: new Date(),
      isLegacy: false,
      isSqlite,
      isDump,
      counts,
      panelClientCount: counts.client,
      panelInboundCount: counts.inbound,
      availablePanels,
      components: [isSqlite ? '3x-ui-sqlite.db' : '3x-ui.dump'],
      warnings,
      canApplyToHmpanel: false,
    };
  }

  // ─── Apply / restore ────────────────────────────────────────────────────

  /**
   * Unified apply entry: HMPanel archive OR 3x-ui panel DB (requires panelId).
   */
  async applyAnalyzedBackup(
    id: string,
    fileName?: string,
    opts?: { panelId?: string },
  ) {
    const safeId = path.basename(id);
    const filePath = path.join(this.backupsDir, safeId);

    if (fs.existsSync(filePath)) {
      const head = fs.readFileSync(filePath).subarray(0, 16);
      const isSqlite = head.toString('utf8').startsWith('SQLite format 3');
      const looksPanel =
        isSqlite ||
        safeId.toLowerCase().endsWith('.db') ||
        safeId.toLowerCase().endsWith('.dump') ||
        (fileName || '').toLowerCase().endsWith('.db') ||
        (fileName || '').toLowerCase().endsWith('.dump');

      if (looksPanel) {
        if (!opts?.panelId) {
          throw new BadRequestException(
            '3x-ui panel database requires panelId for importDB restore.',
          );
        }
        return this.importPanelDbToPanel(safeId, opts.panelId);
      }
    }

    return this.applyBackup(id, fileName);
  }

  async applyBackup(id: string, fileName?: string) {
    if (!id) throw new BadRequestException('Backup id is required');

    let backupFilePath: string | null = null;
    for (const name of [id, fileName].filter(Boolean) as string[]) {
      try {
        backupFilePath = await this.getBackupFilePath(name);
        break;
      } catch {
        /* next */
      }
    }
    if (!backupFilePath) {
      throw new NotFoundException(
        `Backup file not found for id=${id} fileName=${fileName || ''}`,
      );
    }

    const basename = path.basename(backupFilePath);
    this.logger.log(`Scheduling HMPanel restore of ${basename}`);

    setTimeout(() => {
      this.hmctl
        .execute('restore', basename, [], undefined, { timeoutMs: 900_000 })
        .then((res) =>
          this.logger.log(`Restore finished: ${JSON.stringify(res)}`),
        )
        .catch((err) =>
          this.logger.error('Failed to execute restore: ' + err.message),
        );
    }, 1500);

    return {
      success: true,
      message:
        'Restore initiated. The panel will restart shortly. Wait 1–2 minutes.',
      file: basename,
      restoreTarget: 'hmpanel' as const,
    };
  }

  // ─── 3x-ui panel DB (api342: getDb / getMigration / importDB) ───────────

  /**
   * Per api342.json:
   * - getDb → native SQLite file (SQLite-backed panels)
   * - getMigration → PostgreSQL → portable .db; SQLite → .dump
   */
  async fetchPanelDatabase(
    apiBaseUrl: string,
    apiToken?: string | null,
  ): Promise<PanelDbExportResult> {
    const base = apiBaseUrl.replace(/\/$/, '');
    const headers: Record<string, string> = {};
    if (apiToken) headers.Authorization = `Bearer ${apiToken}`;

    const isSqliteFile = (buf: Buffer) =>
      buf.length >= 16 &&
      buf.subarray(0, 15).toString('utf8') === 'SQLite format 3';
    const looksLikeJsonError = (buf: Buffer) => {
      const head = buf.subarray(0, Math.min(buf.length, 200)).toString('utf8').trim();
      return head.startsWith('{') && /"success"\s*:\s*false/i.test(head);
    };
    const looksLikeSqlDump = (buf: Buffer) => {
      const head = buf.subarray(0, Math.min(buf.length, 400)).toString('utf8').trim();
      return (
        head.startsWith('--') || /^(PRAGMA|BEGIN|CREATE|INSERT)\b/i.test(head)
      );
    };

    const get = async (suffix: string) =>
      axios.get(`${base}${suffix}`, {
        headers,
        responseType: 'arraybuffer',
        timeout: 180_000,
        maxContentLength: 512 * 1024 * 1024,
        validateStatus: (s) => s >= 200 && s < 300,
      });

    try {
      const res = await get('/panel/api/server/getDb');
      const buffer = Buffer.from(res.data);
      if (isSqliteFile(buffer)) {
        return {
          buffer,
          source: 'getDb',
          format: 'sqlite',
          extension: '.db',
          note: 'Native SQLite via getDb',
        };
      }
      this.logger.warn(
        looksLikeJsonError(buffer)
          ? 'getDb JSON error — trying getMigration (likely PostgreSQL panel)'
          : 'getDb not SQLite — trying getMigration',
      );
    } catch (err: any) {
      this.logger.warn(`getDb failed (${err.message}) — trying getMigration`);
    }

    const mig = await get('/panel/api/server/getMigration');
    const buffer = Buffer.from(mig.data);
    if (isSqliteFile(buffer)) {
      return {
        buffer,
        source: 'getMigration',
        format: 'sqlite',
        extension: '.db',
        note: 'PostgreSQL panel exported to portable SQLite via getMigration',
      };
    }
    if (looksLikeSqlDump(buffer)) {
      return {
        buffer,
        source: 'getMigration',
        format: 'sql-dump',
        extension: '.dump',
        note: 'SQL dump via getMigration (SQLite panel)',
      };
    }
    if (looksLikeJsonError(buffer)) {
      throw new Error(
        `getMigration failed: ${buffer.subarray(0, 300).toString('utf8')}`,
      );
    }
    throw new Error(
      'Panel did not return a usable database from getDb or getMigration',
    );
  }

  /** Download + store one panel DB under backups dir (shared by Community/Premium). */
  async downloadAndStorePanelDb(panel: {
    id: string;
    name: string;
    url?: string | null;
    apiBaseUrl?: string | null;
    apiToken?: string | null;
  }): Promise<StoredPanelDbBackup> {
    const apiBaseUrl = (panel.apiBaseUrl || panel.url || '').replace(/\/$/, '');
    if (!apiBaseUrl) throw new BadRequestException('Panel has no API URL');

    const fetched = await this.fetchPanelDatabase(apiBaseUrl, panel.apiToken);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeName = (panel.name || 'panel').replace(/[^a-zA-Z0-9_-]/g, '_');
    const fileName = `panel_${safeName}_${timestamp}${fetched.extension}`;
    const filePath = path.join(this.backupsDir, fileName);
    fs.writeFileSync(filePath, fetched.buffer);
    const checksum = await this.calculateChecksum(filePath);

    return {
      fileName,
      filePath,
      size: fs.statSync(filePath).size,
      checksum,
      exportSource: fetched.source,
      exportFormat: fetched.format,
      exportNote: fetched.note,
    };
  }

  /**
   * Restore SQLite .db onto a 3x-ui panel via POST /panel/api/server/importDB
   * (multipart field name "db" per api342). Destructive — panel restarts.
   */
  async importPanelDbToPanel(storedFileId: string, panelId: string) {
    const panel = await this.prisma.panel.findUnique({ where: { id: panelId } });
    if (!panel) throw new NotFoundException('Target panel not found');

    const filePath = path.join(this.backupsDir, path.basename(storedFileId));
    if (!fs.existsSync(filePath)) {
      throw new NotFoundException('Panel DB file not found');
    }

    const buf = fs.readFileSync(filePath);
    if (
      buf.length < 16 ||
      buf.subarray(0, 15).toString('utf8') !== 'SQLite format 3'
    ) {
      throw new BadRequestException(
        'importDB only accepts SQLite .db (api342). Use getDb or PostgreSQL getMigration export.',
      );
    }

    const apiBaseUrl = (panel.apiBaseUrl || panel.url || '').replace(/\/$/, '');
    if (!apiBaseUrl) throw new BadRequestException('Panel has no API URL');

    const uploadName = path.basename(filePath).endsWith('.db')
      ? path.basename(filePath)
      : 'x-ui.db';
    const form = new FormData();
    form.append('db', new Blob([buf]), uploadName);

    this.logger.log(
      `importDB → ${panel.name} ${apiBaseUrl}/panel/api/server/importDB`,
    );

    const res = await axios.post(
      `${apiBaseUrl}/panel/api/server/importDB`,
      form,
      {
        headers: {
          Authorization: panel.apiToken
            ? `Bearer ${panel.apiToken}`
            : undefined,
        },
        timeout: 300_000,
        maxContentLength: 512 * 1024 * 1024,
        maxBodyLength: 512 * 1024 * 1024,
        validateStatus: () => true,
      },
    );

    if (res.status >= 300 || res.data?.success === false) {
      throw new BadRequestException(
        `Panel importDB failed: ${res.data?.msg || res.statusText || res.status}`,
      );
    }

    return {
      success: true,
      message:
        'Panel database import started. The 3x-ui panel will restart shortly.',
      panelId: panel.id,
      panelName: panel.name,
      restoreTarget: '3x-ui' as const,
    };
  }
}
