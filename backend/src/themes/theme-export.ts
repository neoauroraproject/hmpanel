export const THEME_EXPORT_FORMAT = 1 as const;

export interface ThemeExportDocument {
  format: typeof THEME_EXPORT_FORMAT;
  slug: string;
  name: string;
  authorName?: string | null;
  description?: string | null;
  settings?: unknown;
  version: string;
  payload?: unknown;
}

export function toThemeExport(input: {
  slug: string;
  name: string;
  authorName?: string | null;
  description?: string | null;
  settings?: unknown;
  version?: string;
  payload?: unknown;
}): ThemeExportDocument {
  return {
    format: THEME_EXPORT_FORMAT,
    slug: input.slug,
    name: input.name,
    authorName: input.authorName ?? null,
    description: input.description ?? null,
    settings: input.settings ?? {},
    version: input.version || '1.0.0',
    payload: input.payload ?? {},
  };
}

export function parseThemeImport(raw: unknown): ThemeExportDocument {
  if (!raw || typeof raw !== 'object') {
    throw new Error('Invalid theme JSON');
  }
  const rec = raw as Record<string, unknown>;
  if (rec.format !== THEME_EXPORT_FORMAT) {
    throw new Error(`Unsupported theme format (expected ${THEME_EXPORT_FORMAT})`);
  }
  if (!rec.slug || !rec.name) {
    throw new Error('Theme JSON requires slug and name');
  }
  return toThemeExport({
    slug: String(rec.slug),
    name: String(rec.name),
    authorName: rec.authorName != null ? String(rec.authorName) : null,
    description: rec.description != null ? String(rec.description) : null,
    settings: rec.settings,
    version: rec.version != null ? String(rec.version) : '1.0.0',
    payload: rec.payload,
  });
}
