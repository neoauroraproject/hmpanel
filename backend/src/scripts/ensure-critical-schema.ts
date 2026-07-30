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
    `ALTER TABLE "StoreOrder" ADD COLUMN IF NOT EXISTS "couponId" TEXT`,
    `ALTER TABLE "StoreOrder" ADD COLUMN IF NOT EXISTS "discountAmount" DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `CREATE INDEX IF NOT EXISTS "StoreOrder_autoDeliverAt_idx" ON "StoreOrder"("autoDeliverAt")`,
    `CREATE INDEX IF NOT EXISTS "StoreOrder_pendingReview_idx" ON "StoreOrder"("pendingReview")`,

    // Sequential order numbers (checkout)
    `ALTER TABLE "StoreProfile" ADD COLUMN IF NOT EXISTS "nextOrderNumber" INTEGER NOT NULL DEFAULT 1000`,
    `ALTER TABLE "StoreProfile" ADD COLUMN IF NOT EXISTS "subscriptionLinkMode" TEXT NOT NULL DEFAULT 'hmpanel'`,

    // Payment method WALLET
    `DO $$ BEGIN
      ALTER TYPE "StorePaymentMethod" ADD VALUE IF NOT EXISTS 'WALLET';
    EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_object THEN NULL;
    END $$`,

    // Test products
    `ALTER TABLE "StoreProduct" ADD COLUMN IF NOT EXISTS "isTest" BOOLEAN NOT NULL DEFAULT false`,
    `ALTER TABLE "StoreProduct" ADD COLUMN IF NOT EXISTS "testCooldownoldownDays" INTEGER NOT NULL DEFAULT 30`,
    `CREATE INDEX IF NOT EXISTS "StoreProduct_isTest_idx" ON "StoreProduct"("isTest")`,
    `ALTER TABLE "StoreProduct" ADD COLUMN IF NOT EXISTS "ipLimitOptions" JSONB DEFAULT '[]'`,

    `ALTER TABLE "StoreOrder" ADD COLUMN IF NOT EXISTS "limitIp" INTEGER`,
    `ALTER TABLE "StoreOrder" ADD COLUMN IF NOT EXISTS "telegramAdminChatId" TEXT`,
    `ALTER TABLE "StoreOrder" ADD COLUMN IF NOT EXISTS "telegramAdminMessageId" INTEGER`,
    `ALTER TABLE "StoreOrder" ADD COLUMN IF NOT EXISTS "telegramAdminHasPhoto" BOOLEAN NOT NULL DEFAULT false`,

    // Referral
    `ALTER TABLE "StoreCustomer" ADD COLUMN IF NOT EXISTS "referralCode" TEXT`,
    `ALTER TABLE "StoreCustomer" ADD COLUMN IF NOT EXISTS "referredById" TEXT`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "StoreCustomer_referralCode_key" ON "StoreCustomer"("referralCode")`,
    `CREATE INDEX IF NOT EXISTS "StoreCustomer_referredById_idx" ON "StoreCustomer"("referredById")`,

    // Wallet
    `CREATE TABLE IF NOT EXISTS "StoreWalletAccount" (
      "id" TEXT PRIMARY KEY,
      "customerId" TEXT NOT NULL UNIQUE,
      "currency" TEXT NOT NULL DEFAULT 'USD',
      "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE TABLE IF NOT EXISTS "StoreWalletLedger" (
      "id" TEXT PRIMARY KEY,
      "accountId" TEXT NOT NULL,
      "type" TEXT NOT NULL,
      "amount" DOUBLE PRECISION NOT NULL,
      "balanceAfter" DOUBLE PRECISION NOT NULL,
      "orderId" TEXT,
      "depositId" TEXT,
      "note" TEXT,
      "meta" JSONB DEFAULT '{}',
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS "StoreWalletLedger_accountId_createdAt_idx" ON "StoreWalletLedger"("accountId", "createdAt")`,
    `CREATE TABLE IF NOT EXISTS "StoreWalletDeposit" (
      "id" TEXT PRIMARY KEY,
      "customerId" TEXT NOT NULL,
      "adminId" TEXT NOT NULL,
      "amount" DOUBLE PRECISION NOT NULL,
      "currency" TEXT NOT NULL DEFAULT 'USD',
      "status" TEXT NOT NULL DEFAULT 'PENDING',
      "receiptText" TEXT,
      "receiptImage" TEXT,
      "rejectReason" TEXT,
      "reviewedAt" TIMESTAMP(3),
      "reviewedBy" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE INDEX IF NOT EXISTS "StoreWalletDeposit_customerId_createdAt_idx" ON "StoreWalletDeposit"("customerId", "createdAt")`,
    `CREATE INDEX IF NOT EXISTS "StoreWalletDeposit_adminId_status_idx" ON "StoreWalletDeposit"("adminId", "status")`,

    // Coupons
    `CREATE TABLE IF NOT EXISTS "StoreCoupon" (
      "id" TEXT PRIMARY KEY,
      "adminId" TEXT NOT NULL,
      "code" TEXT NOT NULL,
      "description" TEXT,
      "discountType" TEXT NOT NULL DEFAULT 'percent',
      "discountValue" DOUBLE PRECISION NOT NULL,
      "currency" TEXT,
      "maxUses" INTEGER,
      "maxUsesPerCustomer" INTEGER NOT NULL DEFAULT 1,
      "usedCount" INTEGER NOT NULL DEFAULT 0,
      "startsAt" TIMESTAMP(3),
      "endsAt" TIMESTAMP(3),
      "enabled" BOOLEAN NOT NULL DEFAULT true,
      "audience" TEXT NOT NULL DEFAULT 'all',
      "audienceMinOrders" INTEGER,
      "audienceMinReferrals" INTEGER,
      "audienceTokens" JSONB,
      "productIds" JSONB,
      "categoryIds" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "StoreCoupon_adminId_code_key" ON "StoreCoupon"("adminId", "code")`,
    `CREATE TABLE IF NOT EXISTS "StoreCouponRedemption" (
      "id" TEXT PRIMARY KEY,
      "couponId" TEXT NOT NULL,
      "customerId" TEXT NOT NULL,
      "orderId" TEXT NOT NULL UNIQUE,
      "amount" DOUBLE PRECISION NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
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
