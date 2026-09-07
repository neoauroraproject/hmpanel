import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import {
  getPanelVersion,
  isInstalledPanelAtLeast,
} from '../common/utils/panel-version.util';

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

  getInstalledSha256(): string | null {
    try {
      const manifest = JSON.parse(fs.readFileSync(this.getManifestPath(), 'utf8')) as BundleManifest;
      const sha = String(manifest.sha256 || '').trim().toLowerCase();
      return sha || null;
    } catch {
      return null;
    }
  }

  /**
   * True only when on-disk bundle matches the license-server target (version + sha when provided).
   * Same version string with a rebuilt tarball must NOT count as current.
   */
  isInstalledCurrent(targetVersion?: string | null, targetSha256?: string | null): boolean {
    if (!targetVersion || !this.isBundleInstalled()) return false;
    const installedVersion = this.getInstalledVersion();
    if (!installedVersion || installedVersion !== targetVersion) return false;
    const expectedSha = String(targetSha256 || '').trim().toLowerCase();
    if (!expectedSha) return true;
    const installedSha = this.getInstalledSha256();
    return !!installedSha && installedSha === expectedSha;
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

      this.assertMinPanelVersion(staging, version);

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
    this.validateStaging(staging);
    fs.mkdirSync(root, { recursive: true });

    const backupDir = path.join(root, '.bundle-backup');
    const stageDir = path.join(root, '.bundle-staging');

    try {
      if (fs.existsSync(stageDir)) fs.rmSync(stageDir, { recursive: true, force: true });
      fs.cpSync(staging, stageDir, { recursive: true });
      this.validateStaging(stageDir);

      this.backupCurrentRoot(root, backupDir);
      this.promoteStaging(root, stageDir);
    } catch (err) {
      this.logger.error(`Premium bundle install failed — attempting rollback: ${(err as Error).message}`);
      this.restoreBackup(root, backupDir);
      throw err;
    } finally {
      if (fs.existsSync(stageDir)) {
        try {
          fs.rmSync(stageDir, { recursive: true, force: true });
        } catch {
          /* best-effort */
        }
      }
    }
  }

  /** Restore the previous bundle after a failed install (best-effort). */
  rollbackToBackup(root = this.getPremiumRoot()): boolean {
    const backupDir = path.join(root, '.bundle-backup');
    if (!fs.existsSync(backupDir)) return false;
    try {
      this.restoreBackup(root, backupDir);
      this.logger.warn('Premium bundle rolled back to previous backup.');
      return true;
    } catch (err: any) {
      this.logger.error(`Premium bundle rollback failed: ${err?.message || err}`);
      return false;
    }
  }

  private assertMinPanelVersion(staging: string, bundleVersion: string): void {
    try {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(staging, 'manifest.json'), 'utf8'),
      ) as BundleManifest;
      const min = manifest.minPanelVersion?.trim();
      if (!min) return;
      const panelVersion = getPanelVersion();
      if (isInstalledPanelAtLeast(panelVersion, min)) return;
      throw new Error(
        `Premium bundle ${bundleVersion} requires panel ${min}+ (this panel is ${panelVersion}). Run hm update first.`,
      );
    } catch (err) {
      if (err instanceof Error && /requires panel/.test(err.message)) throw err;
      this.logger.warn(
        `Could not read bundle minPanelVersion: ${(err as Error)?.message || err}`,
      );
    }
  }

  private validateStaging(staging: string): void {
    const manifestPath = path.join(staging, 'manifest.json');
    const backendPath = path.join(staging, 'backend', 'index.js');
    if (!fs.existsSync(manifestPath)) {
      throw new Error('Invalid premium bundle: manifest.json missing');
    }
    if (!fs.existsSync(backendPath)) {
      throw new Error('Invalid premium bundle: backend/index.js missing');
    }
    const backendSrc = fs.readFileSync(backendPath, 'utf8');
    if (/PremiumBundleModule:\s*null/.test(backendSrc)) {
      throw new Error('Invalid premium bundle: compiled backend stub detected');
    }
  }

  private listInstallEntries(root: string): string[] {
    return fs.readdirSync(root).filter((name) => !name.startsWith('.bundle-'));
  }

  private backupCurrentRoot(root: string, backupDir: string): void {
    const entries = this.listInstallEntries(root);
    if (!entries.length) return;
    if (fs.existsSync(backupDir)) fs.rmSync(backupDir, { recursive: true, force: true });
    fs.mkdirSync(backupDir, { recursive: true });
    for (const name of entries) {
      fs.cpSync(path.join(root, name), path.join(backupDir, name), { recursive: true });
    }
  }

  private promoteStaging(root: string, stageDir: string): void {
    for (const name of this.listInstallEntries(root)) {
      fs.rmSync(path.join(root, name), { recursive: true, force: true });
    }
    for (const name of fs.readdirSync(stageDir)) {
      fs.cpSync(path.join(stageDir, name), path.join(root, name), { recursive: true });
    }
  }

  private restoreBackup(root: string, backupDir: string): void {
    if (!fs.existsSync(backupDir)) return;
    for (const name of this.listInstallEntries(root)) {
      fs.rmSync(path.join(root, name), { recursive: true, force: true });
    }
    for (const name of fs.readdirSync(backupDir)) {
      fs.cpSync(path.join(backupDir, name), path.join(root, name), { recursive: true });
    }
  }

  private clearDirectoryContents(dir: string): void {
    for (const name of this.listInstallEntries(dir)) {
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

  /**
   * Sync premium DB tables after bundle install (community schema includes overlay models).
   * Never use --accept-data-loss: premium/business rows must survive license gaps and server moves.
   */
  async applyDatabaseOverlay(): Promise<void> {
    const overlayScript = path.join(process.cwd(), 'backend/dist/scripts/apply-premium-schema-overlay.js');
    if (fs.existsSync(overlayScript)) {
      try {
        this.logger.log('Applying premium schema overlay (idempotent SQL)…');
        await execFileAsync(process.execPath, [overlayScript], {
          cwd: process.cwd(),
          timeout: 120_000,
          env: process.env as NodeJS.ProcessEnv,
        });
        this.logger.log('Premium schema overlay applied.');
      } catch (err: any) {
        this.logger.warn(
          `Premium schema overlay script failed (continuing): ${err?.message || err}`,
        );
      }
    }

    const schemaPath =
      process.env.PRISMA_SCHEMA_PATH ||
      path.join(process.cwd(), 'prisma', 'schema.prisma');
    if (!fs.existsSync(schemaPath)) {
      this.logger.warn(`Prisma schema not found at ${schemaPath} — skip DB sync`);
      return;
    }
    try {
      this.logger.log('Running prisma db push for premium tables (data-preserving)…');
      await execFileAsync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['prisma', 'db', 'push', `--schema=${schemaPath}`], {
        cwd: path.dirname(path.dirname(schemaPath)),
        timeout: 180_000,
        env: process.env as NodeJS.ProcessEnv,
      });
      this.logger.log('Premium database tables synced (existing rows preserved).');
    } catch (err: any) {
      this.logger.warn(
        `Premium DB sync skipped to preserve data (will retry on restart): ${err?.message || err}`,
      );
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
