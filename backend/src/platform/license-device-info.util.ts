import * as fs from 'fs';
import * as os from 'os';

/**
 * OS details sent with activate / heartbeat / bundle-url so the license panel can label
 * this panel's device slot (the slot itself is keyed by `instanceId`). Old license
 * servers ignore the fields.
 */
export interface LicenseDeviceInfo {
  os: string;
  osVersion?: string;
  hostname?: string;
  arch: string;
}

/** Host files first (when `/` is mounted at /host), then the container's own. */
const OS_RELEASE_PATHS = ['/host/etc/os-release', '/etc/os-release', '/usr/lib/os-release'];
const HOSTNAME_PATHS = ['/host/etc/hostname'];

let cached: LicenseDeviceInfo | null = null;

/** Reads PRETTY_NAME (or NAME + VERSION_ID) from os-release text, e.g. "Ubuntu 24.04 LTS". */
export function parseOsRelease(text: string): string {
  const vals: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    vals[line.slice(0, eq).trim()] = line
      .slice(eq + 1)
      .trim()
      .replace(/^["']|["']$/g, '');
  }
  return vals.PRETTY_NAME || `${vals.NAME || ''} ${vals.VERSION_ID || ''}`.trim();
}

function readFirst(paths: string[], parse: (text: string) => string): string {
  for (const p of paths) {
    try {
      const v = parse(fs.readFileSync(p, 'utf8')).trim();
      if (v) return v;
    } catch {
      /* try next */
    }
  }
  return '';
}

function osName(platform: NodeJS.Platform): string {
  if (platform === 'win32') return 'windows';
  if (platform === 'darwin') return 'macos';
  return platform;
}

function goArch(arch: string): string {
  if (arch === 'x64') return 'amd64';
  if (arch === 'ia32') return '386';
  return arch;
}

function osVersion(platform: NodeJS.Platform): string {
  const env = process.env.HMPANEL_HOST_OS_VERSION?.trim();
  if (env) return env;
  if (platform === 'linux') return readFirst(OS_RELEASE_PATHS, parseOsRelease);
  if (platform === 'win32') {
    const build = os.release().split('.')[2];
    return [os.version(), build ? `build ${build}` : ''].filter(Boolean).join(' ');
  }
  return `${os.type()} ${os.release()}`.trim();
}

function hostName(): string {
  const env = process.env.HMPANEL_HOSTNAME?.trim();
  if (env) return env;
  return readFirst(HOSTNAME_PATHS, (t) => t.split(/\r?\n/)[0] || '') || os.hostname();
}

export function getLicenseDeviceInfo(): LicenseDeviceInfo {
  if (cached) return cached;
  const info: LicenseDeviceInfo = { os: osName(process.platform), arch: goArch(os.arch()) };
  const version = osVersion(process.platform);
  if (version) info.osVersion = version.slice(0, 96);
  const host = hostName();
  if (host) info.hostname = host.slice(0, 64);
  cached = info;
  return info;
}
