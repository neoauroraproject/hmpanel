// Self-contained local PostgreSQL for the demo (no Docker / system install needed).
// Credentials/port match backend/.env -> DATABASE_URL.
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const databaseDir = join(__dirname, '..', '.pgdata');

const pg = new EmbeddedPostgres({
  databaseDir,
  user: 'panel_user',
  password: 'panel_pass',
  port: 5432,
  persistent: true,
});

const firstRun = !existsSync(databaseDir);

if (firstRun) {
  console.log('[db] initialising cluster…');
  await pg.initialise();
}

console.log('[db] starting postgres on :5432…');
await pg.start();

try {
  await pg.createDatabase('panel_db');
  console.log('[db] created database panel_db');
} catch {
  console.log('[db] database panel_db already exists');
}

console.log('[db] READY — postgresql://panel_user:panel_pass@localhost:5432/panel_db');

const shutdown = async () => {
  console.log('[db] stopping…');
  try { await pg.stop(); } catch {}
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
