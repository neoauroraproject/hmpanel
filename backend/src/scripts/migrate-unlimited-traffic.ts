import { PrismaClient } from '@prisma/client';

/**
 * Post-schema migration for v1.5.2 — verifies Admin.unlimitedTraffic exists
 * after `prisma db push` and normalizes any legacy rows.
 */
export async function runUnlimitedTrafficMigration(
  prisma: PrismaClient,
): Promise<{ adminsChecked: number }> {
  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Admin'
      AND column_name = 'unlimitedTraffic'
  `;

  if (!columns.length) {
    throw new Error(
      'Admin.unlimitedTraffic column is missing. Run prisma db push before migrations.',
    );
  }

  const adminsChecked = await prisma.admin.count();
  await prisma.$executeRaw`
    UPDATE "Admin"
    SET "unlimitedTraffic" = false
    WHERE "unlimitedTraffic" IS NULL
  `;

  return { adminsChecked };
}
