-- Store loyalty defaults + per-customer overrides; referral grant every-N batches
ALTER TABLE "StoreProfile" ADD COLUMN IF NOT EXISTS "loyaltyEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StoreProfile" ADD COLUMN IF NOT EXISTS "loyaltyMinRenewals" INTEGER NOT NULL DEFAULT 2;
ALTER TABLE "StoreProfile" ADD COLUMN IF NOT EXISTS "loyaltyDiscountPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;
ALTER TABLE "StoreProfile" ADD COLUMN IF NOT EXISTS "loyaltyApplyRenewals" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "StoreProfile" ADD COLUMN IF NOT EXISTS "loyaltyApplyNewPurchases" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "StoreCustomer" ADD COLUMN IF NOT EXISTS "loyalManual" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StoreCustomer" ADD COLUMN IF NOT EXISTS "loyalDiscountPercent" DOUBLE PRECISION;
ALTER TABLE "StoreCustomer" ADD COLUMN IF NOT EXISTS "loyalApplyRenewals" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "StoreCustomer" ADD COLUMN IF NOT EXISTS "loyalApplyNewPurchases" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "StoreReferralRewardGrant" ADD COLUMN IF NOT EXISTS "batchIndex" INTEGER NOT NULL DEFAULT 1;
DROP INDEX IF EXISTS "StoreReferralRewardGrant_rewardId_customerId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "StoreReferralRewardGrant_rewardId_customerId_batchIndex_key"
  ON "StoreReferralRewardGrant"("rewardId", "customerId", "batchIndex");
