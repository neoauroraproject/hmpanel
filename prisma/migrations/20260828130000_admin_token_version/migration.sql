-- Invalidate stale JWTs on password change / disable via monotonic tokenVersion.
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "tokenVersion" INTEGER NOT NULL DEFAULT 0;
