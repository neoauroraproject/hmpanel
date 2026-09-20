-- Store Digital Goods (Phase 2)
-- Adds product kinds (VPN | PAYG | DIGITAL) and the code inventory used by DIGITAL products.

ALTER TABLE "StoreProduct" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'VPN';
ALTER TABLE "StoreProduct" ADD COLUMN IF NOT EXISTS "digitalDeliveryMode" TEXT NOT NULL DEFAULT 'AUTOMATIC';
ALTER TABLE "StoreProduct" ALTER COLUMN "profileId" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "StoreProduct_kind_idx" ON "StoreProduct"("kind");

CREATE TABLE IF NOT EXISTS "InventoryPool" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "name" TEXT,
    "lowStockThreshold" INTEGER NOT NULL DEFAULT 10,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryPool_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "InventoryPool_productId_key" ON "InventoryPool"("productId");
CREATE INDEX IF NOT EXISTS "InventoryPool_adminId_idx" ON "InventoryPool"("adminId");

CREATE TABLE IF NOT EXISTS "InventoryUnit" (
    "id" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "codeEnc" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "reservedForOrderId" TEXT,
    "reservedAt" TIMESTAMP(3),
    "soldAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryUnit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "InventoryUnit_poolId_codeHash_key" ON "InventoryUnit"("poolId", "codeHash");
CREATE INDEX IF NOT EXISTS "InventoryUnit_poolId_status_idx" ON "InventoryUnit"("poolId", "status");
CREATE INDEX IF NOT EXISTS "InventoryUnit_reservedForOrderId_idx" ON "InventoryUnit"("reservedForOrderId");

CREATE TABLE IF NOT EXISTS "DigitalDelivery" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "channel" TEXT NOT NULL DEFAULT 'system',
    "revealedAt" TIMESTAMP(3),
    "deliveredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DigitalDelivery_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DigitalDelivery_orderId_key" ON "DigitalDelivery"("orderId");
CREATE UNIQUE INDEX IF NOT EXISTS "DigitalDelivery_unitId_key" ON "DigitalDelivery"("unitId");

DO $$ BEGIN
  ALTER TABLE "InventoryPool" ADD CONSTRAINT "InventoryPool_adminId_fkey"
    FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "InventoryPool" ADD CONSTRAINT "InventoryPool_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "StoreProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "InventoryUnit" ADD CONSTRAINT "InventoryUnit_poolId_fkey"
    FOREIGN KEY ("poolId") REFERENCES "InventoryPool"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DigitalDelivery" ADD CONSTRAINT "DigitalDelivery_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "StoreOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DigitalDelivery" ADD CONSTRAINT "DigitalDelivery_unitId_fkey"
    FOREIGN KEY ("unitId") REFERENCES "InventoryUnit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
