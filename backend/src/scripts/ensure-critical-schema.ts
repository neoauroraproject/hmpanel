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
    `ALTER TABLE "StoreProfile" ADD COLUMN IF NOT EXISTS "telegramBotLocale" TEXT NOT NULL DEFAULT 'fa'`,
    `ALTER TABLE "StoreCustomer" ADD COLUMN IF NOT EXISTS "telegramUserId" TEXT`,
    `ALTER TABLE "StoreCustomer" ADD COLUMN IF NOT EXISTS "telegramUsername" TEXT`,
    `CREATE INDEX IF NOT EXISTS "StoreCustomer_telegramUserId_idx" ON "StoreCustomer"("telegramUserId")`,
    // Unique (adminId, telegramUserId) is created AFTER empty-string cleanup below

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
    // Guest checkouts send telegram="" which used to be stored as '' and collide on
    // unique(adminId, telegramUserId). Null out empties first, then ensure the
    // Prisma-compatible FULL unique index (never a partial index under this name —
    // that caused: relation "StoreCustomer_adminId_telegramUserId_key" already exists).
    `UPDATE "StoreCustomer" SET "telegramUserId" = NULL WHERE "telegramUserId" IS NOT NULL AND btrim("telegramUserId") = ''`,
    `DROP INDEX IF EXISTS "StoreCustomer_adminId_telegramUserId_key"`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "StoreCustomer_adminId_telegramUserId_key" ON "StoreCustomer"("adminId", "telegramUserId")`,
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

    // Coupon dual-currency fixed amounts
    `ALTER TABLE "StoreCoupon" ADD COLUMN IF NOT EXISTS "discountValueUsd" DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `ALTER TABLE "StoreCoupon" ADD COLUMN IF NOT EXISTS "discountValueToman" DOUBLE PRECISION NOT NULL DEFAULT 0`,
    `UPDATE "StoreCoupon" SET "discountValueUsd" = "discountValue" WHERE "discountType" = 'fixed' AND "discountValueUsd" = 0 AND COALESCE("currency",'') NOT IN ('IRT','IRR','TOMAN','TMN')`,
    `UPDATE "StoreCoupon" SET "discountValueToman" = "discountValue" WHERE "discountType" = 'fixed' AND "discountValueToman" = 0 AND COALESCE("currency",'') IN ('IRT','IRR','TOMAN','TMN')`,

    // Test products may omit category
    `ALTER TABLE "StoreProduct" ALTER COLUMN "categoryId" DROP NOT NULL`,
    `ALTER TABLE "StoreProduct" ADD COLUMN IF NOT EXISTS "ipLimitIds" JSONB DEFAULT '[]'`,

    // Managed IP limit catalog
    `CREATE TABLE IF NOT EXISTS "StoreIpLimit" (
      "id" TEXT PRIMARY KEY,
      "adminId" TEXT NOT NULL,
      "limitIp" INTEGER NOT NULL,
      "label" TEXT NOT NULL,
      "priceExtraUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "priceExtraToman" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "enabled" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "StoreIpLimit_adminId_limitIp_key" ON "StoreIpLimit"("adminId", "limitIp")`,
    `CREATE INDEX IF NOT EXISTS "StoreIpLimit_adminId_idx" ON "StoreIpLimit"("adminId")`,

    // 3x-ui node-hosted inbounds (same port as master is allowed; distinct panelInboundId)
    `ALTER TABLE "Inbound" ADD COLUMN IF NOT EXISTS "nodeId" INTEGER`,
    `ALTER TABLE "Inbound" ADD COLUMN IF NOT EXISTS "originNodeGuid" TEXT`,
    `ALTER TABLE "Inbound" ADD COLUMN IF NOT EXISTS "nodeName" TEXT`,
    `CREATE INDEX IF NOT EXISTS "Inbound_panelId_panelInboundId_idx" ON "Inbound"("panelId", "panelInboundId")`,
    `CREATE INDEX IF NOT EXISTS "Inbound_panelId_port_idx" ON "Inbound"("panelId", "port")`,

    // Per-panel admin traffic quotas
    `DO $$ BEGIN
      CREATE TYPE "QuotaMode" AS ENUM ('GLOBAL', 'PER_PANEL');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$`,
    `ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "quotaMode" "QuotaMode" NOT NULL DEFAULT 'GLOBAL'`,
    `CREATE TABLE IF NOT EXISTS "AdminPanelQuota" (
      "adminId" TEXT NOT NULL,
      "panelId" TEXT NOT NULL,
      "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "totalAssigned" DOUBLE PRECISION NOT NULL DEFAULT 0,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AdminPanelQuota_pkey" PRIMARY KEY ("adminId","panelId")
    )`,
    `ALTER TABLE "TrafficTransaction" ADD COLUMN IF NOT EXISTS "panelId" TEXT`,

    // Legacy: suspended → disabled (admin status is only active | disabled)
    `UPDATE "Admin" SET status = 'disabled' WHERE status = 'suspended'`,

    // Admin recharge store
    `DO $$ BEGIN
      CREATE TYPE "AdminRechargeOrderStatus" AS ENUM (
        'PENDING_PAYMENT','PAYMENT_SUBMITTED','APPROVED','REJECTED','CANCELLED'
      );
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$`,
    `CREATE TABLE IF NOT EXISTS "AdminRechargePlan" (
      "id" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "price" DOUBLE PRECISION NOT NULL,
      "currency" TEXT NOT NULL DEFAULT 'IRT',
      "trafficBytes" BIGINT NOT NULL DEFAULT 0,
      "expiryDays" INTEGER NOT NULL DEFAULT 0,
      "maxClientsDelta" INTEGER NOT NULL DEFAULT 0,
      "sortOrder" INTEGER NOT NULL DEFAULT 0,
      "enabled" BOOLEAN NOT NULL DEFAULT true,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AdminRechargePlan_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE TABLE IF NOT EXISTS "AdminRechargeOrder" (
      "id" TEXT NOT NULL,
      "trackingCode" TEXT NOT NULL,
      "adminId" TEXT NOT NULL,
      "planId" TEXT NOT NULL,
      "status" "AdminRechargeOrderStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
      "amount" DOUBLE PRECISION NOT NULL,
      "currency" TEXT NOT NULL DEFAULT 'IRT',
      "trafficBytes" BIGINT NOT NULL DEFAULT 0,
      "expiryDays" INTEGER NOT NULL DEFAULT 0,
      "maxClientsDelta" INTEGER NOT NULL DEFAULT 0,
      "panelId" TEXT,
      "paymentMethod" TEXT NOT NULL DEFAULT 'manual_bank',
      "paymentMeta" JSONB,
      "receiptImage" TEXT,
      "receiptText" TEXT,
      "reviewedBy" TEXT,
      "reviewedAt" TIMESTAMP(3),
      "rejectReason" TEXT,
      "creditedAt" TIMESTAMP(3),
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AdminRechargeOrder_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "AdminRechargeOrder_trackingCode_key" ON "AdminRechargeOrder"("trackingCode")`,
    `CREATE TABLE IF NOT EXISTS "AdminRechargeTimeline" (
      "id" TEXT NOT NULL,
      "orderId" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "message" TEXT,
      "actor" TEXT,
      "metadata" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AdminRechargeTimeline_pkey" PRIMARY KEY ("id")
    )`,

    // Store fulfillment plugins (Eylan) — required by Premium store addons
    `ALTER TABLE "ProvisioningProfile" ADD COLUMN IF NOT EXISTS "providerId" TEXT NOT NULL DEFAULT 'panel_3xui'`,
    `ALTER TABLE "ProvisioningProfile" ALTER COLUMN "panelId" DROP NOT NULL`,
    `ALTER TABLE "ProvisioningProfile" ALTER COLUMN "inboundIds" SET DEFAULT '[]'`,
    `CREATE INDEX IF NOT EXISTS "ProvisioningProfile_providerId_idx" ON "ProvisioningProfile"("providerId")`,
    `ALTER TABLE "StoreOrder" ADD COLUMN IF NOT EXISTS "fulfillment" JSONB`,
    `CREATE TABLE IF NOT EXISTS "StoreAddonConnection" (
      "id" TEXT NOT NULL,
      "adminId" TEXT NOT NULL,
      "storeId" TEXT NOT NULL,
      "providerId" TEXT NOT NULL,
      "enabled" BOOLEAN NOT NULL DEFAULT false,
      "apiBaseUrl" TEXT NOT NULL DEFAULT '',
      "apiKeyEnc" TEXT NOT NULL DEFAULT '',
      "deliveryDomain" TEXT,
      "settings" JSONB,
      "optionsCache" JSONB,
      "optionsCachedAt" TIMESTAMP(3),
      "lastTestAt" TIMESTAMP(3),
      "lastTestOk" BOOLEAN,
      "lastTestError" TEXT,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "StoreAddonConnection_pkey" PRIMARY KEY ("id")
    )`,
    `CREATE UNIQUE INDEX IF NOT EXISTS "StoreAddonConnection_adminId_providerId_key" ON "StoreAddonConnection"("adminId", "providerId")`,
    `CREATE INDEX IF NOT EXISTS "StoreAddonConnection_storeId_idx" ON "StoreAddonConnection"("storeId")`,
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
