-- Store PAYG (Pay As You Go) — independent catalog + metering ledger

CREATE TABLE IF NOT EXISTS "PaygSettings" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "minWalletBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "meterIntervalHours" INTEGER NOT NULL DEFAULT 1,
    "botButtonLabel" TEXT,
    "botMenuEnabled" BOOLEAN NOT NULL DEFAULT true,
    "autoResume" BOOLEAN NOT NULL DEFAULT true,
    "currency" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaygSettings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PaygSettings_adminId_key" ON "PaygSettings"("adminId");

CREATE TABLE IF NOT EXISTS "PaygCategory" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaygCategory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PaygCategory_adminId_sortOrder_idx" ON "PaygCategory"("adminId", "sortOrder");
CREATE INDEX IF NOT EXISTS "PaygCategory_adminId_enabled_idx" ON "PaygCategory"("adminId", "enabled");

CREATE TABLE IF NOT EXISTS "PaygPlan" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "billingMode" TEXT NOT NULL,
    "pricePerDay" DOUBLE PRECISION,
    "pricePerHour" DOUBLE PRECISION,
    "pricePerGb" DOUBLE PRECISION,
    "limitIp" INTEGER NOT NULL DEFAULT 0,
    "provisioningProfileId" TEXT NOT NULL,
    "minWalletBalance" DOUBLE PRECISION,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaygPlan_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PaygPlan_adminId_active_idx" ON "PaygPlan"("adminId", "active");
CREATE INDEX IF NOT EXISTS "PaygPlan_categoryId_idx" ON "PaygPlan"("categoryId");
CREATE INDEX IF NOT EXISTS "PaygPlan_provisioningProfileId_idx" ON "PaygPlan"("provisioningProfileId");

CREATE TABLE IF NOT EXISTS "PaygSubscription" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "clientId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "meterCursorBytes" BIGINT NOT NULL DEFAULT 0,
    "meterCursorAt" TIMESTAMP(3),
    "lastBilledAt" TIMESTAMP(3),
    "activatedAt" TIMESTAMP(3),
    "suspendedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaygSubscription_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PaygSubscription_adminId_status_idx" ON "PaygSubscription"("adminId", "status");
CREATE INDEX IF NOT EXISTS "PaygSubscription_customerId_status_idx" ON "PaygSubscription"("customerId", "status");
CREATE INDEX IF NOT EXISTS "PaygSubscription_planId_idx" ON "PaygSubscription"("planId");
CREATE INDEX IF NOT EXISTS "PaygSubscription_clientId_idx" ON "PaygSubscription"("clientId");

CREATE TABLE IF NOT EXISTS "PaygUsageLedger" (
    "id" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "meterCursor" TEXT NOT NULL,
    "walletLedgerId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaygUsageLedger_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PaygUsageLedger_subscriptionId_meterCursor_key"
  ON "PaygUsageLedger"("subscriptionId", "meterCursor");
CREATE INDEX IF NOT EXISTS "PaygUsageLedger_subscriptionId_createdAt_idx"
  ON "PaygUsageLedger"("subscriptionId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "PaygSettings" ADD CONSTRAINT "PaygSettings_adminId_fkey"
    FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PaygCategory" ADD CONSTRAINT "PaygCategory_adminId_fkey"
    FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PaygPlan" ADD CONSTRAINT "PaygPlan_adminId_fkey"
    FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PaygPlan" ADD CONSTRAINT "PaygPlan_categoryId_fkey"
    FOREIGN KEY ("categoryId") REFERENCES "PaygCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PaygSubscription" ADD CONSTRAINT "PaygSubscription_adminId_fkey"
    FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PaygSubscription" ADD CONSTRAINT "PaygSubscription_customerId_fkey"
    FOREIGN KEY ("customerId") REFERENCES "StoreCustomer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PaygSubscription" ADD CONSTRAINT "PaygSubscription_planId_fkey"
    FOREIGN KEY ("planId") REFERENCES "PaygPlan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PaygSubscription" ADD CONSTRAINT "PaygSubscription_clientId_fkey"
    FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "PaygUsageLedger" ADD CONSTRAINT "PaygUsageLedger_subscriptionId_fkey"
    FOREIGN KEY ("subscriptionId") REFERENCES "PaygSubscription"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
