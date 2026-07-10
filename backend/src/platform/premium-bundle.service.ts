import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface BundleManifest {
  version: string;
  sha256: string;
  minPanelVersion?: string;
  modules?: string[];
}

@Injectable()
export class PremiumBundleService {
  private readonly logger = new Logger(PremiumBundleService.name);

  getPremiumRoot(): string {
    const pluginPath = process.env.PREMIUM_PLUGIN_PATH || '/opt/hmpanel/premium/backend/index.js';
    return path.dirname(path.dirname(pluginPath));
  }

  getManifestPath(): string {
    return path.join(this.getPremiumRoot(), 'manifest.json');
  }

  isBundleInstalled(): boolean {
    const manifestPath = this.getManifestPath();
    const pluginPath = process.env.PREMIUM_PLUGIN_PATH || path.join(this.getPremiumRoot(), 'backend', 'index.js');
    return fs.existsSync(manifestPath) && fs.existsSync(pluginPath);
  }

  getInstalledVersion(): string | null {
    try {
      const manifest = JSON.parse(fs.readFileSync(this.getManifestPath(), 'utf8')) as BundleManifest;
      return manifest.version || null;
    } catch {
      return null;
    }
  }

  /**
   * Download and install premium bundle tarball.
   * Called only from license activation and manual "Update premium bundle" — never from heartbeat/runtime.
   */
  async downloadAndInstall(
    downloadUrl: string,
    expectedSha256: string | null,
    version: string,
    onProgress?: (pct: number, stage: string) => void,
  ): Promise<void> {
    const root = this.getPremiumRoot();
    const workBase = this.getWritableWorkDir();
    const tmpDir = path.join(workBase, `premium-dl-${Date.now()}`);
    const archivePath = path.join(tmpDir, `premium-bundle-${version}.tar.gz`);

    fs.mkdirSync(tmpDir, { recursive: true });
    onProgress?.(5, 'downloading');

    try {
      const buf = await this.fetchBundleBuffer(downloadUrl);
      fs.writeFileSync(archivePath, buf);
      onProgress?.(40, 'verifying');

      const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
      if (expectedSha256 && expectedSha256 !== sha256) {
        throw new Error(`SHA256 mismatch: expected ${expectedSha256}, got ${sha256}`);
      }

      onProgress?.(55, 'extracting');
      const extractDir = path.join(tmpDir, 'extract');
      fs.mkdirSync(extractDir, { recursive: true });
      await this.extractTarGz(archivePath, extractDir);

      const staging = path.join(tmpDir, 'staging');
      if (fs.existsSync(path.join(extractDir, 'manifest.json'))) {
        fs.cpSync(extractDir, staging, { recursive: true });
      } else {
        const inner = fs.readdirSync(extractDir).find((n) =>
          fs.existsSync(path.join(extractDir, n, 'manifest.json')),
        );
        if (!inner) throw new Error('Invalid bundle: manifest.json not found');
        fs.cpSync(path.join(extractDir, inner), staging, { recursive: true });
      }

      onProgress?.(85, 'installing');
      // Docker volume is mounted at `root` — never rename the mount point (EBUSY).
      this.installIntoRoot(staging, root);

      const manifestPath = path.join(root, 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as BundleManifest;
      manifest.sha256 = sha256;
      manifest.version = version;
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

      onProgress?.(100, 'done');
      this.logger.log(`Premium bundle ${version} installed to ${root}`);
    } finally {
      try {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      } catch {
        /* cleanup best-effort */
      }
    }
  }

  /** Writable scratch dir — must not be a sibling of a Docker volume mount point. */
  private getWritableWorkDir(): string {
    const candidates = [
      process.env.PREMIUM_WORK_DIR,
      '/app/backups',
      path.join(process.cwd(), 'backups'),
      os.tmpdir(),
    ].filter((v): v is string => Boolean(v?.trim()));

    for (const dir of candidates) {
      try {
        fs.mkdirSync(dir, { recursive: true });
        fs.accessSync(dir, fs.constants.W_OK);
        return dir;
      } catch {
        /* try next */
      }
    }
    throw new Error('No writable directory for premium bundle download');
  }

  getWorkDirForDiagnostics(): string {
    try {
      return this.getWritableWorkDir();
    } catch {
      return '/app/backups';
    }
  }

  isPathWritable(dir: string): boolean {
    try {
      fs.mkdirSync(dir, { recursive: true });
      const probe = path.join(dir, `.write-test-${process.pid}`);
      fs.writeFileSync(probe, 'ok');
      fs.rmSync(probe, { force: true });
      return true;
    } catch {
      return false;
    }
  }

  /** Replace contents inside the install root without renaming the directory itself. */
  private installIntoRoot(staging: string, root: string): void {
    fs.mkdirSync(root, { recursive: true });
    this.clearDirectoryContents(root);
    for (const name of fs.readdirSync(staging)) {
      const src = path.join(staging, name);
      const dest = path.join(root, name);
      fs.cpSync(src, dest, { recursive: true });
    }
  }

  private clearDirectoryContents(dir: string): void {
    for (const name of fs.readdirSync(dir)) {
      fs.rmSync(path.join(dir, name), { recursive: true, force: true });
    }
  }

  private async fetchBundleBuffer(downloadUrl: string): Promise<Buffer> {
    if (!downloadUrl.includes('/v1/panel/bundle/download')) {
      throw new Error(
        'Invalid bundle download URL. Premium bundles must be fetched through the license server.',
      );
    }

    const res = await fetch(downloadUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': `HMPanel/${process.env.PANEL_VERSION || '1.5.6'}` },
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(
        `Bundle download failed (${res.status} ${res.statusText})` +
          (detail ? `: ${detail.slice(0, 200)}` : '') +
          '. Ensure the license server has GITHUB_TOKEN configured and your server IP matches the license.',
      );
    }

    return Buffer.from(await res.arrayBuffer());
  }

  /** Sync premium DB tables after bundle install (community schema includes overlay models). */
  async applyDatabaseOverlay(): Promise<void> {
    const schemaPath =
      process.env.PRISMA_SCHEMA_PATH ||
      path.join(process.cwd(), 'prisma', 'schema.prisma');
    if (!fs.existsSync(schemaPath)) {
      this.logger.warn(`Prisma schema not found at ${schemaPath} — skip DB sync`);
      return;
    }
    try {
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const exec = promisify(execFile);
      this.logger.log('Running prisma db push for premium tables…');
      await exec(
        process.platform === 'win32' ? 'npx.cmd' : 'npx',
        ['prisma', 'db', 'push', `--schema=${schemaPath}`, '--accept-data-loss'],
        {
          cwd: path.dirname(path.dirname(schemaPath)),
          timeout: 180_000,
          env: process.env as NodeJS.ProcessEnv,
        },
      );
      this.logger.log('Premium database tables synced.');
    } catch (err: any) {
      this.logger.warn(`Premium DB sync failed (will retry on restart): ${err?.message || err}`);
    }
  }

  private async extractTarGz(archivePath: string, destDir: string): Promise<void> {
    try {
      const tar = await import('tar');
      await tar.x({ file: archivePath, cwd: destDir });
      return;
    } catch (npmErr: any) {
      this.logger.warn(`npm tar extract failed (${npmErr.message}), trying system tar`);
    }

    await execFileAsync('tar', ['-xzf', archivePath, '-C', destDir], {
      timeout: 120_000,
      maxBuffer: 1024 * 1024,
    });
  }
}
