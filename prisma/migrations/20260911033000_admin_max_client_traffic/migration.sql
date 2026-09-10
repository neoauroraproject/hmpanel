-- Per-client traffic cap a reseller may assign (GB). 0 = unlimited.
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "maxClientTrafficGb" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "AdminPanelQuota" ADD COLUMN IF NOT EXISTS "maxClientTrafficGb" INTEGER NOT NULL DEFAULT 0;
