import { PrismaClient } from '@prisma/client';
import { runIdentityMigration } from './migrate-identities';
import { runUnlimitedTrafficMigration } from './migrate-unlimited-traffic';

const prisma = new PrismaClient();

type MigrationRunner = (client: PrismaClient) => Promise<Record<string, unknown>>;

interface MigrationDefinition {
  version: string;
  label: string;
  run: MigrationRunner;
}

const MIGRATIONS: MigrationDefinition[] = [
  {
    version: 'v1.3.0-identity-split',
    label: 'Client identity split',
    run: async (client) => {
      const clientsBefore = await client.client.count();
      const metrics = await runIdentityMigration(client);
      const clientsAfter = await client.client.count();
      return {
        clientsBefore,
        clientsAfter,
        clientsMigrated: metrics?.clientsMigrated || 0,
      };
    },
  },
  {
    version: 'v1.5.2-admin-unlimited-traffic',
    label: 'Admin unlimited traffic flag',
    run: runUnlimitedTrafficMigration,
  },
];

async function runMigration(def: MigrationDefinition): Promise<void> {
  const existing = await prisma.systemMigration.findUnique({
    where: { version: def.version },
  });

  if (existing?.status === 'SUCCESS') {
    console.log(
      `[MigrationOrchestrator] ${def.version} (${def.label}) already executed. Skipping.`,
    );
    return;
  }

  console.log(
    `[MigrationOrchestrator] Executing ${def.version} (${def.label})...`,
  );

  const report = {
    ...(await def.run(prisma)),
    timestamp: new Date().toISOString(),
  };

  await prisma.systemMigration.upsert({
    where: { version: def.version },
    update: {
      status: 'SUCCESS',
      executedAt: new Date(),
      integrityReport: report as any,
    },
    create: {
      version: def.version,
      status: 'SUCCESS',
      integrityReport: report as any,
    },
  });

  console.log(
    `[MigrationOrchestrator] ${def.version} finished successfully.`,
  );
}

async function main() {
  console.log('[MigrationOrchestrator] Starting migration check...');

  let currentMigration: MigrationDefinition | undefined;

  try {
    for (const migration of MIGRATIONS) {
      currentMigration = migration;
      await runMigration(migration);
    }

    console.log('[MigrationOrchestrator] All migrations completed.');
    process.exit(0);
  } catch (error: any) {
    console.error(
      `[MigrationOrchestrator] Migration failed${currentMigration ? ` at ${currentMigration.version}` : ''}:`,
      error,
    );

    if (currentMigration) {
      try {
        await prisma.systemMigration.upsert({
          where: { version: currentMigration.version },
          update: {
            status: 'FAILED',
            executedAt: new Date(),
            integrityReport: { error: error.message } as any,
          },
          create: {
            version: currentMigration.version,
            status: 'FAILED',
            integrityReport: { error: error.message } as any,
          },
        });
      } catch (e) {
        console.error('[MigrationOrchestrator] Could not log failure to DB', e);
      }
    }

    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
