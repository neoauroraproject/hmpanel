-- Agency & Credit system expansion

DO $$ BEGIN
  CREATE TYPE "AgencyPlanKind" AS ENUM ('TOP_UP', 'NEW_AGENCY', 'BOTH');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "AgencyOrderKind" AS ENUM ('TOP_UP', 'NEW_AGENCY');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "AdminRechargeOrderStatus" ADD VALUE IF NOT EXISTS 'PROVISIONING';
ALTER TYPE "AdminRechargeOrderStatus" ADD VALUE IF NOT EXISTS 'PROVISION_FAILED';

CREATE TABLE IF NOT EXISTS "AdminRechargePlanCategory" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "slug" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminRechargePlanCategory_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AdminRechargePlanCategory_slug_key" ON "AdminRechargePlanCategory"("slug");

CREATE TABLE IF NOT EXISTS "AgencyReferralCode" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "ownerTelegramChatId" TEXT,
  "ownerAdminId" TEXT,
  "referralCount" INTEGER NOT NULL DEFAULT 0,
  "totalPurchaseAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgencyReferralCode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AgencyReferralCode_code_key" ON "AgencyReferralCode"("code");
CREATE INDEX IF NOT EXISTS "AgencyReferralCode_ownerTelegramChatId_idx" ON "AgencyReferralCode"("ownerTelegramChatId");

CREATE TABLE IF NOT EXISTS "AgencyBuyerSession" (
  "id" TEXT NOT NULL,
  "telegramChatId" TEXT NOT NULL,
  "referralCodeId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AgencyBuyerSession_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AgencyBuyerSession_telegramChatId_key" ON "AgencyBuyerSession"("telegramChatId");

ALTER TABLE "AdminRechargePlan" ADD COLUMN IF NOT EXISTS "categoryId" TEXT;
ALTER TABLE "AdminRechargePlan" ADD COLUMN IF NOT EXISTS "planKind" "AgencyPlanKind" NOT NULL DEFAULT 'TOP_UP';
ALTER TABLE "AdminRechargePlan" ADD COLUMN IF NOT EXISTS "adminTemplate" JSONB;

ALTER TABLE "AdminRechargeOrder" ALTER COLUMN "adminId" DROP NOT NULL;
ALTER TABLE "AdminRechargeOrder" ADD COLUMN IF NOT EXISTS "orderKind" "AgencyOrderKind" NOT NULL DEFAULT 'TOP_UP';
ALTER TABLE "AdminRechargeOrder" ADD COLUMN IF NOT EXISTS "targetAdminId" TEXT;
ALTER TABLE "AdminRechargeOrder" ADD COLUMN IF NOT EXISTS "createdAdminId" TEXT;
ALTER TABLE "AdminRechargeOrder" ADD COLUMN IF NOT EXISTS "requestedUsername" TEXT;
ALTER TABLE "AdminRechargeOrder" ADD COLUMN IF NOT EXISTS "requestedPasswordEnc" TEXT;
ALTER TABLE "AdminRechargeOrder" ADD COLUMN IF NOT EXISTS "buyerSessionId" TEXT;
ALTER TABLE "AdminRechargeOrder" ADD COLUMN IF NOT EXISTS "referralCodeId" TEXT;
ALTER TABLE "AdminRechargeOrder" ADD COLUMN IF NOT EXISTS "provisionError" TEXT;
ALTER TABLE "AdminRechargeOrder" ADD COLUMN IF NOT EXISTS "telegramAdminMessageId" TEXT;

CREATE INDEX IF NOT EXISTS "AdminRechargePlan_categoryId_enabled_idx" ON "AdminRechargePlan"("categoryId", "enabled");
CREATE INDEX IF NOT EXISTS "AdminRechargeOrder_targetAdminId_createdAt_idx" ON "AdminRechargeOrder"("targetAdminId", "createdAt");
CREATE INDEX IF NOT EXISTS "AdminRechargeOrder_buyerSessionId_createdAt_idx" ON "AdminRechargeOrder"("buyerSessionId", "createdAt");
CREATE INDEX IF NOT EXISTS "AdminRechargeOrder_orderKind_status_idx" ON "AdminRechargeOrder"("orderKind", "status");

-- Seed default categories
INSERT INTO "AdminRechargePlanCategory" ("id", "name", "slug", "sortOrder", "enabled", "createdAt", "updatedAt")
SELECT 'cat_direct', 'پلن مستقیم', 'direct', 0, true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "AdminRechargePlanCategory" WHERE "slug" = 'direct');

INSERT INTO "AdminRechargePlanCategory" ("id", "name", "slug", "sortOrder", "enabled", "createdAt", "updatedAt")
SELECT 'cat_tunnel', 'پلن تانل', 'tunnel', 1, true, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "AdminRechargePlanCategory" WHERE "slug" = 'tunnel');
