import * as fs from 'fs';
import * as path from 'path';

/** Locate bundled OpenAPI specs (api350.json … api380.json) in dev and Docker. */
export function resolveOpenApiDocsDir(): string | null {
  const candidates = [
    path.join(process.cwd(), 'docs'),
    path.join(process.cwd(), '../docs'),
    path.resolve(__dirname, '../../../../docs'),
    path.resolve(__dirname, '../../../docs'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir) && fs.readdirSync(dir).some((f) => /^api\d+\.json$/.test(f))) {
      return dir;
    }
  }
  return null;
}
