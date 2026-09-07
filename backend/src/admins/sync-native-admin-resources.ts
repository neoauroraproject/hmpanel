import type { PrismaClient } from '@prisma/client';

export type NativePanelType = 'eylan' | 'pasarguard';

type ResourceRef = string | { resourceId?: string; resourceName?: string };

export function normalizeNativeResources(resources: ResourceRef[]) {
  const out: Array<{ resourceId: string; resourceName: string }> = [];
  const seen = new Set<string>();
  for (const raw of resources) {
    const resourceId = (
      typeof raw === 'string' ? raw : String(raw?.resourceId || '')
    ).trim();
    if (!resourceId) continue;
    const key = resourceId.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const resourceName =
      typeof raw === 'string'
        ? resourceId
        : String(raw.resourceName || raw.resourceId || resourceId).trim() ||
          resourceId;
    out.push({ resourceId, resourceName });
  }
  return out;
}

/**
 * Map granted Eylan instances / Pasarguard groups onto Inbound + AdminInbound
 * so the Clients form can list them like 3x-ui inbounds.
 */
export async function syncNativeAdminResources(
  prisma: PrismaClient,
  adminId: string,
  panelType: NativePanelType,
  resources: ResourceRef[],
) {
  const wanted = normalizeNativeResources(resources);
  const panels = await prisma.panel.findMany({
    where: { panelType },
    select: { id: true },
  });

  const inboundIds: string[] = [];
  for (const panel of panels) {
    for (const resource of wanted) {
      const remoteId = resource.resourceId;
      const numeric = Number(remoteId);
      const existing = await prisma.inbound.findFirst({
        where: {
          panelId: panel.id,
          OR: [
            { remoteResourceId: remoteId },
            ...(Number.isFinite(numeric) ? [{ panelInboundId: numeric }] : []),
          ],
        },
        select: { id: true },
      });
      if (existing) {
        await prisma.inbound.update({
          where: { id: existing.id },
          data: {
            remark: resource.resourceName,
            remoteResourceId: remoteId,
            protocol: panelType,
          },
        });
        inboundIds.push(existing.id);
        continue;
      }
      const created = await prisma.inbound.create({
        data: {
          panelId: panel.id,
          tag: `${panelType}-${remoteId}`.slice(0, 64),
          remark: resource.resourceName,
          port: Number.isFinite(numeric) && numeric > 0 ? numeric : 0,
          protocol: panelType,
          panelInboundId: Number.isFinite(numeric) ? numeric : null,
          remoteResourceId: remoteId,
          settings: {},
        },
        select: { id: true },
      });
      inboundIds.push(created.id);
    }
  }

  await prisma.adminInbound.deleteMany({
    where: { adminId, inbound: { panel: { panelType } } },
  });
  if (inboundIds.length) {
    await prisma.adminInbound.createMany({
      data: inboundIds.map((inboundId) => ({ adminId, inboundId })),
      skipDuplicates: true,
    });
  }
}

/** Rebuild native AdminInbound rows from saved AdminProviderAccess grants. */
export async function hydrateNativeAdminInbounds(
  prisma: PrismaClient,
  adminId: string,
) {
  try {
    const rows = await prisma.adminProviderAccess.findMany({
      where: {
        adminId,
        enabled: true,
        provider: { in: ['eylan', 'pasarguard'] },
      },
      include: { resources: true },
    });
    for (const row of rows) {
      const panelType = row.provider as NativePanelType;
      if (panelType !== 'eylan' && panelType !== 'pasarguard') continue;
      await syncNativeAdminResources(
        prisma,
        adminId,
        panelType,
        row.resources.map((r) => ({
          resourceId: r.resourceId,
          resourceName: r.resourceName,
        })),
      );
    }
  } catch {
    /* Provider-access tables may be absent on stripped community DBs. */
  }
}
