-- AdminProviderAccess + multi-line agency orders
DO $$ BEGIN CREATE TYPE "LineItemStatus" AS ENUM ('PENDING', 'PROCESSING', 'SUCCESS', 'FAILED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TYPE "AdminRechargeOrderStatus" ADD VALUE IF NOT EXISTS 'PARTIAL_SUCCESS';
ALTER TABLE "AdminRechargeOrder" ALTER COLUMN "planId" DROP NOT NULL;

CREATE TABLE IF NOT EXISTS "AdminRechargeOrderLineItem" (
  "id" TEXT PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "planId" TEXT NOT NULL,
  "planName" TEXT NOT NULL,
  "panelType" TEXT NOT NULL,
  "amount" DOUBLE PRECISION NOT NULL,
  "trafficBytes" BIGINT NOT NULL DEFAULT 0,
  "expiryDays" INTEGER NOT NULL DEFAULT 0,
  "maxClients" INTEGER NOT NULL DEFAULT 1,
  "unlimitedTraffic" BOOLEAN NOT NULL DEFAULT false,
  "panelId" TEXT,
  "adminTemplate" JSONB NOT NULL,
  "status" "LineItemStatus" NOT NULL DEFAULT 'PENDING',
  "operationId" TEXT NOT NULL UNIQUE,
  "lastError" TEXT,
  "processedAt" TIMESTAMP(3),
  "attemptCount" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "AdminProviderAccess" (
  "id" TEXT PRIMARY KEY,
  "adminId" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT true,
  "trafficBytes" BIGINT NOT NULL DEFAULT 0,
  "usedTrafficBytes" BIGINT NOT NULL DEFAULT 0,
  "expiryAt" TIMESTAMP(3),
  "maxClients" INTEGER NOT NULL DEFAULT 1,
  "unlimitedClients" BOOLEAN NOT NULL DEFAULT false,
  "unlimitedTraffic" BOOLEAN NOT NULL DEFAULT false,
  "quotaMode" "QuotaMode" NOT NULL DEFAULT 'GLOBAL',
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdminProviderAccess_adminId_provider_key" ON "AdminProviderAccess"("adminId", "provider");

CREATE TABLE IF NOT EXISTS "AdminProviderResource" (
  "id" TEXT PRIMARY KEY,
  "accessId" TEXT NOT NULL,
  "resourceId" TEXT NOT NULL,
  "resourceName" TEXT NOT NULL,
  "resourceType" TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "AdminProviderResource_accessId_resourceId_key" ON "AdminProviderResource"("accessId", "resourceId");
