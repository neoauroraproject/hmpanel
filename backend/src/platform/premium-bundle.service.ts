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

    const buf = await this.fetchBundleBuffer(downloadUrl, version);
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

  private async fetchBundleBuffer(downloadUrl: string, version: string): Promise<Buffer> {
    const res = await fetch(downloadUrl, {
      redirect: 'follow',
      headers: { 'User-Agent': `HMPanel/${process.env.PANEL_VERSION || '1.5.6'}` },
      signal: AbortSignal.timeout(120_000),
    });

    if (res.ok) {
      return Buffer.from(await res.arrayBuffer());
    }

    const canRetryGithub =
      (res.status === 404 || res.status === 403) &&
      (this.isPublicGithubReleaseUrl(downloadUrl) || !downloadUrl.includes('/v1/panel/bundle/download'));

    if (canRetryGithub && this.getGithubToken()) {
      this.logger.warn(
        `Bundle URL returned ${res.status} — retrying via GitHub API (private release).`,
      );
      return this.downloadFromGithubRelease(version);
    }

    throw new Error(
      `Bundle download failed (${res.status} ${res.statusText}). ` +
        'Deploy license server with GITHUB_TOKEN or set PREMIUM_BUNDLE_GITHUB_TOKEN on the panel.',
    );
  }

  private getGithubToken(): string | null {
    return (
      process.env.PREMIUM_BUNDLE_GITHUB_TOKEN?.trim() ||
      process.env.GITHUB_TOKEN?.trim() ||
      null
    );
  }

  private isPublicGithubReleaseUrl(url: string): boolean {
    return /github\.com\/[^/]+\/[^/]+\/releases\/download\//i.test(url);
  }

  private async downloadFromGithubRelease(version: string): Promise<Buffer> {
    const token = this.getGithubToken();
    if (!token) {
      throw new Error('PREMIUM_BUNDLE_GITHUB_TOKEN is not configured on the panel.');
    }

    const owner = process.env.PREMIUM_BUNDLE_REPO_OWNER?.trim() || 'neoauroraproject';
    const repo = process.env.PREMIUM_BUNDLE_REPO_NAME?.trim() || 'hmpanel-premium';
    const prefix = process.env.PREMIUM_BUNDLE_ASSET_PREFIX?.trim() || 'premium-bundle';
    const assetName = `${prefix}-${version}.tar.gz`;

    const headers = {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'HMPanel',
    };

    const releaseRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/releases/tags/v${version}`,
      { headers, signal: AbortSignal.timeout(30_000) },
    );

    if (!releaseRes.ok) {
      throw new Error(`GitHub release v${version} not found (${releaseRes.status}).`);
    }

    const release = (await releaseRes.json()) as { assets: { id: number; name: string }[] };
    const asset = release.assets.find((a) => a.name === assetName || a.name.includes(version));
    if (!asset) {
      throw new Error(`Release asset ${assetName} not found on GitHub.`);
    }

    const assetRes = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/releases/assets/${asset.id}`,
      {
        headers: {
          ...headers,
          Accept: 'application/octet-stream',
        },
        redirect: 'follow',
        signal: AbortSignal.timeout(120_000),
      },
    );

    if (!assetRes.ok) {
      throw new Error(`GitHub asset download failed (${assetRes.status}).`);
    }

    return Buffer.from(await assetRes.arrayBuffer());
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
