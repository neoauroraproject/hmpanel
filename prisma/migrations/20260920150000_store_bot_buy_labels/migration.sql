-- StoreProfile buy-hub button labels for Telegram bot
ALTER TABLE "StoreProfile" ADD COLUMN IF NOT EXISTS "botBuyVpnLabel" TEXT;
ALTER TABLE "StoreProfile" ADD COLUMN IF NOT EXISTS "botBuyDigitalLabel" TEXT;
