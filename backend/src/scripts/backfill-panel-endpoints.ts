import type { PrismaClient } from '@prisma/client';
import {
  derivePanelConnectionFromUrl,
  panelEndpointFieldsMatchStored,
} from '../common/utils/panel-url.util';

/** Repair panels whose cached apiBaseUrl/webBasePath drifted from url. Safe to run on every boot. */
export async function backfillPanelEndpointFields(
  prisma: PrismaClient,
): Promise<{ scanned: number; updated: number; skipped: number }> {
  const panels = await prisma.panel.findMany({
    select: { id: true, url: true, apiBaseUrl: true, webBasePath: true },
  });

  let updated = 0;
  let skipped = 0;

  for (const panel of panels) {
    try {
      const derived = derivePanelConnectionFromUrl(panel.url);
      if (panelEndpointFieldsMatchStored(panel, derived)) continue;

      await prisma.panel.update({
        where: { id: panel.id },
        data: {
          url: derived.normalizedUrl,
          webBasePath: derived.webBasePath,
          apiBaseUrl: derived.apiBaseUrl,
        },
      });
      updated++;
    } catch {
      skipped++;
    }
  }

  return { scanned: panels.length, updated, skipped };
}
