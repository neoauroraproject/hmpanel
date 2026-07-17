-- AlterTable
ALTER TABLE "Client" ADD COLUMN IF NOT EXISTS "connectionExtras" JSONB DEFAULT '{}';
