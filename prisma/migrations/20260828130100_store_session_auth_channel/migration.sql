-- Track how the customer session was created (telegram mini-app vs permanent token).
ALTER TABLE "StoreCustomerSession" ADD COLUMN IF NOT EXISTS "authChannel" TEXT NOT NULL DEFAULT 'token';
