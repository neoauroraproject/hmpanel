-- AlterTable
ALTER TABLE "StoreProfile" ADD COLUMN IF NOT EXISTS "telegramBotEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StoreProfile" ADD COLUMN IF NOT EXISTS "telegramBotTokenEnc" TEXT;
ALTER TABLE "StoreProfile" ADD COLUMN IF NOT EXISTS "telegramBotUsername" TEXT;
ALTER TABLE "StoreProfile" ADD COLUMN IF NOT EXISTS "telegramWebhookSecret" TEXT;
ALTER TABLE "StoreProfile" ADD COLUMN IF NOT EXISTS "telegramWelcomeText" TEXT;

-- AlterTable
ALTER TABLE "StoreCustomer" ADD COLUMN IF NOT EXISTS "telegramUserId" TEXT;
ALTER TABLE "StoreCustomer" ADD COLUMN IF NOT EXISTS "telegramUsername" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "StoreCustomer_telegramUserId_idx" ON "StoreCustomer"("telegramUserId");

-- CreateUniqueIndex (nullable telegramUserId: Postgres allows multiple NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS "StoreCustomer_adminId_telegramUserId_key" ON "StoreCustomer"("adminId", "telegramUserId");
