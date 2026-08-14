-- Store fulfillment plugins (Eylan) + optional panel on provisioning profiles

ALTER TABLE "ProvisioningProfile" ADD COLUMN IF NOT EXISTS "providerId" TEXT NOT NULL DEFAULT 'panel_3xui';

ALTER TABLE "ProvisioningProfile" ALTER COLUMN "panelId" DROP NOT NULL;

ALTER TABLE "ProvisioningProfile" ALTER COLUMN "inboundIds" SET DEFAULT '[]';

CREATE INDEX IF NOT EXISTS "ProvisioningProfile_providerId_idx" ON "ProvisioningProfile"("providerId");

ALTER TABLE "StoreOrder" ADD COLUMN IF NOT EXISTS "fulfillment" JSONB;

CREATE TABLE IF NOT EXISTS "StoreAddonConnection" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "storeId" TEXT NOT NULL,
  "providerId" TEXT NOT NULL,
  "enabled" BOOLEAN NOT NULL DEFAULT false,
  "apiBaseUrl" TEXT NOT NULL DEFAULT '',
  "apiKeyEnc" TEXT NOT NULL DEFAULT '',
  "deliveryDomain" TEXT,
  "settings" JSONB,
  "optionsCache" JSONB,
  "optionsCachedAt" TIMESTAMP(3),
  "lastTestAt" TIMESTAMP(3),
  "lastTestOk" BOOLEAN,
  "lastTestError" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StoreAddonConnection_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StoreAddonConnection_adminId_providerId_key" ON "StoreAddonConnection"("adminId", "providerId");
CREATE INDEX IF NOT EXISTS "StoreAddonConnection_storeId_idx" ON "StoreAddonConnection"("storeId");

DO $$ BEGIN
  ALTER TABLE "StoreAddonConnection" ADD CONSTRAINT "StoreAddonConnection_adminId_fkey"
    FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "StoreAddonConnection" ADD CONSTRAINT "StoreAddonConnection_storeId_fkey"
    FOREIGN KEY ("storeId") REFERENCES "StoreProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
