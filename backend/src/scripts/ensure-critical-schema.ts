import { PrismaClient } from '@prisma/client';

/**
 * Idempotent schema patches for production panels that predate prisma migrate history.
 * Safe to run on every boot / update — uses IF NOT EXISTS only.
 */
export async function ensureCriticalSchema(prisma: PrismaClient): Promise<void> {
  const statements = [
    // Store Telegram
    `ALTER TABLE "StoreProfile" ADD COLUMN IF NOT EXISTS "telegramBotEnabled" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "StoreProfile" ADD COLUMN IF NOT EXISTS "telegramBotTokenEnc" TEXT`,
    `ALTER TABLE "StoreProfile" ADD COLUMN IF NOT EXISTS "telegramBotUsername" TEXT`,
    `ALTER TABLE "StoreProfile" ADD COLUMN IF NOT EXISTS "telegramWebhookSecret" TEXT`,
    `ALTER TABLE "StoreProfile" ADD COLUMN IF NOT EXISTS "telegramWelcomeText" TEXT`,
    `ALTER TABLE "StoreProfile" ADD COLUMN IF NOT EXISTS "telegramAdminChatId" TEXT`,
    `ALTER TABLE "StoreCustomer" ADD COLUMN IF NOT EXISTS "telegramUserId" TEXT`,
    `ALTER TABLE "StoreCustomer" ADD COLUMN IF NOT EXISTS "telegramUsername" TEXT`,
    `CREATE INDEX IF NOT EXISTS "StoreCustomer_telegramUserId_idx" ON "StoreCustomer"("telegramUserId")`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "StoreCustomer_adminId_telegramUserId_key" ON "StoreCustomer"("adminId", "telegramUserId")`,

    // Client extras
    `ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "connectionExtras" JSONB DEFAULT '{}'`,

    // Store auto-deliver
    `ALTER TABLE "StoreProfile" ADD COLUMN IF NOT EXISTS "autoDeliverEnabled" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "StoreProfile" ADD COLUMN IF NOT EXISTS "autoDeliverDelayMinutes" INTEGER NOT NULL DEFAULT 10`,
    `ALTER TABLE "StoreOrder" ADD COLUMN IF NOT EXISTS "autoDeliverAt" TIMESTAMP(3)`,
    `ALTER TABLE "StoreOrder" ADD COLUMN IF NOT EXISTS "autoDelivered" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "StoreOrder" ADD COLUMN IF NOT EXISTS "pendingReview" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "StoreOrder" ADD COLUMN IF NOT EXISTS "renewSnapshot" JSONB`,
    `CREATE INDEX IF NOT EXISTS "StoreOrder_autoDeliverAt_idx" ON "StoreOrder"("autoDeliverAt")`,
    `CREATE INDEX IF NOT EXISTS "StoreOrder_pendingReview_idx" ON "StoreOrder"("pendingReview")`,

    // Sequential order numbers (checkout)
    `ALTER TABLE "StoreProfile" ADD COLUMN IF NOT EXISTS "nextOrderNumber" INTEGER NOT NULL DEFAULT 1000`,
  ];

  for (const sql of statements) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch (err: any) {
      // Table may not exist yet on fresh Community-only installs — ignore.
      const msg = String(err?.message || err);
      if (/does not exist/i.test(msg) || /undefined_table/i.test(msg)) {
        continue;
      }
      console.warn(`[HMPanel] ensureCriticalSchema skipped: ${msg}`);
    }
  }
}
