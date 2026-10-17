import { BadRequestException, Injectable, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { FeatureManagerService } from '../../platform/feature-manager.service';
import {
  EXTERNAL_PANELS_MODULE_ID,
  isExternalPanelType,
} from './native-panel-capabilities';
import { PanelDriverRegistry } from './panel-driver.registry';
import type { PanelOperationDecision } from './panel-driver.types';
import { parseConnectionHealth, type ConnectionHealth } from './panel-identity.util';

export type PanelGateRow = {
  id?: string;
  panelType?: string | null;
  connectionHealth?: string | null;
  connectionId?: string | null;
};

@Injectable()
export class PanelOperationGate {
  constructor(
    private features: FeatureManagerService,
    private registry: PanelDriverRegistry,
    @Optional() private prisma?: PrismaService,
  ) {}

  async decide(panel: PanelGateRow): Promise<PanelOperationDecision> {
    let health = parseConnectionHealth(panel.connectionHealth);
    if (!isExternalPanelType(panel.panelType)) {
      return { operable: true, reason: 'ok', connectionHealth: health };
    }
    if (health === 'DISABLED') {
      const revived = await this.reviveIfConnectionLive(panel);
      if (!revived) {
        return {
          operable: false,
          reason: 'manually_disabled',
          connectionHealth: health,
        };
      }
      health = 'CONNECTED';
    }
    const canWrite = await this.features.canWrite(EXTERNAL_PANELS_MODULE_ID);
    if (!canWrite) {
      return {
        operable: false,
        reason: 'premium_unavailable',
        connectionHealth: health === 'UNKNOWN' ? health : health,
      };
    }
    if (!this.registry.has(panel.panelType) || !this.registry.hasSync(panel.panelType)) {
      return {
        operable: false,
        reason: 'no_driver',
        connectionHealth: health,
      };
    }
    return { operable: true, reason: 'ok', connectionHealth: health };
  }

  async canOperate(panel: PanelGateRow): Promise<boolean> {
    return (await this.decide(panel)).operable;
  }

  async assertCanOperate(panel: PanelGateRow): Promise<void> {
    const decision = await this.decide(panel);
    if (decision.operable) return;
    if (decision.reason === 'manually_disabled') {
      throw new BadRequestException('This panel is disconnected. Reconnect before making changes.');
    }
    throw new BadRequestException(
      'Premium unavailable — this panel is frozen. 3x-ui panels still work.',
    );
  }

  /**
   * A successful test used to leave `connectionHealth = DISABLED` while the
   * addon connection stayed live. Treat that as connected so client writes work.
   * A real disconnect sets the addon connection `enabled` to false.
   */
  private async reviveIfConnectionLive(panel: PanelGateRow): Promise<boolean> {
    if (!this.prisma) return false;
    try {
      let connectionId = panel.connectionId || null;
      if (!connectionId && panel.id) {
        const row = await this.prisma.panel.findUnique({
          where: { id: panel.id },
          select: { connectionId: true },
        });
        connectionId = row?.connectionId || null;
      }
      if (!connectionId) return false;
      const conn = await this.prisma.storeAddonConnection.findUnique({
        where: { id: connectionId },
        select: { id: true, enabled: true, apiBaseUrl: true, apiKeyEnc: true, lastTestOk: true },
      });
      if (!conn?.apiBaseUrl || !conn.apiKeyEnc) return false;
      const live = conn.enabled || conn.lastTestOk === true;
      if (!live) return false;
      if (!conn.enabled) {
        await this.prisma.storeAddonConnection.update({
          where: { id: conn.id },
          data: { enabled: true },
        });
      }
      if (panel.id) {
        await this.prisma.panel.update({
          where: { id: panel.id },
          data: { connectionHealth: 'CONNECTED', status: 'online' },
        });
      }
      return true;
    } catch {
      return false;
    }
  }
}

export function freezeLabel(reason: PanelOperationDecision['reason']): string | null {
  if (reason === 'ok') return null;
  if (reason === 'manually_disabled') return 'Disconnected';
  return 'Premium unavailable';
}

export function withOperable<T extends PanelGateRow>(
  panel: T,
  decision: PanelOperationDecision,
): T & {
  operable: boolean;
  freezeReason: string | null;
  connectionHealth: ConnectionHealth;
} {
  return {
    ...panel,
    operable: decision.operable,
    freezeReason: freezeLabel(decision.reason),
    connectionHealth: decision.connectionHealth,
  };
}
