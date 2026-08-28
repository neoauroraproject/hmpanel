import { BadRequestException } from '@nestjs/common';

export type PanelConnectionFields = {
  /** Trailing slash stripped — user-facing panel URL */
  normalizedUrl: string;
  /** Path prefix before `/panel` (empty when panel is at domain root) */
  webBasePath: string;
  /** Origin + webBasePath — base for `/panel/api/...` calls */
  apiBaseUrl: string;
};

export type PanelEndpointSource = {
  url?: string | null;
  apiBaseUrl?: string | null;
  webBasePath?: string | null;
};

/**
 * Parse a 3x-ui panel connection URL into normalized storage + API endpoint fields.
 * `url` is the source of truth; `webBasePath` and `apiBaseUrl` are derived caches.
 */
export function derivePanelConnectionFromUrl(rawUrl: string): PanelConnectionFields {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed || !/^https?:\/\//i.test(trimmed)) {
    throw new BadRequestException('A valid http(s) URL is required');
  }

  let urlObj: URL;
  try {
    urlObj = new URL(trimmed);
  } catch {
    throw new BadRequestException('Malformed URL');
  }

  const path = urlObj.pathname.replace(/\/$/, '');
  const panelIndex = path.indexOf('/panel');
  const webBasePath =
    panelIndex !== -1 ? path.substring(0, panelIndex) : path;
  const apiBaseUrl = `${urlObj.origin}${webBasePath}`.replace(/\/$/, '');
  const normalizedUrl = trimmed.replace(/\/$/, '');

  return { normalizedUrl, webBasePath, apiBaseUrl };
}

/**
 * Resolve the API base URL for outbound panel requests.
 * Always derives from `url` so stale stored `apiBaseUrl` cannot override an edited URL.
 */
export function resolvePanelApiBaseUrl(panel: PanelEndpointSource): string {
  const url = String(panel.url || '').trim();
  if (!url) {
    throw new BadRequestException('Panel has no connection URL');
  }
  return derivePanelConnectionFromUrl(url).apiBaseUrl;
}

/** Fields to persist when creating or updating a panel connection URL. */
export function panelEndpointFieldsFromUrl(rawUrl: string): PanelConnectionFields {
  return derivePanelConnectionFromUrl(rawUrl);
}

export function panelEndpointFieldsMatchStored(
  panel: PanelEndpointSource,
  derived: PanelConnectionFields,
): boolean {
  const storedApi = String(panel.apiBaseUrl || '').replace(/\/$/, '');
  const storedWeb = String(panel.webBasePath ?? '');
  const storedUrl = String(panel.url || '').replace(/\/$/, '');
  return (
    storedApi === derived.apiBaseUrl &&
    storedWeb === derived.webBasePath &&
    storedUrl === derived.normalizedUrl
  );
}
