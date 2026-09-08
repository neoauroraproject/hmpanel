import { BadRequestException, Injectable } from '@nestjs/common';
import { hasCapability } from './panel-capability.catalog';
import { PanelDriverRegistry } from './panel-driver.registry';
import type {
  DriverCreateClientInput,
  DriverUpdateClientInput,
  PanelDriver,
} from './panel-driver.types';

/**
 * Thin façade over PanelDriverRegistry. Store/recharge/native sync keep their
 * own registries; this is the Core operation router for panel CRUD.
 */
@Injectable()
export class PanelOperationRouter {
  constructor(private registry: PanelDriverRegistry) {}

  requireDriver(panelType?: string | null): PanelDriver {
    const driver = this.registry.get(panelType);
    if (!driver) {
      throw new BadRequestException(
        `No panel driver for type ${panelType || '3x-ui'}`,
      );
    }
    return driver;
  }

  async createClient(
    panelType: string | null | undefined,
    panelId: string,
    input: DriverCreateClientInput,
  ) {
    if (!hasCapability(panelType, 'USERS')) {
      throw new BadRequestException(
        `Panel type ${panelType || '3x-ui'} cannot provision users`,
      );
    }
    return this.requireDriver(panelType).createClient(panelId, input);
  }

  async updateClient(
    panelType: string | null | undefined,
    panelId: string,
    username: string,
    input: DriverUpdateClientInput,
  ) {
    return this.requireDriver(panelType).updateClient(panelId, username, input);
  }

  async deleteClient(
    panelType: string | null | undefined,
    panelId: string,
    username: string,
  ) {
    return this.requireDriver(panelType).deleteClient(panelId, username);
  }
}
