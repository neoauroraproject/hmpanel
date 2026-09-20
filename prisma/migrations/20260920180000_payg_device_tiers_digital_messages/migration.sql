-- PAYG device tiers + subscription pricing snapshot
ALTER TABLE "PaygPlan" ADD COLUMN IF NOT EXISTS "deviceTiers" JSONB;
ALTER TABLE "PaygSubscription" ADD COLUMN IF NOT EXISTS "limitIp" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "PaygSubscription" ADD COLUMN IF NOT EXISTS "unitPriceExtra" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- Digital product messaging
ALTER TABLE "StoreProduct" ADD COLUMN IF NOT EXISTS "digitalOrderMessage" TEXT;
ALTER TABLE "StoreProduct" ADD COLUMN IF NOT EXISTS "digitalGuideMessage" TEXT;
