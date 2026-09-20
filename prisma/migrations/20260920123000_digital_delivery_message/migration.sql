-- Optional delivery message template for DIGITAL products ({code} placeholder).
ALTER TABLE "StoreProduct" ADD COLUMN IF NOT EXISTS "digitalDeliveryMessage" TEXT;
