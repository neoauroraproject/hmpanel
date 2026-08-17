/**
 * Idempotent DB patches for premium bundle tables.
 * Safe to run after bundle install — does not require a new Prisma client delegate.
 */
import { PrismaClient } from '@prisma/client';
import { ensureCriticalSchema } from './ensure-critical-schema';

async function main() {
  const prisma = new PrismaClient();
  try {
    await ensureCriticalSchema(prisma);
    console.log('[HMPanel] Premium schema overlay applied.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('[HMPanel] Premium schema overlay failed:', err);
  process.exit(1);
});
