import { Injectable, Logger } from '@nestjs/common';
import { IncidentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
  capabilitiesForPanelType,
  isExternalPanelType,
  parseNativeCapabilities,
} from './native-panel-capabilities';
import { PanelDriverRegistry } from './panel-driver.registry';
import { PanelOperationGate } from './panel-operation-gate';
import type { PanelSyncResult, RemoteClientSnapshot } from './panel-driver.types';
import { generatePanelKey } from './panel-identity.util';

const CONNECTIVITY_INCIDENT = 'Provider Unreachable';
/** Keep in Community core — do not import Premium overlay (`plugins/shared`). */
const OPEN_INCIDENT_STATUSES: IncidentStatus[] = ['ACTIVE', 'OPEN', 'ACKNOWLEDGED'];

@Injectable()
export class NativePanelOrchestrator {
  private readonly logger = new Logger(NativePanelOrchestrator.name);

  constructor(
    private prisma: PrismaService,
    private registry: PanelDriverRegistry,
    private gate: PanelOperationGate,
  ) {}

  async sync(panelId: string): Promise<PanelSyncResult> {
    const started = Date.now();
    const panel = await this.prisma.panel.findUnique({ where: { id: panelId } });
    if (!panel) {
      return { success: false, syncedClients: 0, syncedInbounds: 0, error: 'Panel not found' };
    }
    if (!isExternalPanelType(panel.panelType)) {
      return { success: false, syncedClients: 0, syncedInbounds: 0, error: 'Not an external panel' };
    }

    const decision = await this.gate.decide(panel);
    if (!decision.operable) {
      this.logger.warn(`Skipping sync for frozen panel ${panel.name} (${decision.reason})`);
      return {
        success: true,
        skipped: true,
        reason: decision.reason,
        syncedClients: 0,
        syncedInbounds: 0,
        durationMs: Date.now() - started,
      };
    }

    const syncDriver = this.registry.getSync(panel.panelType);
    if (!syncDriver) {
      return {
        success: true,
        skipped: true,
        reason: 'no_driver',
        syncedClients: 0,
        syncedInbounds: 0,
      };
    }

    try {
      const result = await syncDriver.sync(panelId);
      await this.prisma.panel.update({
        where: { id: panelId },
        data: {
          connectionHealth: 'CONNECTED',
          lastSyncError: null,
          lastSync: new Date(),
          lastOnline: new Date(),
          lastHealthCheckAt: new Date(),
          status: 'online',
          nativeCapabilities: capabilitiesForPanelType(
            panel.panelType,
          ) as unknown as Prisma.InputJsonValue,
        },
      });
      await this.autoResolve(panelId, CONNECTIVITY_INCIDENT);
      await this.autoResolve(panelId, 'Node Offline');
      return { ...result, durationMs: Date.now() - started };
    } catch (err: any) {
      const message = String(err?.message || err).slice(0, 500);
      this.logger.warn(`Native sync failed for ${panel.name}: ${message}`);
      await this.prisma.panel.update({
        where: { id: panelId },
        data: {
          connectionHealth: 'DISCONNECTED',
          lastSyncError: message,
          lastHealthCheckAt: new Date(),
          status: 'offline',
        },
      });
      await this.prisma.client.updateMany({
        where: { panelId },
        data: { syncStale: true },
      });
      return {
        success: false,
        syncedClients: 0,
        syncedInbounds: 0,
        error: message,
        durationMs: Date.now() - started,
      };
    }
  }

  async ensurePanelKey(panelId: string): Promise<string> {
    const panel = await this.prisma.panel.findUnique({
      where: { id: panelId },
      select: { id: true, panelKey: true },
    });
    if (!panel) throw new Error('Panel not found');
    if (panel.panelKey) return panel.panelKey;
    const panelKey = generatePanelKey();
    await this.prisma.panel.update({ where: { id: panelId }, data: { panelKey } });
    return panelKey;
  }

  capabilitiesOf(panel: { panelType?: string | null; nativeCapabilities?: unknown }) {
    return parseNativeCapabilities(panel.nativeCapabilities, panel.panelType);
  }

  private async autoResolve(panelId: string, type: string) {
    const open = await this.prisma.incident.findMany({
      where: { panelId, type, status: { in: OPEN_INCIDENT_STATUSES } },
    });
    for (const incident of open) {
      const duration = Math.round((Date.now() - incident.detectedAt.getTime()) / 60000);
      await this.prisma.incident.update({
        where: { id: incident.id },
        data: {
          status: 'RESOLVED',
          resolvedAt: new Date(),
          recoveryTime: duration,
          resolvedSource: 'system',
        },
      });
    }
  }
}

export function snapshotToClientUuid(panelType: string, username: string): string {
  const { createHash } = require('crypto') as typeof import('crypto');
  const hex = createHash('sha1').update(`${panelType}:${username}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

export function mapSnapshotMeta(snapshot: RemoteClientSnapshot): Prisma.InputJsonValue {
  return {
    ...(snapshot.providerMeta || {}),
    remoteUserId: snapshot.remoteUserId ?? null,
    subscriptionUrl: snapshot.subscriptionUrl ?? null,
    online: snapshot.online ?? false,
    activeConnections: snapshot.activeConnections ?? 0,
  } as Prisma.InputJsonValue;
}
