-- Client name pools, addon grants, referral rewards, StoreOrder.isTest

CREATE TABLE IF NOT EXISTS "ClientNamePool" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "prefix" TEXT NOT NULL,
  "separator" TEXT NOT NULL DEFAULT '-',
  "startNumber" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClientNamePool_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ClientNamePool_adminId_idx" ON "ClientNamePool"("adminId");

DO $$ BEGIN
  ALTER TABLE "ClientNamePool" ADD CONSTRAINT "ClientNamePool_adminId_fkey"
    FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "StoreAddonGrant" (
  "id" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "granterAdminId" TEXT NOT NULL,
  "granteeAdminId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "trafficQuotaBytes" BIGINT NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoreAddonGrant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StoreAddonGrant_providerId_granteeAdminId_key"
  ON "StoreAddonGrant"("providerId", "granteeAdminId");
CREATE INDEX IF NOT EXISTS "StoreAddonGrant_granterAdminId_idx" ON "StoreAddonGrant"("granterAdminId");
CREATE INDEX IF NOT EXISTS "StoreAddonGrant_granteeAdminId_idx" ON "StoreAddonGrant"("granteeAdminId");

DO $$ BEGIN
  ALTER TABLE "StoreAddonGrant" ADD CONSTRAINT "StoreAddonGrant_granterAdminId_fkey"
    FOREIGN KEY ("granterAdminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StoreAddonGrant" ADD CONSTRAINT "StoreAddonGrant_granteeAdminId_fkey"
    FOREIGN KEY ("granteeAdminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "StoreOrder" ADD COLUMN IF NOT EXISTS "isTest" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "StoreReferralReward" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "trigger" TEXT NOT NULL DEFAULT 'join',
  "minCount" INTEGER NOT NULL DEFAULT 3,
  "discountType" TEXT NOT NULL DEFAULT 'percent',
  "discountValue" DOUBLE PRECISION NOT NULL DEFAULT 10,
  "discountValueUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "discountValueToman" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "productIds" JSONB DEFAULT '[]',
  "categoryIds" JSONB DEFAULT '[]',
  "telegramMessage" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoreReferralReward_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "StoreReferralReward_adminId_enabled_idx"
  ON "StoreReferralReward"("adminId", "enabled");

DO $$ BEGIN
  ALTER TABLE "StoreReferralReward" ADD CONSTRAINT "StoreReferralReward_adminId_fkey"
    FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "StoreReferralRewardGrant" (
  "id" TEXT NOT NULL,
  "rewardId" TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "couponId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoreReferralRewardGrant_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StoreReferralRewardGrant_rewardId_customerId_key"
  ON "StoreReferralRewardGrant"("rewardId", "customerId");
CREATE INDEX IF NOT EXISTS "StoreReferralRewardGrant_customerId_idx" ON "StoreReferralRewardGrant"("customerId");

DO $$ BEGIN
  ALTER TABLE "StoreReferralRewardGrant" ADD CONSTRAINT "StoreReferralRewardGrant_rewardId_fkey"
    FOREIGN KEY ("rewardId") REFERENCES "StoreReferralReward"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StoreReferralRewardGrant" ADD CONSTRAINT "StoreReferralRewardGrant_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "StoreCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StoreReferralRewardGrant" ADD CONSTRAINT "StoreReferralRewardGrant_couponId_fkey"
    FOREIGN KEY ("couponId") REFERENCES "StoreCoupon"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
