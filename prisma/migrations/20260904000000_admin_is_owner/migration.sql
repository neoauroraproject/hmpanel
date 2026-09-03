-- Distinguishes the installation Super Admin from extra SUPER_ADMIN accounts.
ALTER TABLE "Admin" ADD COLUMN IF NOT EXISTS "isOwner" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Admin"
SET "isOwner" = true
WHERE id = (
  SELECT id FROM "Admin"
  WHERE role = 'SUPER_ADMIN'
  ORDER BY "createdAt" ASC
  LIMIT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS "Admin_single_owner" ON "Admin" ("isOwner") WHERE "isOwner" = true;
