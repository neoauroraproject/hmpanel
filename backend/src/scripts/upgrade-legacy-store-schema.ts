import { PrismaClient } from '@prisma/client';

/**
 * Legacy StoreOrder/ProductTemplate shapes are incompatible with the premium OMS.
 * Drop only when the old shape is detected so prisma db push can recreate tables.
 * StoreProfile is kept. Exit 0 always — never block panel boot.
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

async function main() {
  console.log('[HMPanel] Checking legacy store schema…');
  try {
    if (!(await tableExists('StoreOrder'))) {
      console.log('[HMPanel] No StoreOrder table — skip store upgrade');
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
    await prisma.$executeRawUnsafe(`
      DROP TABLE IF EXISTS "OrderTimelineEvent" CASCADE;
      DROP TABLE IF EXISTS "StorePayment" CASCADE;
      DROP TABLE IF EXISTS "StoreCustomerActivity" CASCADE;
      DROP TABLE IF EXISTS "StoreCustomerNotification" CASCADE;
      DROP TABLE IF EXISTS "StoreCustomerSession" CASCADE;
      DROP TABLE IF EXISTS "StoreOrder" CASCADE;
      DROP TABLE IF EXISTS "StoreProduct" CASCADE;
      DROP TABLE IF EXISTS "ProductTemplate" CASCADE;
      DROP TABLE IF EXISTS "ProvisioningProfile" CASCADE;
      DROP TABLE IF EXISTS "ProductCategory" CASCADE;
      DROP TABLE IF EXISTS "StoreCustomer" CASCADE;
    `);
    console.log('[HMPanel] Legacy store tables dropped');
  } catch (err: any) {
    console.warn(`[HMPanel] Store upgrade skipped: ${err?.message || err}`);
  } finally {
    await prisma.$disconnect();
  }
}

main();
