-- Additive platform architecture tables (themes, bot API keys, policy reservations).
CREATE TABLE IF NOT EXISTS "Theme" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "authorName" TEXT,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "settings" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Theme_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "Theme_slug_key" ON "Theme"("slug");

CREATE TABLE IF NOT EXISTS "ThemeVersion" (
    "id" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "changelog" TEXT,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThemeVersion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ThemeVersion_themeId_version_key" ON "ThemeVersion"("themeId", "version");
CREATE INDEX IF NOT EXISTS "ThemeVersion_themeId_createdAt_idx" ON "ThemeVersion"("themeId", "createdAt");

CREATE TABLE IF NOT EXISTS "ThemeAsset" (
    "id" TEXT NOT NULL,
    "themeId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'preview',
    "name" TEXT NOT NULL,
    "mimeType" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThemeAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ThemeAsset_themeId_idx" ON "ThemeAsset"("themeId");

CREATE TABLE IF NOT EXISTS "BotApiClient" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "keyPrefix" TEXT NOT NULL,
    "keyHash" TEXT NOT NULL,
    "scopes" JSONB NOT NULL DEFAULT '[]',
    "rateLimitPerMin" INTEGER NOT NULL DEFAULT 60,
    "webhookUrl" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BotApiClient_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BotApiClient_keyHash_key" ON "BotApiClient"("keyHash");
CREATE INDEX IF NOT EXISTS "BotApiClient_adminId_idx" ON "BotApiClient"("adminId");

CREATE TABLE IF NOT EXISTS "PolicyReservation" (
    "id" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "operation" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'reserved',
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PolicyReservation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PolicyReservation_adminId_status_idx" ON "PolicyReservation"("adminId", "status");
CREATE INDEX IF NOT EXISTS "PolicyReservation_createdAt_idx" ON "PolicyReservation"("createdAt");

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ThemeVersion_themeId_fkey'
    ) THEN
        ALTER TABLE "ThemeVersion"
            ADD CONSTRAINT "ThemeVersion_themeId_fkey"
            FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'ThemeAsset_themeId_fkey'
    ) THEN
        ALTER TABLE "ThemeAsset"
            ADD CONSTRAINT "ThemeAsset_themeId_fkey"
            FOREIGN KEY ("themeId") REFERENCES "Theme"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'BotApiClient_adminId_fkey'
    ) THEN
        ALTER TABLE "BotApiClient"
            ADD CONSTRAINT "BotApiClient_adminId_fkey"
            FOREIGN KEY ("adminId") REFERENCES "Admin"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
