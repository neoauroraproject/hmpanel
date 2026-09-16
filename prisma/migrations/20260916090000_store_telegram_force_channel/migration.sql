-- Optional forced-membership Telegram channel per store (@username or chat id).
ALTER TABLE "StoreProfile" ADD COLUMN IF NOT EXISTS "telegramForceChannel" TEXT;
