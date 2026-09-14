import { PrismaService } from '../prisma/prisma.service';

export type PanelInboundAccess = {
  panelId: string;
  inboundIds: string[];
};

export type LiveInboundResolution = {
  liveIds: string[];
  requested: number;
  foundById: number;
  remapped: number;
  filledFromPanel: number;
  missing: number;
};

const SENTINEL_PANEL_ID = 'panel_plus';

function uniq(ids: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of ids) {
    const id = String(raw || '').trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

/**
 * Map plan-template inbound refs onto rows that still exist.
 * Templates store local Inbound.id; panel sync can recreate those rows
 * with new UUIDs (same panelInboundId / remoteResourceId).
 */
export async function resolveLiveInboundIds(
  prisma: PrismaService,
  inboundIds: string[] | undefined | null,
  panelAccess?: PanelInboundAccess[] | null,
): Promise<LiveInboundResolution> {
  const requestedIds = uniq(inboundIds || []);
  const empty: LiveInboundResolution = {
    liveIds: [],
    requested: requestedIds.length,
    foundById: 0,
    remapped: 0,
    filledFromPanel: 0,
    missing: requestedIds.length,
  };
  if (!requestedIds.length) return { ...empty, missing: 0 };

  const byId = await prisma.inbound.findMany({
    where: { id: { in: requestedIds } },
    select: { id: true },
  });
  const live = new Set(byId.map((row) => row.id));
  let foundById = live.size;
  let remapped = 0;
  let filledFromPanel = 0;

  const missing = requestedIds.filter((id) => !live.has(id));
  if (missing.length) {
    const numerics = missing
      .map((id) => Number(id))
      .filter((n) => Number.isInteger(n) && n >= 0);
    const matches = await prisma.inbound.findMany({
      where: {
        OR: [
          ...(numerics.length ? [{ panelInboundId: { in: numerics } }] : []),
          { remoteResourceId: { in: missing } },
        ],
      },
      select: { id: true, panelInboundId: true, remoteResourceId: true },
    });
    const byRemote = new Map<string, string>();
    const byNumeric = new Map<number, string>();
    for (const row of matches) {
      if (row.remoteResourceId && !byRemote.has(row.remoteResourceId)) {
        byRemote.set(row.remoteResourceId, row.id);
      }
      if (row.panelInboundId != null && !byNumeric.has(row.panelInboundId)) {
        byNumeric.set(row.panelInboundId, row.id);
      }
    }
    for (const id of missing) {
      const viaRemote = byRemote.get(id);
      const n = Number(id);
      const viaNumeric =
        Number.isInteger(n) && n >= 0 ? byNumeric.get(n) : undefined;
      const mapped = viaRemote || viaNumeric;
      if (mapped && !live.has(mapped)) {
        live.add(mapped);
        remapped += 1;
      }
    }
  }

  if (requestedIds.length > live.size && panelAccess?.length) {
    for (const panel of panelAccess) {
      const panelId = String(panel.panelId || '').trim();
      if (!panelId || panelId === SENTINEL_PANEL_ID) continue;
      const wanted = uniq(panel.inboundIds || []);
      if (!wanted.length) continue;
      const wantedLive = wanted.filter((id) => live.has(id)).length;
      if (wantedLive > 0) continue;
      const current = await prisma.inbound.findMany({
        where: { panelId },
        select: { id: true },
      });
      if (current.length > 0) {
        for (const row of current) live.add(row.id);
        filledFromPanel += current.length;
      }
    }
  }

  if (live.size === 0) {
    const xui = await prisma.inbound.findMany({
      where: {
        panel: {
          NOT: { panelType: { in: ['eylan', 'pasarguard'] } },
        },
      },
      select: { id: true, panelId: true },
    });
    const panelIds = new Set(xui.map((row) => row.panelId));
    if (panelIds.size === 1 && xui.length) {
      for (const row of xui) live.add(row.id);
      filledFromPanel += xui.length;
    }
  }

  const liveIds = [...live];
  return {
    liveIds,
    requested: requestedIds.length,
    foundById,
    remapped,
    filledFromPanel,
    missing: Math.max(0, requestedIds.length - liveIds.length),
  };
}
