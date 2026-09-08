import { Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PanelDriverRegistry } from '../panels/native/panel-driver.registry';
import { PanelOperationRouter } from '../panels/native/panel-operation.router';
import { hasCapability } from '../panels/native/panel-capability.catalog';
import { PolicyEngine, type PolicyReserveInput } from '../authz/policy.engine';
import type { DriverCreateClientInput } from '../panels/native/panel-driver.types';

export interface ProvisionProductInput {
  panelId: string;
  panelType?: string | null;
  adminId: string;
  maxClients?: number;
  currentClients?: number;
  client: DriverCreateClientInput;
  policy?: Partial<PolicyReserveInput>;
}

/**
 * Product → Adapter capability → createUser with Reserve/Commit.
 * Store controllers should call this instead of duplicating create logic.
 */
@Injectable()
export class ProvisioningEngine {
  constructor(
    private moduleRef: ModuleRef,
    private policy: PolicyEngine,
  ) {}

  async provisionUser(input: ProvisionProductInput) {
    if (!hasCapability(input.panelType, 'USERS')) {
      throw new Error(
        `Panel type ${input.panelType || '3x-ui'} cannot provision users`,
      );
    }
    const router = this.operations();
    const execute = router
      ? () => router.createClient(input.panelType, input.panelId, input.client)
      : () => {
          const driver = this.drivers().get(input.panelType);
          if (!driver) {
            throw new Error(`No panel driver for type ${input.panelType || '3x-ui'}`);
          }
          return driver.createClient(input.panelId, input.client);
        };
    return this.policy.runReserved(
      {
        adminId: input.adminId,
        operation: 'CREATE_USER',
        maxClients: input.maxClients ?? 0,
        currentClients: input.currentClients ?? 0,
        trafficBytes: input.client.totalBytes ?? 0,
        ...input.policy,
      },
      execute,
    );
  }

  private drivers(): PanelDriverRegistry {
    return this.moduleRef.get(PanelDriverRegistry, { strict: false });
  }

  private operations(): PanelOperationRouter | undefined {
    try {
      const found = this.moduleRef.get(PanelOperationRouter, { strict: false }) as
        | PanelOperationRouter
        | undefined;
      if (found && typeof found.createClient === 'function' && typeof found.requireDriver === 'function') {
        return found;
      }
    } catch {
      /* PanelsModule not loaded (unit tests) */
    }
    return undefined;
  }
}
