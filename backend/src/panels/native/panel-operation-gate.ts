import { BadRequestException, Injectable } from '@nestjs/common';
import { FeatureManagerService } from '../../platform/feature-manager.service';
import {
  EXTERNAL_PANELS_MODULE_ID,
  isExternalPanelType,
} from './native-panel-capabilities';
import { PanelDriverRegistry } from './panel-driver.registry';
import type { PanelOperationDecision } from './panel-driver.types';
import { parseConnectionHealth, type ConnectionHealth } from './panel-identity.util';

export type PanelGateRow = {
  panelType?: string | null;
  connectionHealth?: string | null;
};

@Injectable()
export class PanelOperationGate {
  constructor(
    private features: FeatureManagerService,
    private registry: PanelDriverRegistry,
  ) {}

  async decide(panel: PanelGateRow): Promise<PanelOperationDecision> {
    const health = parseConnectionHealth(panel.connectionHealth);
    if (!isExternalPanelType(panel.panelType)) {
      return { operable: true, reason: 'ok', connectionHealth: health };
    }
    if (health === 'DISABLED') {
      return {
        operable: false,
        reason: 'manually_disabled',
        connectionHealth: health,
      };
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
