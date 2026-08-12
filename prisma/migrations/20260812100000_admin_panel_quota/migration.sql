-- Per-panel traffic quota for multi-panel resellers
CREATE TYPE "QuotaMode" AS ENUM ('GLOBAL', 'PER_PANEL');

ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "quotaMode" "QuotaMode" NOT NULL DEFAULT 'GLOBAL';

CREATE TABLE IF NOT EXISTS "AdminPanelQuota" (
  "adminId" TEXT NOT NULL,
  "panelId" TEXT NOT NULL,
  "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "totalAssigned" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminPanelQuota_pkey" PRIMARY KEY ("adminId","panelId")
);

ALTER TABLE "AdminPanelQuota" DROP CONSTRAINT IF EXISTS "AdminPanelQuota_adminId_fkey";
ALTER TABLE "AdminPanelQuota" ADD CONSTRAINT "AdminPanelQuota_adminId_fkey"
  FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AdminPanelQuota" DROP CONSTRAINT IF EXISTS "AdminPanelQuota_panelId_fkey";
ALTER TABLE "AdminPanelQuota" ADD CONSTRAINT "AdminPanelQuota_panelId_fkey"
  FOREIGN KEY ("panelId") REFERENCES "Panel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TrafficTransaction" ADD COLUMN IF NOT EXISTS "panelId" TEXT;
