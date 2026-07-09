import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

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

  async downloadAndInstall(
    downloadUrl: string,
    expectedSha256: string | null,
    version: string,
    onProgress?: (pct: number, stage: string) => void,
  ): Promise<void> {
    const root = this.getPremiumRoot();
    const tmpDir = path.join(root, '..', `premium-dl-${Date.now()}`);
    const archivePath = path.join(tmpDir, `premium-bundle-${version}.tar.gz`);

    fs.mkdirSync(tmpDir, { recursive: true });
    onProgress?.(5, 'downloading');

    const res = await fetch(downloadUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': `HMPanel/${process.env.PANEL_VERSION || '1.5.6'}` },
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      throw new Error(
        `Bundle download failed (${res.status} ${res.statusText}). Check license server GitHub token and premium release asset.`,
      );
    }

    const buf = Buffer.from(await res.arrayBuffer());
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
    const backup = `${root}.bak-${Date.now()}`;
    if (fs.existsSync(root)) {
      fs.renameSync(root, backup);
    }
    fs.mkdirSync(path.dirname(root), { recursive: true });
    fs.cpSync(staging, root, { recursive: true });

    const manifestPath = path.join(root, 'manifest.json');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as BundleManifest;
    manifest.sha256 = sha256;
    manifest.version = version;
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    onProgress?.(100, 'done');
    this.logger.log(`Premium bundle ${version} installed to ${root}`);

    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      if (fs.existsSync(backup)) fs.rmSync(backup, { recursive: true, force: true });
    } catch {
      /* cleanup best-effort */
    }
  }

  /** Best-effort DB sync after premium overlay models are installed. */
  async applyDatabaseOverlay(): Promise<void> {
    const overlay = path.join(this.getPremiumRoot(), 'prisma', 'premium.overlay.prisma');
    if (!fs.existsSync(overlay)) {
      this.logger.log('No premium prisma overlay in bundle — skipping DB sync');
      return;
    }
    this.logger.log('Premium bundle installed. Database will sync on next panel restart (prisma db push).');
  }

  private async extractTarGz(archivePath: string, destDir: string): Promise<void> {
    await this.extractTarGzNode(archivePath, destDir);
  }

  private async extractTarGzNode(archivePath: string, destDir: string): Promise<void> {
    const tar = await import('tar');
    await tar.x({ file: archivePath, cwd: destDir });
  }
}
