import { PrismaClient } from '@prisma/client';
import { ensureCriticalSchema } from './ensure-critical-schema';

/**
 * Prepare DB for premium OMS / Brand / Incident schema expansion.
 * - Drop legacy StoreOrder shape (incompatible with OMS) — StoreProfile kept
 * - Deduplicate Brand rows so adminId can become unique
 * - Ensure critical columns exist (idempotent) for panels that skip prisma migrate
 * Exit 0 always — never block panel boot.
 */
const prisma = new PrismaClient();

async function tableExists(table: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = $1
     ) AS exists`,
    table,
  );
  return !!rows[0]?.exists;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ exists: boolean }>>(
    `SELECT EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
     ) AS exists`,
    table,
    column,
  );
  return !!rows[0]?.exists;
}

async function dropTable(table: string): Promise<void> {
  // Postgres prepared statements cannot run multiple commands — one DROP per call.
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${table}" CASCADE`);
}

async function upgradeLegacyStore(): Promise<void> {
  if (!(await tableExists('StoreOrder'))) {
    // Still drop orphan ProductTemplate if it has the old `price` column
    if (
      (await tableExists('ProductTemplate')) &&
      (await columnExists('ProductTemplate', 'price')) &&
      !(await columnExists('ProductTemplate', 'priceUsd'))
    ) {
      console.warn('[HMPanel] Legacy ProductTemplate detected — dropping for OMS recreate');
      await dropTable('ProductTemplate');
    }
    console.log('[HMPanel] No legacy StoreOrder — store upgrade ok');
    return;
  }

  const modern =
    (await columnExists('StoreOrder', 'customerId')) &&
    (await columnExists('StoreOrder', 'amount'));
  if (modern) {
    console.log('[HMPanel] Store schema already modern — ok');
    return;
  }

  console.warn(
    '[HMPanel] Legacy StoreOrder detected — dropping incompatible store tables (StoreProfile kept)',
  );

  const tables = [
    'OrderTimelineEvent',
    'StorePayment',
    'StoreCustomerActivity',
    'StoreCustomerNotification',
    'StoreCustomerSession',
    'StoreOrder',
    'StoreProduct',
    'ProductTemplate',
    'ProvisioningProfile',
    'ProductCategory',
    'StoreCustomer',
  ];

  for (const table of tables) {
    await dropTable(table);
    console.log(`[HMPanel] Dropped ${table}`);
  }
}

async function dedupeBrand(): Promise<void> {
  if (!(await tableExists('Brand'))) {
    console.log('[HMPanel] No Brand table — skip dedupe');
    return;
  }

  // Keep the newest Brand per adminId; clear domainId on losers to avoid unique conflicts.
  const result = await prisma.$executeRawUnsafe(`
    WITH ranked AS (
      SELECT id, "adminId",
             ROW_NUMBER() OVER (PARTITION BY "adminId" ORDER BY "updatedAt" DESC NULLS LAST, "createdAt" DESC NULLS LAST) AS rn
      FROM "Brand"
    )
    DELETE FROM "Brand" b
    USING ranked r
    WHERE b.id = r.id AND r.rn > 1
  `);
  console.log(`[HMPanel] Brand dedupe done (removed extras for unique adminId)`);
  void result;
}

async function main() {
  console.log('[HMPanel] Preparing premium schema upgrade…');
  try {
    await upgradeLegacyStore();
    await dedupeBrand();
    await ensureCriticalSchema(prisma);
    console.log('[HMPanel] Premium schema prep complete');
  } catch (err: any) {
    console.warn(`[HMPanel] Schema prep warning: ${err?.message || err}`);
  } finally {
    await prisma.$disconnect();
  }
}

main();
