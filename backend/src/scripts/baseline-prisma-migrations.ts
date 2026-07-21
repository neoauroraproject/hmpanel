/**
 * Baseline Prisma migrate history for production DBs that were created with
 * `db push` / manual SQL (P3005 on `migrate deploy`).
 *
 * Marks every folder under prisma/migrations as already applied WITHOUT
 * re-running SQL (via `prisma migrate resolve --applied`).
 *
 * Usage (inside panel container):
 *   node backend/dist/scripts/baseline-prisma-migrations.js
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

function migrationsDir(): string {
  const candidates = [
    path.join(process.cwd(), 'prisma', 'migrations'),
    path.join('/app', 'prisma', 'migrations'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  throw new Error('prisma/migrations directory not found');
}

function schemaPath(): string {
  const candidates = [
    path.join(process.cwd(), 'prisma', 'schema.prisma'),
    '/app/prisma/schema.prisma',
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return '/app/prisma/schema.prisma';
}

async function alreadyRecorded(name: string): Promise<boolean> {
  try {
    const rows = await prisma.$queryRawUnsafe<Array<{ migration_name: string }>>(
      `SELECT "migration_name" FROM "_prisma_migrations" WHERE "migration_name" = $1 LIMIT 1`,
      name,
    );
    return rows.length > 0;
  } catch {
    // Table may not exist yet — resolve will create it.
    return false;
  }
}

async function main() {
  const dir = migrationsDir();
  const schema = schemaPath();
  const entries = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();

  if (!entries.length) {
    console.log('[Baseline] No migrations found — nothing to do');
    return;
  }

  let marked = 0;
  let skipped = 0;

  for (const name of entries) {
    if (!(await alreadyRecorded(name))) {
      try {
        execFileSync(
          'npx',
          ['prisma', 'migrate', 'resolve', '--applied', name, `--schema=${schema}`],
          { stdio: 'inherit', env: process.env },
        );
        marked += 1;
        console.log(`[Baseline] marked applied: ${name}`);
      } catch (err: any) {
        console.warn(
          `[Baseline] resolve failed for ${name}: ${err?.message || err}`,
        );
      }
    } else {
      skipped += 1;
      console.log(`[Baseline] already recorded: ${name}`);
    }
  }

  console.log(
    `[Baseline] Done. marked=${marked} skipped=${skipped}. Future: npx prisma migrate deploy`,
  );
}

main()
  .catch((err) => {
    console.error('[Baseline] Failed:', err?.message || err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
