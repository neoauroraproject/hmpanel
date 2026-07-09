/** Parse panel version string (e.g. "3.4.2") into [major, minor, patch]. */
export function parsePanelSemver(
  version?: string | null,
): [number, number, number] | null {
  if (!version) return null;
  const m = version.match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return null;
  return [
    parseInt(m[1], 10),
    parseInt(m[2], 10),
    parseInt(m[3] || '0', 10),
  ];
}

export function isPanelApiAtLeast(
  version: string | null | undefined,
  major: number,
  minor: number,
  patch = 0,
): boolean {
  const v = parsePanelSemver(version);
  if (!v) return false;
  if (v[0] !== major) return v[0] > major;
  if (v[1] !== minor) return v[1] > minor;
  return v[2] >= patch;
}

/** 3x-ui 3.4.2+ bulk client APIs (bulkCreate, bulkAdjust, bulkEnable, …). */
export function supportsBulkClientApi(panel: {
  apiVersion?: string | null;
  capabilities?: unknown;
}): boolean {
  if (panel.apiVersion) {
    return isPanelApiAtLeast(panel.apiVersion, 3, 4, 2);
  }
  const caps = panel.capabilities as Record<string, boolean> | undefined;
  return !!(
    caps?.bulkCreate ||
    caps?.bulkAdjust ||
    caps?.bulkEnable ||
    caps?.bulkDisable
  );
}

/** Installed panel version from env or package.json */
export function getPanelVersion(): string {
  if (process.env.PANEL_VERSION) return process.env.PANEL_VERSION;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pkg = require('../../../package.json') as { version?: string };
    return pkg.version || '0.0.0';
  } catch {
    return '0.0.0';
  }
}
