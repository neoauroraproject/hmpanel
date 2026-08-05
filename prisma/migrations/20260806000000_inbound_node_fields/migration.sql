-- Node-hosted inbounds: allow same port as master with distinct panelInboundId
ALTER TABLE "Inbound" ADD COLUMN IF NOT EXISTS "nodeId" INTEGER;
ALTER TABLE "Inbound" ADD COLUMN IF NOT EXISTS "originNodeGuid" TEXT;
CREATE INDEX IF NOT EXISTS "Inbound_panelId_panelInboundId_idx" ON "Inbound"("panelId", "panelInboundId");
CREATE INDEX IF NOT EXISTS "Inbound_panelId_port_idx" ON "Inbound"("panelId", "port");
