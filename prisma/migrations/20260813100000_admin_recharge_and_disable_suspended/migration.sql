-- Admin recharge store + migrate suspended → disabled
UPDATE "Admin" SET status = 'disabled' WHERE status = 'suspended';

DO $$ BEGIN
  CREATE TYPE "AdminRechargeOrderStatus" AS ENUM (
    'PENDING_PAYMENT',
    'PAYMENT_SUBMITTED',
    'APPROVED',
    'REJECTED',
    'CANCELLED'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "AdminRechargePlan" (
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
);

CREATE TABLE IF NOT EXISTS "AdminRechargeOrder" (
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
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdminRechargeOrder_trackingCode_key" ON "AdminRechargeOrder"("trackingCode");
CREATE INDEX IF NOT EXISTS "AdminRechargeOrder_adminId_createdAt_idx" ON "AdminRechargeOrder"("adminId", "createdAt");
CREATE INDEX IF NOT EXISTS "AdminRechargeOrder_status_createdAt_idx" ON "AdminRechargeOrder"("status", "createdAt");

DO $$ BEGIN
  ALTER TABLE "AdminRechargeOrder" ADD CONSTRAINT "AdminRechargeOrder_adminId_fkey"
    FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AdminRechargeOrder" ADD CONSTRAINT "AdminRechargeOrder_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "AdminRechargePlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "AdminRechargeOrder" ADD CONSTRAINT "AdminRechargeOrder_panelId_fkey"
    FOREIGN KEY ("panelId") REFERENCES "Panel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "AdminRechargeTimeline" (
  "id" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "message" TEXT,
  "actor" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminRechargeTimeline_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "AdminRechargeTimeline_orderId_createdAt_idx" ON "AdminRechargeTimeline"("orderId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "AdminRechargeTimeline" ADD CONSTRAINT "AdminRechargeTimeline_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "AdminRechargeOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
