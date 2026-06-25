import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

export async function runIdentityMigration(prisma: PrismaClient) {
  console.log('Starting identity migration (v1.3.0-identity-split)...');
  
  // 1. Fetch all clients with their inbounds
  const clients = await prisma.client.findMany({
    include: {
      inbounds: {
        include: {
          inbound: true
        }
      }
    }
  });

  console.log(`Found ${clients.length} clients to migrate.`);

  for (const client of clients) {
    if (client.inbounds.length === 0) {
      console.log(`Client ${client.email} has no inbounds. Setting panelId to a dummy value or skipping.`);
      // If we must set a panelId but there are no inbounds, we can't reliably guess the panel.
      // But let's check if there are any panels.
      const firstPanel = await prisma.panel.findFirst();
      if (firstPanel) {
        await prisma.client.update({
          where: { id: client.id },
          data: { panelId: firstPanel.id }
        });
      }
      continue;
    }

    // Group inbounds by panelId
    const panelIds = new Set<string>();
    for (const ci of client.inbounds) {
      if (ci.inbound && ci.inbound.panelId) {
        panelIds.add(ci.inbound.panelId);
      }
    }

    const uniquePanels = Array.from(panelIds);
    if (uniquePanels.length === 0) continue;

    // The first panel keeps the original client record
    const primaryPanelId = uniquePanels[0];
    await prisma.client.update({
      where: { id: client.id },
      data: { panelId: primaryPanelId }
    });

    // For any additional panels, we must DUPLICATE the client
    for (let i = 1; i < uniquePanels.length; i++) {
      const additionalPanelId = uniquePanels[i];
      const newId = crypto.randomUUID();

      // Find inbounds for this specific panel
      const inboundsForThisPanel = client.inbounds.filter(ci => ci.inbound?.panelId === additionalPanelId);
      
      // Create a duplicate client record
      await prisma.client.create({
        data: {
          id: newId,
          panelId: additionalPanelId,
          adminId: client.adminId,
          brandId: client.brandId,
          email: client.email,
          remark: client.remark,
          ownerTag: client.ownerTag,
          uuid: crypto.randomUUID(), // New UUID since they are independent
          subId: client.subId, // Share SubId across panels for unified subscription
          subToken: client.subToken, // Share SubToken across panels
          flow: client.flow,
          balanceDeducted: client.balanceDeducted,
          enable: client.enable,
          disableReason: client.disableReason,
          provisioningStatus: client.provisioningStatus as any,
          limitIp: client.limitIp,
          up: client.up,
          down: client.down,
          total: client.total,
          expiryTime: client.expiryTime,
          createdWithTrafficMode: client.createdWithTrafficMode as any,
          createdAt: client.createdAt,
          // Re-link the inbounds to the new client
          inbounds: {
            create: inboundsForThisPanel.map(ci => ({
              inboundId: ci.inboundId
            }))
          }
        }
      });

      // Remove the old links from the primary client
      for (const ci of inboundsForThisPanel) {
        await prisma.clientInbound.delete({
          where: {
            clientId_inboundId: {
              clientId: client.id,
              inboundId: ci.inboundId
            }
          }
        });
      }
    }
  }

  console.log('Migration complete.');
  return {
    clientsMigrated: clients.length,
    success: true
  };
}
