-- Extend StoreAddonGrant for per-provider admin access
ALTER TABLE "StoreAddonGrant" ADD COLUMN IF NOT EXISTS "maxClients" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "StoreAddonGrant" ADD COLUMN IF NOT EXISTS "allowedScope" JSONB;

-- Shadow registry for external panel clients (quota + maxClients enforcement)
CREATE TABLE IF NOT EXISTS "ExternalClientRegistry" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "remoteUserId" TEXT,
    "trafficAllocatedBytes" BIGINT NOT NULL DEFAULT 0,
    "source" TEXT NOT NULL DEFAULT 'manual',
    "storeOrderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExternalClientRegistry_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ExternalClientRegistry_adminId_providerId_username_key"
    ON "ExternalClientRegistry"("adminId", "providerId", "username");

CREATE INDEX IF NOT EXISTS "ExternalClientRegistry_adminId_providerId_idx"
    ON "ExternalClientRegistry"("adminId", "providerId");

DO $$ BEGIN
    ALTER TABLE "ExternalClientRegistry" ADD CONSTRAINT "ExternalClientRegistry_adminId_fkey"
        FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; WHEN undefined_table THEN NULL; END $$;
