-- Optional display name for node-hosted inbounds (from 3x-ui /nodes/list)
ALTER TABLE "Inbound" ADD COLUMN IF NOT EXISTS "nodeName" TEXT;
