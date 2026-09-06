import { parseThemeImport, toThemeExport, THEME_EXPORT_FORMAT } from './theme-export';

describe('theme import/export v1', () => {
  it('round-trips a document', () => {
    const doc = toThemeExport({ slug: 'aurora', name: 'Aurora', version: '1.0.1' });
    const parsed = parseThemeImport(JSON.parse(JSON.stringify(doc)));
    expect(parsed.format).toBe(THEME_EXPORT_FORMAT);
    expect(parsed.slug).toBe('aurora');
    expect(parsed.version).toBe('1.0.1');
  });

  it('rejects unknown format', () => {
    expect(() => parseThemeImport({ format: 99, slug: 'x', name: 'X' })).toThrow(
      /Unsupported theme format/,
    );
  });
});
