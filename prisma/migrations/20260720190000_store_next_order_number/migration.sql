-- Sequential per-store order numbers (stored in StoreOrder.trackingCode as "1000", "1001", …)
ALTER TABLE "StoreProfile" ADD COLUMN IF NOT EXISTS "nextOrderNumber" INTEGER NOT NULL DEFAULT 1000;
