-- Store auto-delivery + pending review tags
ALTER TABLE "StoreProfile" ADD COLUMN IF NOT EXISTS "autoDeliverEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StoreProfile" ADD COLUMN IF NOT EXISTS "autoDeliverDelayMinutes" INTEGER NOT NULL DEFAULT 10;

ALTER TABLE "StoreOrder" ADD COLUMN IF NOT EXISTS "autoDeliverAt" TIMESTAMP(3);
ALTER TABLE "StoreOrder" ADD COLUMN IF NOT EXISTS "autoDelivered" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StoreOrder" ADD COLUMN IF NOT EXISTS "pendingReview" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StoreOrder" ADD COLUMN IF NOT EXISTS "renewSnapshot" JSONB;

CREATE INDEX IF NOT EXISTS "StoreOrder_autoDeliverAt_idx" ON "StoreOrder"("autoDeliverAt");
CREATE INDEX IF NOT EXISTS "StoreOrder_pendingReview_idx" ON "StoreOrder"("pendingReview");
