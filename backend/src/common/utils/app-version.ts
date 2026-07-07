import * as fs from 'fs';
import * as path from 'path';

let cachedVersion: string | null = null;

function normalizeVersion(raw: string): string {
  const trimmed = raw.trim().replace(/^v/i, '');
  return trimmed || 'unknown';
}

function readVersionFile(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const value = normalizeVersion(fs.readFileSync(filePath, 'utf8'));
    return value === 'unknown' ? null : value;
  } catch {
    return null;
  }
}

function versionFromPackageJson(filePath: string): string | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    const pkg = JSON.parse(fs.readFileSync(filePath, 'utf8')) as {
      version?: string;
    };
    if (!pkg.version) return null;
    return normalizeVersion(pkg.version);
  } catch {
    return null;
  }
}

/**
 * Single source of truth for the running app version.
 * Priority: APP_VERSION env → /app/VERSION → repo VERSION → package.json fallbacks.
 */
export function getAppVersion(): string {
  if (cachedVersion) return cachedVersion;

  if (process.env.APP_VERSION?.trim()) {
    cachedVersion = normalizeVersion(process.env.APP_VERSION);
    return cachedVersion;
  }

  const fromFile = [
    '/app/VERSION',
    path.join(process.cwd(), 'VERSION'),
    path.join(process.cwd(), '..', 'VERSION'),
    path.resolve(__dirname, '../../../../VERSION'),
    path.resolve(__dirname, '../../../VERSION'),
  ]
    .map(readVersionFile)
    .find(Boolean);

  if (fromFile) {
    cachedVersion = fromFile;
    return cachedVersion;
  }

  const fromPkg = [
    path.join(process.cwd(), 'package.json'),
    path.join(process.cwd(), 'backend', 'package.json'),
    path.resolve(__dirname, '../../../package.json'),
    path.resolve(__dirname, '../../../../package.json'),
  ]
    .map(versionFromPackageJson)
    .find(Boolean);

  cachedVersion = fromPkg || 'unknown';
  return cachedVersion;
}

/** Version with leading `v` for display and GitHub release comparison. */
export function getAppVersionTag(): string {
  const v = getAppVersion();
  return v === 'unknown' ? 'vUnknown' : `v${v}`;
}
