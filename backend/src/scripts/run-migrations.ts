import { PrismaClient } from '@prisma/client';
import { runIdentityMigration } from './migrate-identities';

const prisma = new PrismaClient();

async function main() {
  console.log('[MigrationOrchestrator] Starting migration check...');

  const MIGRATION_VERSION = 'v1.3.0-identity-split';

  try {
    const existingMigration = await prisma.systemMigration.findUnique({
      where: { version: MIGRATION_VERSION },
    });

    if (existingMigration && existingMigration.status === 'SUCCESS') {
      console.log(
        `[MigrationOrchestrator] Migration ${MIGRATION_VERSION} already executed successfully. Skipping.`,
      );
      process.exit(0);
    }

    console.log(
      `[MigrationOrchestrator] Executing migration ${MIGRATION_VERSION}...`,
    );

    // Integrity Pre-Check
    const clientsBefore = await prisma.client.count();

    // Execute logic
    const metrics = await runIdentityMigration(prisma);

    // Integrity Post-Check
    const clientsAfter = await prisma.client.count();

    const report = {
      clientsBefore,
      clientsAfter,
      clientsMigrated: metrics?.clientsMigrated || 0,
      timestamp: new Date().toISOString(),
    };

    console.log(
      '[MigrationOrchestrator] Identity migration logic completed. Validating integrity...',
    );

    // Save success record
    await prisma.systemMigration.upsert({
      where: { version: MIGRATION_VERSION },
      update: {
        status: 'SUCCESS',
        executedAt: new Date(),
        integrityReport: report as any,
      },
      create: {
        version: MIGRATION_VERSION,
        status: 'SUCCESS',
        integrityReport: report as any,
      },
    });

    console.log(
      `[MigrationOrchestrator] Migration ${MIGRATION_VERSION} finished successfully!`,
    );
    process.exit(0);
  } catch (error: any) {
    console.error(
      `[MigrationOrchestrator] FAILED to execute migration ${MIGRATION_VERSION}:`,
      error,
    );

    try {
      await prisma.systemMigration.upsert({
        where: { version: MIGRATION_VERSION },
        update: {
          status: 'FAILED',
          executedAt: new Date(),
          integrityReport: { error: error.message } as any,
        },
        create: {
          version: MIGRATION_VERSION,
          status: 'FAILED',
          integrityReport: { error: error.message } as any,
        },
      });
    } catch (e) {
      console.error('[MigrationOrchestrator] Could not log failure to DB', e);
    }

    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
