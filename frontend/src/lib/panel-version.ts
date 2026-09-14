/** Parse panel version string (e.g. "3.8.0" or "v3.8.0"). */
export function parsePanelSemver(
  version?: string | null,
): [number, number, number] | null {
  if (!version) return null;
  const m = String(version).match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) return null;
  return [
    parseInt(m[1], 10),
    parseInt(m[2], 10),
    parseInt(m[3] || "0", 10),
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

export function isXui380Plus(panel?: {
  apiVersion?: string | null;
  version?: string | null;
  panelType?: string | null;
} | null): boolean {
  if (!panel) return false;
  const type = String(panel.panelType || "").toLowerCase();
  if (type === "eylan" || type === "pasarguard") return false;
  return isPanelApiAtLeast(panel.apiVersion || panel.version, 3, 8, 0);
}
